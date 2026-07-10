const axios = require('axios');
const https = require('https');
const { URLSearchParams } = require('url');

// Your exact original fallback bus list
const BUSES = [
    { name: "Bus 01: Islampur (Dhamrai)", id: "368930", imei: "863051061903687" },
    { name: "Bus 02: Shiya Moszid", id: "367581", imei: "863051061866041" },
    { name: "Bus 03: Rampura Bridge", id: "367582", imei: "863051061865993" },
    { name: "Bus 04: Stop", id: "367584", imei: "863051061875091" },
    { name: "Bus 05: Pubail Station", id: "367585", imei: "863051061778279" },
    { name: "Bus 06: BUFT, Girls Hostel", id: "367586", imei: "863051061741285" },
    { name: "Bus 07: Azampur", id: "367587", imei: "863051061737937" },
    { name: "Bus 08: Azampur", id: "367588", imei: "863051062003073" },
    { name: "Bus 09: Rampura Bridge", id: "367589", imei: "863051062002752" },
    { name: "Bus 10: Stop", id: "367591", imei: "863051062003610" },
    { name: "Bus 11: Mirpur-10", id: "367592", imei: "863051061786785" },
    { name: "Bus 12: Mirpur Commerce College", id: "367593", imei: "863051061778220" },
    { name: "Bus 13: Zirani", id: "367594", imei: "863051062002935" },
    { name: "Bus 14: Gulistan", id: "367596", imei: "863051061475595" }, 
    { name: "Bus 15: Shibbari, Gazipur", id: "367597", imei: "868184062272516" },
    { name: "Bus 16: Mirpur-14 (Via Metro)", id: "367598", imei: "863051061741137" },
    { name: "Bus 17: Newmarket", id: "367599", imei: "868184062144723" },
    { name: "Bus 18: Palli Biduth", id: "367601", imei: "863051061982632" },
    { name: "Bus 23: Kalshi", id: "367602", imei: "863051062003990" },
    { name: "Bus 24: Gazipura-27", id: "367603", imei: "863051061998133" },
    { name: "Bus 25: Kamlapur", id: "367604", imei: "863051061775770" },
    { name: "Bus 26: Shafipur, Gazipur", id: "367605", imei: "863051061778014" },
    { name: "BRTC 01: Azampur", id: "367610", imei: "863051061867940" },
    { name: "BRTC 02: Azampur", id: "367609", imei: "863051062002919" },
    { name: "BRTC 03: Azampur", id: "367611", imei: "863051061786629" },
    { name: "BRTC 04: Azampur", id: "367612", imei: "863051061998075" }
];

const agent = new https.Agent({ rejectUnauthorized: false });

// GLOBAL CACHE (This mimics Render's behavior in Serverless)
let masterFleetCache = [];
let CACHED_COOKIE = "";
let lastScrapeTimestamp = 0;
let dynamicIDs = {}; 

function formatRouteName(str) {
    let titleCased = str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    return titleCased.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
}

async function scrapeAndUpdateIDs() {
    try {
        const res = await axios.get("https://sms.buft.ac.bd/index.php?ctg=tracking", { httpsAgent: agent, timeout: 10000 });
        const html = res.data;
        const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>[\s\S]*?param=([a-zA-Z0-9=]+)/gi;
        
        let match;
        while ((match = rowRegex.exec(html)) !== null) {
            const rawRoute = match[1].replace(/<[^>]*>?/gm, '').trim(); 
            const busNum = match[2].replace(/<[^>]*>?/gm, '').trim();
            const decoded = Buffer.from(match[3].trim(), 'base64').toString('utf-8');
            const newId = decoded.split('&')[0];

            if (busNum && newId) {
                const busMatchString = busNum.toUpperCase().startsWith("BRTC") ? busNum : `Bus ${busNum.padStart(2, '0')}`;
                dynamicIDs[busMatchString] = { id: newId, route: formatRouteName(rawRoute) };
            }
        }
        lastScrapeTimestamp = Date.now();
    } catch (e) {
        console.error("Scraper Failed");
    }
}

async function getCookie(activeFleet) {
    if (CACHED_COOKIE) return CACHED_COOKIE;
    try {
        let activeBusId = activeFleet[0].id; 
        const updatedBus = activeFleet.find(b => b.id !== "367581" && b.id !== "368930");
        if (updatedBus) activeBusId = updatedBus.id;

        const activeParam = Buffer.from(activeBusId + "&Bus&EN").toString('base64');
        const res = await axios.get(`https://app.bongoiot.com/jsp/quickview.jsp?param=${activeParam}`, { httpsAgent: agent, timeout: 10000 });
        
        const rawCookies = res.headers['set-cookie'];
        if (rawCookies) {
            CACHED_COOKIE = rawCookies.map(c => c.split(';')[0]).join('; ');
            return CACHED_COOKIE;
        }
    } catch (e) {
        console.error("Cookie Fetch Failed");
    }
    return "JSESSIONID=dummy"; 
}

module.exports = async (req, res) => {
    // Vercel Serverless CORS Setup
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const now = Date.now();

        // 1. Refresh IDs only if cache is empty or older than 3 hours
        if (Object.keys(dynamicIDs).length === 0 || now - lastScrapeTimestamp > 10800000) {
            await scrapeAndUpdateIDs();
        }

        // Apply dynamic IDs
        const activeFleet = BUSES.map(bus => {
            const busMatchString = bus.name.split(':')[0];
            if (dynamicIDs[busMatchString]) {
                return { ...bus, id: dynamicIDs[busMatchString].id, name: `${busMatchString}: ${dynamicIDs[busMatchString].route}` };
            }
            return bus;
        });

        // 2. Get/Renew Cookie
        const cookie = await getCookie(activeFleet);

        // 3. Fetch Data Concurrently using YOUR URLSearchParams logic
        const fetchPromises = activeFleet.map(async (bus) => {
            const formData = new URLSearchParams();
            formData.append('user_id', '195425'); formData.append('project_id', '37');
            formData.append('javaclassmethodname', 'getVehicleStatus'); formData.append('javaclassname', 'com.uffizio.tools.projectmanager.GenerateJSONAjax');
            formData.append('userDateTimeFormat', 'dd-MM-yyyy hh:mm:ss a'); formData.append('timezone', '-360');
            formData.append('lInActiveTolrance', '0'); formData.append('link_id', bus.id);
            formData.append('sImeiNo', bus.imei); formData.append('vehicleType', 'Bus');

            try {
                const response = await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", formData.toString(), {
                    httpsAgent: agent,
                    timeout: 8000,
                    headers: { 
                        "Cookie": cookie, 
                        "Content-Type": "application/x-www-form-urlencoded",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" 
                    }
                });

                if (typeof response.data === 'string') {
                    let data;
                    try { data = new Function("return " + response.data)(); } catch(e) { return null; }
                    
                    if (data && data.root && data.root[0] && data.root[0][0]) {
                        const info = data.root[0][0];
                        let dName = "--", dPhone = "--";
                        if (info.driver_json) {
                            try {
                                const dObj = typeof info.driver_json === 'string' ? JSON.parse(info.driver_json.replace(/'/g, '"')) : info.driver_json;
                                dName = dObj.name || "--"; dPhone = dObj.mobile_no || "--";
                            } catch(e){}
                        }
                        
                        return {
                            id: bus.id, name: bus.name, 
                            lat: parseFloat(info.latitude) || 0, lng: parseFloat(info.longitude) || 0,
                            speed: parseFloat(info.speed) || 0, status: info.sts || "Unknown",
                            since: info.since || "--", updated: info.data_inserted_time,
                            driver: dName, phone: dPhone, course: parseInt(info.angle) || 0,
                            address: info.location || "Moving..."
                        };
                    }
                }
                return null;
            } catch (err) { return null; }
        });

        const results = await Promise.all(fetchPromises);
        const cleanData = results.filter(b => b !== null); 
        
        // Update Cache if data is good, otherwise clear dead cookie
        if (cleanData.length > 0) {
            masterFleetCache = cleanData;
        } else if (masterFleetCache.length === 0) {
            CACHED_COOKIE = ""; 
        }
        
        // Return whatever is in cache (prevents blank maps if one request times out)
        return res.status(200).json(masterFleetCache.length > 0 ? masterFleetCache : cleanData);

    } catch (globalError) {
        return res.status(500).json(masterFleetCache); // Fallback to cache on hard crash
    }
};

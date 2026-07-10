const https = require('https');

// Bus list with fallback IDs and IMEIs
const BUSES = [
    { name: "Bus 01: Islampur (Dhamrai)", id: "368930", imei: "863051061903687" },
    { name: "Bus 02: Shiya Moszid", id: "367581", imei: "863051061866041" },
    { name: "Bus 03: Rampura Bridge", id: "367582", imei: "863051061865993" },
    { name: "Bus 04: Signboard", id: "367584", imei: "863051061866017" },
    { name: "Bus 05: Mirpur 10", id: "367586", imei: "863051061476312" },
    { name: "Bus 06: Mirpur 01", id: "367587", imei: "863051061483862" },
    { name: "Bus 07: ECB Chattor", id: "367588", imei: "863051061868039" },
    { name: "Bus 08: Narayanganj", id: "367589", imei: "863051061867957" },
    { name: "Bus 09: Savar", id: "367590", imei: "863051061866579" },
    { name: "Bus 10: Baipal", id: "367591", imei: "863051061868013" },
    { name: "Bus 11: Gazipur", id: "367592", imei: "863051061865910" },
    { name: "Bus 12: Abdullahpur", id: "367594", imei: "863051061867965" },
    { name: "Bus 13: Chandra", id: "367595", imei: "863051061866561" },
    { name: "Bus 14: Gulistan", id: "367596", imei: "863051061475595" },
    { name: "BRTC 01: Azampur", id: "367610", imei: "863051061867940" },
    { name: "BRTC 02: Abdullapur", id: "367611", imei: "863051061865894" }
];

// Helper to handle HTTPS requests inside serverless environments
const agent = new https.Agent({ rejectUnauthorized: false });

function makeRequest(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        options.agent = agent;
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// 1. Scrape Live IDs from BUFT Portal
async function scrapeLiveIDs() {
    try {
        const response = await makeRequest('https://sms.buft.ac.bd/index.php?ctg=tracking');
        const html = response.body;
        const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>[\s\S]*?param=([a-zA-Z0-9=]+)/gi;
        
        let match;
        const updatedMap = {};

        while ((match = rowRegex.exec(html)) !== null) {
            const busNum = match[2].replace(/<[^>]*>?/gm, '').trim();
            const decoded = Buffer.from(match[3].trim(), 'base64').toString('utf-8');
            const newId = decoded.split('&')[0];
            
            if (busNum && newId) {
                updatedMap[busNum] = newId;
            }
        }
        return updatedMap;
    } catch (e) {
        console.error("Scraping failed, reverting to default IDs:", e.message);
        return {};
    }
}

// 2. Fetch Active Session Cookie from BongoIoT
async function fetchSessionCookie(targetBusId) {
    try {
        const param = Buffer.from(`${targetBusId}&Bus&EN`).toString('base64');
        const url = `https://app.bongoiot.com/jsp/quickview.jsp?param=${param}`;
        const response = await makeRequest(url);
        
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
            return setCookie[0].split(';')[0];
        }
    } catch (e) {
        console.error("Cookie generation failed:", e.message);
    }
    return null;
}

// Main Vercel Serverless Handler
module.exports = async (req, res) => {
    // Enable CORS so your GitHub Pages frontend can access this data
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Step 1: Scrape live web IDs
        const dynamicIDs = await scrapeLiveIDs();
        
        // Update local configuration with freshly scraped IDs
        const activeFleet = BUSES.map(bus => {
            const busNumberOnly = bus.name.match(/Bus\s*(\d+)/i)?.[1] || bus.name.match(/BRTC\s*(\d+)/i)?.[0];
            if (busNumberOnly && dynamicIDs[busNumberOnly]) {
                return { ...bus, id: dynamicIDs[busNumberOnly] };
            }
            return bus;
        });

        // Step 2: Grab working authentication cookie
        const sessionCookie = await fetchSessionCookie(activeFleet[0].id) || "JSESSIONID=dummy_fallback_cookie";

        // Step 3: Run parallel requests to fetch real-time fleet details
        const trackingPromises = activeFleet.map(async (bus) => {
            const postBody = new URLSearchParams({
                user_id: '195425',
                project_id: '37',
                javaclassmethodname: 'getVehicleStatus',
                javaclassname: 'com.uffizio.tools.projectmanager.GenerateJSONAjax',
                userDateTimeFormat: 'dd-MM-yyyy hh:mm:ss a',
                timezone: '-360',
                lInActiveTolrance: '0',
                link_id: bus.id,
                sImeiNo: bus.imei,
                vehicleType: 'Bus'
            }).toString();

            try {
                const apiResponse = await makeRequest('https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Cookie': sessionCookie
                    }
                }, postBody);

                const parsed = JSON.parse(apiResponse.body);
                const status = parsed.VehicleStatus?.[0] || {};

                return {
                    name: bus.name,
                    lat: parseFloat(status.latitude) || null,
                    lng: parseFloat(status.longitude) || null,
                    speed: parseFloat(status.speed) || 0,
                    lastUpdate: status.dateTime || "Offline",
                    status: status.engineStatus || "Unknown"
                };
            } catch (err) {
                return { name: bus.name, error: "Failed to connect to tracker backend" };
            }
        });

        const fleetStatus = await Promise.all(trackingPromises);
        
        // Return structured dashboard data back to frontend
        res.status(200).json(fleetStatus);

    } catch (globalError) {
        res.status(500).json([]);
    }
};

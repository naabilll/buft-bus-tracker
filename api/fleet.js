const axios = require('axios');
const https = require('https');

// Your exact original bus list
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

module.exports = async (req, res) => {
    // Vercel Serverless CORS Setup
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // --- 1. GET COOKIE ---
        let sessionCookie = "JSESSIONID=dummy";
        try {
            const activeBusId = BUSES[0].id; 
            const activeParam = Buffer.from(activeBusId + "&Bus&EN").toString('base64');
            const cookieRes = await axios.get(`https://app.bongoiot.com/jsp/quickview.jsp?param=${activeParam}`, { httpsAgent: agent });
            const rawCookies = cookieRes.headers['set-cookie'];
            if (rawCookies) {
                sessionCookie = rawCookies.map(c => c.split(';')[0]).join('; ');
            }
        } catch (e) {
            console.error("Cookie Fetch Failed");
        }

        // --- 2. FETCH TRACKING DATA (YOUR EXACT ORIGINAL LOGIC) ---
        const fetchPromises = BUSES.map(async (bus) => {
            const postData = `user_id=195425&project_id=37&javaclassmethodname=getVehicleStatus&javaclassname=com.uffizio.tools.projectmanager.GenerateJSONAjax&userDateTimeFormat=dd-MM-yyyy+hh%3Amm%3Ass+a&timezone=-360&lInActiveTolrance=0&link_id=${bus.id}&sImeiNo=${bus.imei}&vehicleType=Bus`;
            
            try {
                const response = await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", postData, {
                    httpsAgent: agent, 
                    headers: { "Cookie": sessionCookie, "Content-Type": "application/x-www-form-urlencoded" }
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
                            id: bus.id, 
                            name: bus.name, 
                            lat: parseFloat(info.latitude) || 0, 
                            lng: parseFloat(info.longitude) || 0,
                            speed: parseFloat(info.speed) || 0, 
                            status: info.sts || "Unknown",
                            since: info.since || "--", 
                            updated: info.data_inserted_time,
                            driver: dName, 
                            phone: dPhone, 
                            course: parseInt(info.angle) || 0,
                            address: info.location || "Moving..."
                        };
                    }
                }
                return null;
            } catch (err) {
                return null;
            }
        });

        const results = await Promise.all(fetchPromises);
        const cleanData = results.filter(b => b !== null); 
        
        res.status(200).json(cleanData);

    } catch (globalError) {
        res.status(500).json([]);
    }
};

const axios = require('axios');

// Your exact original bus list
const activeFleet = [
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

async function fetchSessionCookie(targetBusId) {
    try {
        const param = Buffer.from(`${targetBusId}&Bus&EN`).toString('base64');
        const url = `https://app.bongoiot.com/jsp/quickview.jsp?param=${param}`;
        const response = await axios.get(url);
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
            return setCookie[0].split(';')[0];
        }
    } catch (e) {
        console.error("Cookie generation failed:", e.message);
    }
    return null;
}

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
        let dynamicIDs = {};
        try {
            const htmlResponse = await axios.get('https://sms.buft.ac.bd/index.php?ctg=tracking');
            const html = htmlResponse.data;
            const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>[\s\S]*?param=([a-zA-Z0-9=]+)/gi;
            
            let match;
            while ((match = rowRegex.exec(html)) !== null) {
                const busNum = match[2].replace(/<[^>]*>?/gm, '').trim();
                const decoded = Buffer.from(match[3].trim(), 'base64').toString('utf-8');
                const newId = decoded.split('&')[0];
                
                if (busNum && newId) {
                    dynamicIDs[busNum] = newId;
                }
            }
        } catch (scrapeErr) { }

        const mergedFleet = activeFleet.map(bus => {
            const busNumberOnly = bus.name.match(/Bus\s*(\d+)/i)?.[1] || bus.name.match(/BRTC\s*(\d+)/i)?.[0];
            if (busNumberOnly && dynamicIDs[busNumberOnly]) {
                return { ...bus, id: dynamicIDs[busNumberOnly] };
            }
            return bus;
        });

        const sessionCookie = await fetchSessionCookie(mergedFleet[0].id) || "JSESSIONID=dummy";

        const trackingPromises = mergedFleet.map(async (bus) => {
            // YOUR EXACT ORIGINAL POST DATA STRING - Do not change this encoding!
            const postData = `user_id=195425&project_id=37&javaclassmethodname=getVehicleStatus&javaclassname=com.uffizio.tools.projectmanager.GenerateJSONAjax&userDateTimeFormat=dd-MM-yyyy+hh%3Amm%3Ass+a&timezone=-360&lInActiveTolrance=0&link_id=${bus.id}&sImeiNo=${bus.imei}&vehicleType=Bus`;
            
            try {
                const apiResponse = await axios.post('https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus', postData, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Cookie': sessionCookie
                    }
                });

                const status = apiResponse.data.VehicleStatus?.[0] || {};
                
                return {
                    id: bus.id,
                    name: bus.name,
                    lat: parseFloat(status.latitude) || 0,
                    lng: parseFloat(status.longitude) || 0,
                    speed: parseFloat(status.speed) || 0,
                    updated: status.dateTime || "Offline",
                    status: status.engineStatus || "Unknown",
                    course: parseFloat(status.course) || 0,
                    address: status.address || "",
                    driver: status.driverName || "",
                    phone: status.driverMobileNo || "",
                    since: status.since || ""
                };
            } catch (err) {
                return { id: bus.id, name: bus.name, lat: 0, lng: 0, status: "Unknown", updated: "Error" };
            }
        });

        const fleetStatus = await Promise.all(trackingPromises);
        
        // Return exactly as a raw array
        res.status(200).json(fleetStatus);

    } catch (globalError) {
        res.status(500).json([]);
    }
};

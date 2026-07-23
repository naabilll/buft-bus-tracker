// Zoom control natively disabled to use custom buttons
        const map = L.map('map', {zoomControl: false, attributionControl: false}).setView([23.8741, 90.3992], 12);
        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'] }).addTo(map);

        // --- BUFT LOGO MARKER ---
        const buftIcon = L.icon({
            iconUrl: 'buftlogo.png',
            iconSize: [35, 50], // Compressed from the sides (narrower width)
            iconAnchor: [17, 25],
            popupAnchor: [0, -25]
        });
        // Using the predefined BUFT_LAT and BUFT_LNG which point to the actual building
        L.marker([23.884750, 90.361350], {icon: buftIcon}).addTo(map)
         .bindPopup("<div style='text-align:center; font-weight:900; font-family:Outfit; font-size:16px; color:#2563eb; width: 180px;'>BGMEA University of Fashion & Technology (BUFT)</div>");
        
        // --- TILE LAYER MANAGEMENT (TRAFFIC & SATELLITE) ---
        let isTrafficOn = false;
        let isSatelliteOn = false;

        function updateMapLayer() {
            map.eachLayer((layer) => {
                if (layer instanceof L.TileLayer) {
                    map.removeLayer(layer);
                }
            });
            let baseLyrs = isSatelliteOn ? 'y' : 'm'; // 'y' is Hybrid Satellite, 'm' is Standard Map
            let finalLyrs = isTrafficOn ? (baseLyrs + ',traffic') : baseLyrs;
            L.tileLayer(`https://{s}.google.com/vt/lyrs=${finalLyrs}&x={x}&y={y}&z={z}`, { maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'] }).addTo(map);
        }

        function toggleMapTraffic() {
            const btn = document.getElementById('traffic-toggle-btn');
            isTrafficOn = !isTrafficOn;
            btn.classList.toggle('traffic-active', isTrafficOn);
            updateMapLayer();
        }

        function toggleSatelliteView() {
            const btn = document.getElementById('satellite-toggle-btn');
            isSatelliteOn = !isSatelliteOn;
            btn.classList.toggle('satellite-active', isSatelliteOn);
            updateMapLayer();
        }

        // --- ROUTING LOGIC (GOOGLE MAPS EMBED MODAL) ---
        const BUFT_LAT = 23.884750; 
        const BUFT_LNG = 90.361350; 

        function openEmbedModal(startLat, startLng, destLat, destLng, title) {
            document.getElementById('embed-modal-title').innerText = title;
            const iframe = document.getElementById('embed-iframe');
            iframe.src = `https://maps.google.com/maps?saddr=${startLat},${startLng}&daddr=${destLat},${destLng}&output=embed`;
            document.getElementById('embed-modal-overlay').style.display = 'flex';
        }

        window.closeEmbedModal = function() {
            document.getElementById('embed-modal-overlay').style.display = 'none';
            document.getElementById('embed-iframe').src = "";
        }

        // 1: Route from User to Bus (Walking)
        window.getDirectionsToBus = function(busId, destLat, destLng) {
            if (!userMarker) {
                alert("Please tap 'Locate Me' first to get directions from your position.");
                findUser();
                return;
            }
            map.closePopup();
            const startLat = userMarker.getLatLng().lat;
            const startLng = userMarker.getLatLng().lng;
            openEmbedModal(startLat, startLng, destLat, destLng, "🚶 Walking to Bus");
        }

        // 2: Route from Bus to University (Driving)
        window.getDirectionsToUni = function(busId, busLat, busLng) {
            map.closePopup();
            openEmbedModal(busLat, busLng, BUFT_LAT, BUFT_LNG, "🚍 Bus to University");
        }

        const SERVER = "https://bus-server-lr2x.onrender.com"; 

        // UNIQUE USER ID FOR TROLL PREVENTION
        let localUserId = localStorage.getItem('buft_user_id');
        if (!localUserId) {
            localUserId = Math.random().toString(36).substring(2, 15);
            localStorage.setItem('buft_user_id', localUserId);
        }

        let globalFleetData = [];
        let mapMarkersObj = {}; 
        let previousBusData = {}; // OPTIMIZATION: Track previous bus state
        let userMarker = null;
        let isSidebarBuilt = false;
        let popupTimerInterval = null; 
        
        let maintenanceTimer = null; 
        
        let noActiveBusTimer = null;
        let telegramAlertSent = false;

        function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
        function toggleAbout() { const box = document.getElementById('about-box'); box.style.display = (box.style.display === "block") ? "none" : "block"; }
        
        function toggleWhatsNew() {
            const content = document.getElementById('whats-new-content');
            const icon = document.getElementById('whats-new-icon');
            if (content.style.display === 'block') {
                content.style.display = 'none'; icon.innerText = '▼';
            } else {
                content.style.display = 'block'; icon.innerText = '▲';
            }
        }
        
        function filterSidebar() {
            const query = document.getElementById('search-box').value.toLowerCase();
            const rows = document.querySelectorAll('.sidebar-bus-row');
            rows.forEach(row => {
                if (row.getAttribute('data-name').includes(query)) row.style.display = "flex";
                else row.style.display = "none";
            });
        }

        // --- DARK MODE LOGIC ---
        if(localStorage.getItem('darkMode') === '1') {
            document.body.classList.add('dark-mode');
            document.getElementById('dark-mode-toggle').checked = true;
        }
        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDark ? '1' : '0');
            document.getElementById('dark-mode-toggle').checked = isDark;
        }

        function focusBus(id) {
            if (mapMarkersObj[id]) { 
                const marker = mapMarkersObj[id]; 
                map.flyTo(marker.getLatLng(), 15); 
                marker.openPopup(); 
                toggleSidebar(); 
            } else { alert("Bus position not yet found. Please wait."); }
        }

        function getBusSVG(color) {
            return `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 240">
                <rect x="15" y="15" width="70" height="210" rx="12" fill="${color}" stroke="#ffffff" stroke-width="6"/>
                <path d="M 25 15 L 75 15 L 75 22 Q 50 28 25 22 Z" fill="#1e293b"/>
                <path d="M20 35 Q50 20 80 35 L80 60 Q50 50 20 60 Z" fill="#334155"/>
                <rect x="25" y="205" width="50" height="10" rx="2" fill="#334155"/>
                <rect x="30" y="90" width="40" height="30" rx="4" fill="rgba(255,255,255,0.4)"/>
                <rect x="30" y="140" width="40" height="30" rx="4" fill="rgba(255,255,255,0.4)"/>
                <path d="M15 45 L5 40 L5 60 L15 55 Z" fill="${color}" stroke="white" stroke-width="3"/>
                <path d="M85 45 L95 40 L95 60 L85 55 Z" fill="${color}" stroke="white" stroke-width="3"/>
            </svg>`;
        }

        let watchId = null;
        let orientationHandler = null;
        let currentRotation = 0; 
        
        function getContinuousAngle(newAngle) {
            let diff = newAngle - (currentRotation % 360);
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            currentRotation += diff;
            return currentRotation;
        }

        function handleOrientation(event) {
            let compassHeading = null;
            if (event.webkitCompassHeading) {
                compassHeading = event.webkitCompassHeading;
            } else if (event.absolute !== false && event.alpha !== null) {
                compassHeading = 360 - event.alpha; 
            }

            if (compassHeading !== null) {
                const wrapper = document.getElementById('user-direction-wrapper');
                const beam = document.getElementById('user-direction-beam');
                if (wrapper && beam) {
                    beam.style.display = 'block'; 
                    let smoothAngle = getContinuousAngle(compassHeading);
                    wrapper.style.transition = "transform 0.15s ease-out";
                    wrapper.style.transform = `rotate(${smoothAngle}deg)`;
                }
            }
        }

        function submitCapacityReport(busId, btnElement, voteType) {
            if (!navigator.geolocation) { alert("GPS is required to verify you are on the bus."); return; }
            
            const originalText = btnElement.innerText;
            btnElement.innerText = "📍 Verifying...";
            btnElement.style.opacity = "0.7";
            btnElement.disabled = true;

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        const payload = {
                            busId: busId,
                            userLat: position.coords.latitude,
                            userLng: position.coords.longitude,
                            userId: localUserId,
                            voteType: voteType
                        };

                        const response = await fetch(`${SERVER}/report-capacity`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        const result = await response.json();
                        
                        if (result.success) {
                            btnElement.innerText = voteType === 'full' ? "✅ Marked as Full" : "✅ Marked Not Full";
                            btnElement.style.background = "#22c55e";
                        } else {
                            alert(result.message);
                            btnElement.innerText = originalText;
                            btnElement.style.opacity = "1";
                            btnElement.disabled = false;
                        }
                    } catch (error) {
                        alert("Network error. Could not send report.");
                        btnElement.innerText = originalText;
                        btnElement.style.opacity = "1";
                        btnElement.disabled = false;
                    }
                }, 
                () => { 
                    alert("You must allow Location access to report a bus."); 
                    btnElement.innerText = originalText;
                    btnElement.style.opacity = "1";
                    btnElement.disabled = false;
                }, 
                { enableHighAccuracy: true, maximumAge: 0 }
            );
        }

        function findUser() {
            if (!navigator.geolocation) { alert("GPS not supported."); return; }
            const dashBtn = document.querySelector('.loc-btn');
            const targetIcon = document.getElementById('locate-icon-target');
            const compassIcon = document.getElementById('locate-icon-compass');
            
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
                if (orientationHandler) {
                    window.removeEventListener('deviceorientationabsolute', orientationHandler);
                    window.removeEventListener('deviceorientation', orientationHandler);
                    orientationHandler = null;
                }
                if(userMarker) { map.removeLayer(userMarker); userMarker = null; }
                
                dashBtn.innerHTML = "<span>📍</span> Locate Me";
                dashBtn.style.background = "#2563eb"; 
                if(targetIcon) targetIcon.style.display = 'block';
                if(compassIcon) compassIcon.style.display = 'none';
                return;
            }

            dashBtn.innerHTML = "📡 Connecting GPS...";
            if(targetIcon) targetIcon.style.display = 'none';
            if(compassIcon) compassIcon.style.display = 'block';
            
            const blueIconHtml = `
            <div id="user-direction-wrapper" style="position:relative; width:16px; height:16px;">
                <div id="user-direction-beam" style="
                    position: absolute; width: 120px; height: 120px; top: -105px; left: -52px;
                    background: radial-gradient(circle at 50% 100%, rgba(37, 99, 235, 0.6) 0%, rgba(37, 99, 235, 0) 70%);
                    clip-path: polygon(50% 100%, 0% 0, 100% 0); display: none;">
                </div>
                <div class="user-loc-dot"></div>
            </div>`;

            const blueIcon = L.divIcon({
                className: 'custom-user-dot',
                html: blueIconHtml,
                iconSize: [16, 16], iconAnchor: [8, 8]
            });

            watchId = navigator.geolocation.watchPosition(position => {
                const lat = position.coords.latitude; 
                const lng = position.coords.longitude;

                if (userMarker) {
                    userMarker.setLatLng([lat, lng]); 
                } else {
                    userMarker = L.marker([lat, lng], {icon: blueIcon}).addTo(map); 
                    map.setView([lat, lng], 16); 
                    
                    orientationHandler = handleOrientation;
                    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                        DeviceOrientationEvent.requestPermission().then(permissionState => {
                            if (permissionState === 'granted') { window.addEventListener('deviceorientation', orientationHandler); }
                        }).catch(console.error);
                    } else {
                        window.addEventListener('deviceorientationabsolute', orientationHandler);
                        window.addEventListener('deviceorientation', orientationHandler); 
                    }
                }
                
                dashBtn.innerHTML = "<span>🎯</span> Tracking Active";
                dashBtn.style.background = "#10b981"; 
            }, () => { 
                alert("Location denied."); 
                dashBtn.innerHTML = "❌ Denied"; 
                dashBtn.style.background = "#ef4444";
                if(targetIcon) targetIcon.style.display = 'block';
                if(compassIcon) compassIcon.style.display = 'none';
            }, { enableHighAccuracy: true, maximumAge: 0 }); 
        }

        function fixTime(timeStr) {
            if (!timeStr || timeStr === "--") return "--";
            try {
                const parts = timeStr.split(/[- :]/); 
                if (parts.length < 6) return timeStr;

                let day = parseInt(parts[0]);
                let month = parseInt(parts[1]) - 1; 
                let year = parseInt(parts[2]);
                let hours = parseInt(parts[3]);
                let minutes = parseInt(parts[4]);
                let seconds = parseInt(parts[5]);
                let ampm = parts[6];

                if (ampm === "PM" && hours < 12) hours += 12;
                if (ampm === "AM" && hours === 12) hours = 0;

                let date = new Date(year, month, day, hours, minutes, seconds);
                date.setHours(date.getHours() + 1);

                let h = date.getHours();
                const a = h >= 12 ? 'PM' : 'AM';
                h = h % 12;
                h = h ? h : 12; 
                let m = date.getMinutes().toString().padStart(2, '0');
                let s = date.getSeconds().toString().padStart(2, '0');
                let d = date.getDate().toString().padStart(2, '0');
                let mo = (date.getMonth() + 1).toString().padStart(2, '0');
                let yStr = date.getFullYear();

                return `${d}-${mo}-${yStr} ${h}:${m}:${s} ${a}`;
            } catch(e) {
                return timeStr; 
            }
        }

        // ─── OPUS POPUP LOGIC ───
        const EN_TO_BN = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
        function toBengaliNum(n) {
            return String(n).replace(/\d/g, d => EN_TO_BN[+d]);
        }

        let wakeupCountInterval = null;
        let wakeupSecondsLeft   = 50;
        const WAKEUP_DURATION   = 50; 

        function showWakeupScreen() {
            const overlay  = document.getElementById('server-wakeup-overlay');
            const display  = document.getElementById('wakeup-countdown');
            const progress = document.getElementById('wakeup-progress');
            
            document.getElementById('maintenance-notice').style.display = 'none';

            if (!overlay || overlay.style.display === 'flex') return; 

            wakeupSecondsLeft = WAKEUP_DURATION;
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex';

            display.textContent   = toBengaliNum(wakeupSecondsLeft);
            progress.style.width  = '100%';

            clearInterval(wakeupCountInterval);
            wakeupCountInterval = setInterval(() => {
                wakeupSecondsLeft = Math.max(0, wakeupSecondsLeft - 1);

                display.style.opacity = '0';
                setTimeout(() => {
                    display.textContent = toBengaliNum(wakeupSecondsLeft);
                    display.style.opacity = '1';
                }, 100);

                const pct = (wakeupSecondsLeft / WAKEUP_DURATION) * 100;
                progress.style.width = pct + '%';

                if (wakeupSecondsLeft <= 0) {
                    clearInterval(wakeupCountInterval);
                }
            }, 1000);
        }

        function closeWakeupScreen() {
            const overlay = document.getElementById('server-wakeup-overlay');
            if (!overlay) return;
            clearInterval(wakeupCountInterval);
            overlay.classList.add('hidden');
            setTimeout(() => { overlay.style.display = 'none'; }, 500);
        }

        // ─── FETCH TRIGGER LOGIC ───
        async function fetchFleet() {
            const statusEl = document.getElementById('status-text');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); 

            try {
                const res = await fetch(`${SERVER}/fleet`, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (!res.ok) throw new Error("Server error");
                const fleet = await res.json();
                
                closeWakeupScreen(); 
                
                const hasValidData = fleet.some(bus => bus.lat > 0 && bus.lng > 0);

                if (hasValidData) {
                    clearTimeout(maintenanceTimer);
                    maintenanceTimer = null;
                    document.getElementById('maintenance-notice').style.display = 'none'; 
                } else {
                    if (!maintenanceTimer && !isNightTime() && document.getElementById('maintenance-notice').style.display !== 'block') {
                        maintenanceTimer = setTimeout(() => {
                            document.getElementById('maintenance-notice').style.display = 'block';
                        }, 8000); 
                    }
                }
                
                globalFleetData = fleet;

                let activeCount = 0;
                const listContainer = document.getElementById('bus-list-container');

                if (!isSidebarBuilt && fleet.length > 0) {
                    listContainer.innerHTML = ""; 
                }

                fleet.forEach(bus => {
                    let busColor = '#94a3b8'; 
                    let badgeBg = '#f1f5f9';
                    let dotColor = '#ccc';

                    if (bus.status === "Running") {
                        busColor = bus.speed > 40 ? '#a855f7' : '#22c55e'; 
                        badgeBg = bus.speed > 40 ? '#f3e8ff' : '#dcfce7';
                        dotColor = busColor;
                        activeCount++;
                    } else if (bus.status === "Stopped") {
                        busColor = '#ef4444'; 
                        badgeBg = '#fee2e2';
                        dotColor = busColor;
                        activeCount++;
                    } else if (bus.status === "Idle") {
                        busColor = '#f59e0b'; 
                        badgeBg = '#fef3c7';
                        dotColor = busColor;
                        activeCount++;
                    }

                    if (!isSidebarBuilt) {
                        const item = document.createElement('div');
                        item.className = 'bus-list-item sidebar-bus-row';
                        item.setAttribute('data-name', bus.name.toLowerCase());
                        item.innerHTML = `<div class="bus-name">${bus.name}</div><div class="right-group"><div class="status-dot" id="dot-${bus.id}"></div></div>`;
                        item.onclick = () => focusBus(bus.id);
                        listContainer.appendChild(item);
                    }

                    const dot = document.getElementById(`dot-${bus.id}`);
                    if (dot) {
                        if (bus.status !== "Inactive" && bus.status !== "Unknown") {
                            dot.classList.add('active');
                            dot.style.background = dotColor;
                            dot.style.boxShadow = `0 0 5px ${dotColor}`;
                        } else {
                            dot.classList.remove('active');
                            dot.style.background = '#ccc';
                            dot.style.boxShadow = 'none';
                        }
                    }

                    if (bus.lat > 0 && bus.lng > 0) {
                        
                        // PERFORMANCE OPTIMIZATION: Skip DOM & SVG rebuild if data is identical
                        const newBusStateStr = JSON.stringify(bus);
                        if (previousBusData[bus.id] === newBusStateStr) {
                            return; 
                        }
                        previousBusData[bus.id] = newBusStateStr;

                        let formattedSince = bus.since || "--";
                        if (formattedSince.includes(":")) {
                            formattedSince = formattedSince.replace(":", "h ") + "m";
                        }
                        let durationText = bus.status === 'Inactive' ? `Inactive for ${formattedSince}` : `Since ${formattedSince}`;
                        
                        let driverName = bus.driver || "--";
                        let mobileNo = bus.phone || "--";

                        let capacityBadgeHtml = '';
                        let capacityWarningHtml = '';
                        if (bus.capacityStatus === 'Full') {
                            capacityBadgeHtml = `<div class="capacity-map-badge">FULL</div>`;
                            capacityWarningHtml = `<div style="background:#fee2e2; color:#b91c1c; padding:8px; border-radius:8px; font-size:12px; font-weight:800; text-align:center; margin-bottom:10px; border:1px solid #fca5a5;">⚠️ BUS REPORTED FULL</div>`;
                        } else if (bus.capacityStatus === 'Maybe Full') {
                            capacityBadgeHtml = `<div class="capacity-map-badge maybe">MOSTLY FULL</div>`;
                            capacityWarningHtml = `<div style="background:#ffedd5; color:#c2410c; padding:8px; border-radius:8px; font-size:12px; font-weight:800; text-align:center; margin-bottom:10px; border:1px solid #fdba74;">⚠️ BUS ALMOST FULL</div>`;
                        }

                        // INJECTED ROUTING HTML
                        let routingButtonsHtml = `
                        <div style="display:flex; gap:6px; margin-bottom:8px;">
                            <button class="report-btn" style="background:#2563eb; flex:1; padding:6px; font-size:11px; margin:0;" onclick="getDirectionsToBus('${bus.id}', ${bus.lat}, ${bus.lng})">
                                📍 Catch Bus
                            </button>
                            <button class="report-btn" style="background:#10b981; flex:1; padding:6px; font-size:11px; margin:0;" onclick="getDirectionsToUni('${bus.id}', ${bus.lat}, ${bus.lng})">
                                🎓 Route to BUFT
                            </button>
                        </div>`;

                        let reportButtonsHtml = '';
                        if (bus.capacityStatus === 'Full' || bus.capacityStatus === 'Maybe Full') {
                            reportButtonsHtml = `
                            <div class="report-actions" style="display:flex; gap:6px; margin-top:0;">
                                <button class="report-btn" style="flex:1; padding:6px; font-size:11px; margin:0;" onclick="submitCapacityReport('${bus.id}', this, 'full')">📈 Full</button>
                                <button class="report-btn unreport-btn" style="flex:1; padding:6px; font-size:11px; margin:0;" onclick="submitCapacityReport('${bus.id}', this, 'not-full')">📉 Not Full</button>
                            </div>`;
                        } else {
                            reportButtonsHtml = `
                            <button class="report-btn" style="width:100%; padding:6px; font-size:11px; margin:0;" onclick="submitCapacityReport('${bus.id}', this, 'full')">🚌 Report Bus as Full</button>`;
                        }

                        const popup = `
                            <div class="custom-popup" style="font-family: 'Outfit', sans-serif;">
                                <div style="background:${busColor}; padding:10px 12px; border-radius:12px 12px 0 0; color:white; font-weight:700; font-size:14px; display:flex; justify-content:space-between; align-items:center;">
                                    <span>🚍 ${bus.name}</span>
                                </div>
                                <div style="padding:12px;">
                                    ${capacityWarningHtml}
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                        <span style="background:${badgeBg}; color:${busColor}; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:800;">${bus.status}</span>
                                        <span style="font-size:11px; font-weight:700; color:#64748b;">⏳ ${durationText}</span>
                                    </div>

                                    <div class="info-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:6px; background:#f8fafc; padding:8px; border-radius:8px; margin-bottom:10px; border:1px solid #e2e8f0;">
                                        <div style="grid-column:1/-1; font-size:12px; display:flex; align-items:center; gap:6px;">
                                            <span>👤</span> <b style="color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${driverName}</b>
                                        </div>
                                        <div style="font-size:11px; display:flex; align-items:center; gap:6px;">
                                            <span>📞</span> <a href="tel:${mobileNo}" style="color:#3b82f6; text-decoration:none; font-weight:700;">${mobileNo}</a>
                                        </div>
                                        <div style="font-size:11px; display:flex; align-items:center; gap:6px;">
                                            <span>🚀</span> <b style="color:#ef4444;">${bus.speed} km/h</b>
                                        </div>
                                    </div>

                                    <div class="address-text" style="font-size:11px; color:#475569; display:flex; align-items:flex-start; gap:6px; margin-bottom:10px; line-height:1.3;">
                                        <span style="margin-top:1px;">📍</span> <span>${bus.address}</span>
                                    </div>

                                    <div style="font-size:9px; color:#94a3b8; text-align:right; margin-bottom:10px;">Updated: ${fixTime(bus.updated)}</div>
                                    
                                    <div style="display:flex; flex-direction:column; gap:6px;">
                                        <a href="https://app.bongoiot.com/jsp/quickview.jsp?param=${btoa(bus.id + "&Bus&EN")}" target="_blank" style="display:block; text-align:center; background:#e2e8f0; color:#0f172a; padding:6px; border-radius:8px; text-decoration:none; font-weight:700; font-size:11px;">🔗 Open Full Live Tracker</a>
                                        ${routingButtonsHtml}
                                        ${reportButtonsHtml}
                                    </div>
                                </div>
                            </div>`;
                        
                        const svgString = getBusSVG(busColor);
                        const busImgSrc = "data:image/svg+xml;base64," + btoa(svgString);

                        let mapLabelText = "";
                        if (bus.name.startsWith("Bus ")) {
                            mapLabelText = bus.name.split(":")[0].replace("Bus", "").trim(); 
                        } else if (bus.name.startsWith("BRTC ")) {
                            mapLabelText = "B" + bus.name.replace("BRTC", "").trim().replace(/^0+/, ""); 
                        } else {
                            mapLabelText = bus.name;
                        }

                        const customIcon = L.divIcon({ 
                            className: 'custom-bus-icon', 
                            html: `
                            <div class="bus-icon-wrapper">
                                ${capacityBadgeHtml}
                                <div class="bus-rotate-wrapper" style="transform: rotate(${bus.course}deg);">
                                    <img src="${busImgSrc}" class="bus-img-top">
                                </div>
                                <div class="map-bus-label">${mapLabelText}</div>
                            </div>`, 
                            iconSize: [40, 60], iconAnchor: [20, 30], popupAnchor: [0, -25] 
                        });

                        if (mapMarkersObj[bus.id]) {
                            mapMarkersObj[bus.id].setLatLng([bus.lat, bus.lng]).setPopupContent(popup).setIcon(customIcon);
                        } else { 
                            mapMarkersObj[bus.id] = L.marker([bus.lat, bus.lng], {icon: customIcon}).addTo(map).bindPopup(popup); 
                        }
                    }
                });

                isSidebarBuilt = true;

                if (activeCount > 0) {
                    statusEl.innerText = `✅ Active: ${activeCount} Buses`;
                    statusEl.style.color = document.body.classList.contains('dark-mode') ? "#10b981" : "#059669";
                } else {
                    statusEl.innerText = "⚠️ No Active Buses";
                    statusEl.style.color = "#ef4444";
                }

                if (activeCount === 0 && !isNightTime()) {
                    if (!noActiveBusTimer && !telegramAlertSent) {
                        noActiveBusTimer = setTimeout(() => {
                            fetch(`${SERVER}/send-alert`).catch(err => {});
                            telegramAlertSent = true; 
                        }, 30000); 
                    }
                } else if (activeCount > 0) {
                    clearTimeout(noActiveBusTimer);
                    noActiveBusTimer = null;
                    telegramAlertSent = false; 
                }

            } catch (e) {
                clearTimeout(timeoutId);
                console.log("Network scan error.", e);
                statusEl.innerText = `⚠️ Connection Error`;
                statusEl.style.color = "#ef4444";
                showWakeupScreen();
            }
        }

        function isNightTime() {
            const dhakaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Dhaka"}));
            const h = dhakaTime.getHours(); const m = dhakaTime.getMinutes();
            return (h > 21) || (h === 21 && m >= 30) || (h < 7);
        }

        function checkTimeAndFetch() {
            if (isNightTime()) {
                document.getElementById('floating-night-notice').style.display = 'block';
                document.getElementById('night-notice-sidebar').style.display = 'block';
                document.getElementById('status-text').innerHTML = "🌙 Offline for Night";
                
                clearTimeout(maintenanceTimer);
                maintenanceTimer = null;
                document.getElementById('maintenance-notice').style.display = 'none'; 
            } else {
                document.getElementById('floating-night-notice').style.display = 'none';
                document.getElementById('night-notice-sidebar').style.display = 'none';
                fetchFleet(); 
            }
        }

        checkTimeAndFetch();
        setInterval(checkTimeAndFetch, 5000); 

        // --- PWA INSTALL APP LOGIC ---
        let deferredPrompt;
        const installBtnSidebar = document.getElementById('install-app-btn');
        const installPopup = document.getElementById('pwa-install-popup');
        const pwaInstallBtn = document.getElementById('pwa-btn-install');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (installBtnSidebar) installBtnSidebar.style.display = 'block'; 
            
            // Show the popup if it hasn't been dismissed recently, delayed by 10 seconds
            if (!sessionStorage.getItem('pwaPromptDismissed')) {
                setTimeout(() => {
                    // Double check they haven't installed it or dismissed it in the last 10 seconds
                    if (deferredPrompt !== null && !sessionStorage.getItem('pwaPromptDismissed')) {
                        installPopup.style.display = 'block';
                    }
                }, 10000);
            }
        });

        // Sidebar button logic
        if (installBtnSidebar) {
            installBtnSidebar.addEventListener('click', async () => {
                if (deferredPrompt !== null) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        installBtnSidebar.style.display = 'none'; 
                        installPopup.style.display = 'none';
                    }
                    deferredPrompt = null;
                }
            });
        }

        // Popup button logic
        if (pwaInstallBtn) {
            pwaInstallBtn.addEventListener('click', async () => {
                if (deferredPrompt !== null) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        installPopup.style.display = 'none';
                        if (installBtnSidebar) installBtnSidebar.style.display = 'none';
                    }
                    deferredPrompt = null;
                }
            });
        }

        // Handle popup dismissal
        const pwaDismissBtn = document.getElementById('pwa-btn-dismiss');
        if (pwaDismissBtn) {
            pwaDismissBtn.addEventListener('click', () => {
                installPopup.style.display = 'none';
                sessionStorage.setItem('pwaPromptDismissed', 'true');
            });
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Registration failed: ', err));
            });
        }

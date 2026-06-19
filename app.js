let routeMap = null;
let routeLayer = null;
let markersLayer = null;

window.onload = async function() {
    const savedCode = localStorage.getItem('userCode');
    if (savedCode) {
        document.getElementById('gate-title').innerText = "Ingresa tu código";
        document.getElementById('gate-btn').innerText = "Desbloquear";
    }

    const video = document.getElementById('camera-stream');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
    } catch (err) { console.error("Cámara no disponible"); }
}

function handleGate() {
    const input = document.getElementById('gate-input').value.trim();
    const savedCode = localStorage.getItem('userCode');
    if (!savedCode) {
        if (input.length === 4 && /^\d+$/.test(input)) { 
            localStorage.setItem('userCode', input); 
            unlockApp(); 
        } else {
            alert("El código debe tener exactamente 4 dígitos numéricos.");
        }
    } else {
        if (input === savedCode) unlockApp();
        else alert("Código incorrecto.");
    }
}

function unlockApp() {
    document.getElementById('gate-section').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    setTimeout(() => {
        updateDropdown('pickup');
        updateDropdown('final');
    }, 100);
}

function saveNewLocation(type) {
    const input = document.getElementById(type === 'pickup' ? 'new-pickup' : 'new-final');
    if (!input.value.trim()) return;
    let list = JSON.parse(localStorage.getItem(type + 'List') || "[]");
    list.push(input.value.trim());
    localStorage.setItem(type + 'List', JSON.stringify(list));
    updateDropdown(type);
    input.value = "";
}

function updateDropdown(type) {
    const select = document.getElementById(type === 'pickup' ? 'pickup-address' : 'final-address');
    const list = JSON.parse(localStorage.getItem(type + 'List') || "[]");
    if (list.length === 0) {
        select.innerHTML = '<option value="">Sin direcciones guardadas</option>';
    } else {
        select.innerHTML = list.map((addr, idx) => `<option value="${addr}">${idx + 1}. ${addr}</option>`).join('');
    }
}

function addBulkAddresses() {
    const textarea = document.getElementById('bulk-addresses');
    if(textarea.value.trim() === "") return;
    textarea.value.split(';').forEach(addr => { if (addr.trim() !== "") addStopToList(addr.trim()); });
    textarea.value = "";
}

function addManualAddress() {
    const input = document.getElementById('manual-address');
    if (input.value.trim() !== "") { addStopToList(input.value.trim()); input.value = ""; }
}

function addStopToList(text) {
    const div = document.createElement('div');
    div.className = 'stop-card';
    div.innerHTML = `<input type="text" value="${text}" class="package-address"><button class="btn-red" onclick="this.parentElement.remove()">X</button>`;
    document.getElementById('scanned-list').appendChild(div);
}

function scanLiveFrame() {
    const video = document.getElementById('camera-stream');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    Tesseract.recognize(canvas.toDataURL('image/png'), 'spa').then(({ data: { text } }) => {
        if(text.trim().length > 2) addStopToList(text.trim());
        else alert("No se detectó texto.");
    });
}

const API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjEzZWNmZjAwZWNiYTQ4YjE5MTQ3MGZhZTFhZGMyY2E5IiwiaCI6Im11cm11cjY0In0='; 

async function geocodeAddress(address) {
    // Búsqueda más específica para Mosquera, Cundinamarca
    const searchText = `${address}, Mosquera, Cundinamarca, Colombia`;
    
    try {
        const response = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(searchText)}&size=1`);
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const coords = data.features[0].geometry.coordinates;
            console.log(`✓ Encontrado: ${address} -> [${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}]`);
            return coords;
        } else {
            // Fallback: buscar en Bogotá si no encuentra en Mosquera
            const fallbackResponse = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(address + ', Bogotá, Colombia')}&size=1`);
            const fallbackData = await fallbackResponse.json();
            
            if (fallbackData.features && fallbackData.features.length > 0) {
                console.log(`✓ Encontrado (fallback): ${address}`);
                return fallbackData.features[0].geometry.coordinates;
            }
            
            throw new Error(`No se encontró: ${address}`);
        }
    } catch (error) {
        console.error(`✗ Error buscando ${address}:`, error);
        throw error;
    }
}

async function calculateRoute() {
    const vehicle = document.getElementById('vehicle').value;
    const addresses = Array.from(document.querySelectorAll('.package-address')).map(i => i.value.trim());
    const pickup = document.getElementById('pickup-address').value;
    const final = document.getElementById('final-address').value;

    if(!pickup || addresses.length === 0 || !final) { 
        alert("Faltan datos. Verifica que tengas:\n- Punto de partida\n- Al menos una dirección\n- Destino final"); 
        return; 
    }

    try {
        const btn = document.querySelector('.btn-green');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span style="display:inline-block; animation: spin 1s linear infinite;">⟳</span> Calculando...';
        btn.disabled = true;

        const coords = [];
        const allAddresses = [pickup, ...addresses, final];
        
        for (let i = 0; i < allAddresses.length; i++) {
            coords.push(await geocodeAddress(allAddresses[i]));
        }

        const body = {
            jobs: addresses.map((addr, i) => ({ id: i + 1, location: coords[i + 1] })),
            vehicles: [{ id: 1, profile: vehicle, start: coords[0], end: coords[coords.length - 1] }]
        };

        const res = await fetch('https://api.openrouteservice.org/optimization', {
            method: 'POST',
            headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const optData = await res.json();

        const sortedStops = [];
        const sortedCoords = [];

        optData.routes[0].steps.forEach(s => {
            if (s.type === 'start') { sortedStops.push(pickup); sortedCoords.push(s.location); }
            else if (s.type === 'end') { sortedStops.push(final); sortedCoords.push(s.location); }
            else if (s.type === 'job') { sortedStops.push(addresses[s.id - 1]); sortedCoords.push(s.location); }
        });
        
        displayRoute(sortedStops, sortedCoords);
        btn.innerHTML = originalText;
        btn.disabled = false;
    } catch(e) { 
        console.error('Error:', e);
        alert("Error: " + e.message); 
        location.reload(); 
    }
}

function displayRoute(stops, coords) {
    const container = document.getElementById('optimized-stops');
    container.innerHTML = ""; 
    document.getElementById('route-results').style.display = "block";
    
    for (let i = 1; i < stops.length; i++) {
        container.innerHTML += `<div class="stop-card"><span><strong>${i}.</strong> ${stops[i]}</span><button onclick="navigateTo('${stops[i]}')">Ir</button></div>`;
    }
    
    setTimeout(() => { displayMap(coords, stops); }, 150);
}

function displayMap(coords, stops) {
    // Inicializar mapa centrado en Mosquera, Cundinamarca
    if (!routeMap) {
        routeMap = L.map('route-map').setView([4.6269, -74.2317], 14);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(routeMap);
    }
    
    if (routeLayer) routeMap.removeLayer(routeLayer);
    if (markersLayer) routeMap.removeLayer(markersLayer);
    
    markersLayer = L.layerGroup();
    
    coords.forEach((coord, index) => {
        const lng = coord[0];
        const lat = coord[1];
        
        let markerClass = 'custom-marker';
        let label = index + 1;
        
        if (index === 0) {
            markerClass += ' start';
            label = '🏠';
        } else if (index === coords.length - 1) {
            markerClass += ' end';
            label = '🏁';
        }
        
        const icon = L.divIcon({
            className: '',
            html: `<div class="${markerClass}">${label}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const markerType = index === 0 ? '🏠 Inicio' : index === coords.length - 1 ? '🏁 Destino' : '📦 Parada ' + index;
        const marker = L.marker([lat, lng], { icon: icon })
            .bindPopup(`<strong>${markerType}</strong><br>${stops[index]}`);
        
        markersLayer.addLayer(marker);
    });
    
    markersLayer.addTo(routeMap);
    
    const routeCoords = coords.map(c => [c[1], c[0]]);
    routeLayer = L.polyline(routeCoords, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.8,
        smoothFactor: 1
    }).addTo(routeMap);
    
    routeMap.fitBounds(routeLayer.getBounds(), { padding: [50, 50], maxZoom: 16 });
    
    setTimeout(() => {
        routeMap.invalidateSize();
    }, 100);
}

function navigateTo(address) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Mosquera, Colombia')}`;
    window.open(url, '_blank');
}

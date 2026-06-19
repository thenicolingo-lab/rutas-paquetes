let routeMap = null;
let routeLayer = null;
let markersLayer = null;

window.onload = async function() {
    // Detectar si ya existe código
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
    const input = document.getElementById('gate-input').value;
    const savedCode = localStorage.getItem('userCode');
    if (!savedCode) {
        if (input.length === 4) { localStorage.setItem('userCode', input); unlockApp(); }
        else alert("El código debe tener 4 dígitos.");
    } else {
        if (input === savedCode) unlockApp();
        else alert("Código incorrecto.");
    }
}

function unlockApp() {
    document.getElementById('gate-section').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    updateDropdown('pickup');
    updateDropdown('final');
}

function saveNewLocation(type) {
    const input = document.getElementById(type === 'pickup' ? 'new-pickup' : 'new-final');
    if (!input.value) return;
    let list = JSON.parse(localStorage.getItem(type + 'List') || "[]");
    list.push(input.value);
    localStorage.setItem(type + 'List', JSON.stringify(list));
    updateDropdown(type);
    input.value = "";
}

function updateDropdown(type) {
    const select = document.getElementById(type === 'pickup' ? 'pickup-address' : 'final-address');
    const list = JSON.parse(localStorage.getItem(type + 'List') || "[]");
    select.innerHTML = list.map(addr => `<option value="${addr}">${addr}</option>`).join('');
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
    const response = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(address + ', Mosquera, Colombia')}`);
    const data = await response.json();
    if (data.features && data.features.length > 0) return data.features[0].geometry.coordinates;
    throw new Error(`No se encontró: ${address}`);
}

async function calculateRoute() {
    const vehicle = document.getElementById('vehicle').value;
    const addresses = Array.from(document.querySelectorAll('.package-address')).map(i => i.value);
    const pickup = document.getElementById('pickup-address').value;
    const final = document.getElementById('final-address').value;

    if(!pickup || addresses.length === 0 || !final) { alert("Faltan datos."); return; }

    try {
        const btn = document.querySelector('.btn-green');
        btn.innerText = "Calculando..."; btn.disabled = true;

        const coords = [];
        for (const text of [pickup, ...addresses, final]) coords.push(await geocodeAddress(text));

        const body = {
            jobs: addresses.map((addr, i) => ({ id: i + 1, location: coords[i + 1] })),
            vehicles: [{ id: 1, profile: vehicle, start: coords[0], end: coords[coords.length - 1] }]
        };

        const res = await fetch('https://api.openrouteservice.org/optimization', {
            method: 'POST',
            headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const optData = await res.json();

        const sorted = optData.routes[0].steps.map(s => s.type === 'job' ? addresses[s.id - 1] : (s.type === 'start' ? pickup : final));
        
        // Guardar coordenadas en el orden optimizado
        const sortedCoords = optData.routes[0].steps.map(s => {
            if (s.type === 'start') return coords[0];
            if (s.type === 'end') return coords[coords.length - 1];
            return coords[s.id];
        });
        
        displayRoute(sorted, sortedCoords);
        btn.innerText = "Optimizar Ruta"; btn.disabled = false;
    } catch(e) { alert("Error: " + e.message); location.reload(); }
}

function displayRoute(stops, coords) {
    const container = document.getElementById('optimized-stops');
    container.innerHTML = ""; 
    document.getElementById('route-results').style.display = "block";
    
    // Crear lista de paradas
    for (let i = 0; i < stops.length - 1; i++) {
        container.innerHTML += `<div class="stop-card"><span><strong>${i+1}.</strong> ${stops[i+1]}</span><button onclick="navigateTo('${stops[i+1]}')">Ir</button></div>`;
    }
    
    // Mostrar mapa
    displayMap(coords, stops);
}

function displayMap(coords, stops) {
    // Inicializar mapa si no existe
    if (!routeMap) {
        routeMap = L.map('route-map').setView([4.6097, -74.0817], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(routeMap);
    }
    
    // Limpiar capas anteriores
    if (routeLayer) routeMap.removeLayer(routeLayer);
    if (markersLayer) routeMap.removeLayer(markersLayer);
    
    // Crear capa de marcadores
    markersLayer = L.layerGroup();
    
    // Agregar marcadores
    coords.forEach((coord, index) => {
        const lat = coord[1];
        const lng = coord[0];
        
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
        
        const marker = L.marker([lat, lng], { icon: icon })
            .bindPopup(`<strong>Parada ${index + 1}</strong><br>${stops[index]}`);
        
        markersLayer.addLayer(marker);
    });
    
    markersLayer.addTo(routeMap);
    
    // Crear línea de ruta
    const routeCoords = coords.map(c => [c[1], c[0]]);
    routeLayer = L.polyline(routeCoords, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.8,
        smoothFactor: 1,
        dashArray: '10, 10'
    }).addTo(routeMap);
    
    // Ajustar vista del mapa
    routeMap.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
    
    // Forzar redimensionamiento del mapa
    setTimeout(() => {
        routeMap.invalidateSize();
    }, 100);
}

function navigateTo(address) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Mosquera, Colombia')}`;
    window.open(url, '_blank');
}

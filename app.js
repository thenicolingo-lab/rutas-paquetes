window.onload = async function() {
    const savedCode = localStorage.getItem('userCode');
    const title = document.getElementById('gate-title');
    const btn = document.getElementById('gate-btn');
    if (savedCode) { title.innerText = "Ingresa tu código"; btn.innerText = "Desbloquear"; }

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
    const addresses = textarea.value.split(';');
    addresses.forEach(addr => { if (addr.trim() !== "") addStopToList(addr.trim()); });
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
        displayRoute(sorted);
        btn.innerText = "Optimizar Ruta"; btn.disabled = false;
    } catch(e) { alert(e.message); location.reload(); }
}

function displayRoute(stops) {
    const container = document.getElementById('optimized-stops');
    container.innerHTML = ""; document.getElementById('route-results').style.display = "block";
    for (let i = 0; i < stops.length - 1; i++) {
        container.innerHTML += `<div class="stop-card"><span><strong>${i+1}.</strong> ${stops[i+1]}</span><button onclick="navigateTo('${stops[i+1]}')">Ir</button></div>`;
    }
}

function navigateTo(address) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address + ', Mosquera, Colombia')}&travelmode=driving`, '_blank');
}

window.onload = async function() {
    // Detectar si ya existe código
    const savedCode = localStorage.getItem('userCode');
    if (savedCode) {
        document.getElementById('gate-title').innerText = "🔐 Ingresa tu código";
        document.getElementById('gate-btn').innerText = "Desbloquear";
    }

    // Add stagger animation to sections
    const sections = document.querySelectorAll('section');
    sections.forEach((section, index) => {
        section.style.animationDelay = `${index * 0.1}s`;
    });
}

function handleGate() {
    const input = document.getElementById('gate-input').value;
    const savedCode = localStorage.getItem('userCode');
    if (!savedCode) {
        if (input.length === 4) { 
            localStorage.setItem('userCode', input); 
            showSuccessMessage('✅ Código creado exitosamente');
            setTimeout(unlockApp, 800);
        }
        else alert("El código debe tener 4 dígitos.");
    } else {
        if (input === savedCode) {
            showSuccessMessage('✅ Bienvenido de vuelta');
            setTimeout(unlockApp, 800);
        }
        else alert("Código incorrecto.");
    }
}

function showSuccessMessage(message) {
    const msg = document.createElement('div');
    msg.className = 'success-message';
    msg.innerText = message;
    const gateSection = document.getElementById('gate-section');
    gateSection.parentNode.insertBefore(msg, gateSection.nextSibling);
    setTimeout(() => msg.remove(), 2000);
}

function unlockApp() {
    document.getElementById('gate-section').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    // Animate main app sections
    const sections = document.querySelectorAll('#main-app section');
    sections.forEach((section, index) => {
        section.style.animationDelay = `${index * 0.1}s`;
    });
    
    updateDropdown('pickup');
    updateDropdown('final');
}

function saveNewLocation(type) {
    const input = document.getElementById(type === 'pickup' ? 'new-pickup' : 'new-final');
    if (!input.value) {
        alert('Por favor ingresa una dirección');
        return;
    }
    let list = JSON.parse(localStorage.getItem(type + 'List') || "[]");
    list.push(input.value);
    localStorage.setItem(type + 'List', JSON.stringify(list));
    updateDropdown(type);
    input.value = "";
    showSuccessMessage('✅ Dirección guardada');
}

function updateDropdown(type) {
    const select = document.getElementById(type === 'pickup' ? 'pickup-address' : 'final-address');
    const list = JSON.parse(localStorage.getItem(type + 'List') || "[]");
    if (list.length === 0) {
        select.innerHTML = '<option value="">Sin direcciones guardadas</option>';
    } else {
        select.innerHTML = list.map((addr, i) => `<option value="${addr}">${i + 1}. ${addr}</option>`).join('');
    }
}

function addBulkAddresses() {
    const textarea = document.getElementById('bulk-addresses');
    if(textarea.value.trim() === "") {
        alert('Por favor ingresa al menos una dirección');
        return;
    }
    const count = textarea.value.split(';').filter(addr => addr.trim() !== "").length;
    textarea.value.split(';').forEach(addr => { if (addr.trim() !== "") addStopToList(addr.trim()); });
    textarea.value = "";
    showSuccessMessage(`✅ ${count} dirección(es) agregada(s)`);
}

function addManualAddress() {
    const input = document.getElementById('manual-address');
    if (input.value.trim() !== "") { 
        addStopToList(input.value.trim()); 
        input.value = "";
        showSuccessMessage('✅ Dirección agregada');
    }
}

function addStopToList(text) {
    const div = document.createElement('div');
    div.className = 'stop-card';
    div.innerHTML = `
        <input type="text" value="${text}" class="package-address" readonly>
        <button class="btn-red" onclick="this.parentElement.remove()">✕ Eliminar</button>
    `;
    document.getElementById('scanned-list').appendChild(div);
}

const API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjEzZWNmZjAwZWNiYTQ4YjE5MTQ3MGZhZTFhZGMyY2E5IiwiaCI6Im11cm11cjY0In0='; 

async function geocodeAddress(address) {
    // Cambiamos ', Mosquera, Colombia' a solo ', Colombia'
    const response = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(address + ', Colombia')}`);
    const data = await response.json();
    if (data.features && data.features.length > 0) return data.features[0].geometry.coordinates;
    throw new Error(`No se encontró: ${address}`);
}

async function calculateRoute() {
    const vehicle = document.getElementById('vehicle').value;
    const addresses = Array.from(document.querySelectorAll('.package-address')).map(i => i.value);
    const pickup = document.getElementById('pickup-address').value;
    const final = document.getElementById('final-address').value;

    if(!pickup || addresses.length === 0 || !final) { 
        alert("⚠️ Por favor completa todos los campos requeridos"); 
        return; 
    }

    try {
        const btn = document.querySelector('.btn-green');
        const originalText = btn.innerText;
        btn.innerHTML = '<span class="loading"></span> Calculando...';
        btn.disabled = true;

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
        btn.innerText = originalText;
        btn.disabled = false;
        showSuccessMessage('✅ Ruta optimizada exitosamente');
        
        // Scroll to results
        document.getElementById('route-results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch(e) { 
        // Mostrar el error pero SIN recargar la página
        alert("Aviso: " + e.message + "\n\nRevisa que las direcciones no sean solo 'Calle 11', agrega un número o intersección."); 
        const btn = document.querySelector('.btn-green');
        btn.innerText = "Optimizar Ruta"; 
        btn.disabled = false; 
    }
}

function displayRoute(stops) {
    const container = document.getElementById('optimized-stops');
    container.innerHTML = ""; 
    document.getElementById('route-results').style.display = "block";
    
    for (let i = 0; i < stops.length - 1; i++) {
        const step = document.createElement('div');
        step.className = 'route-step';
        step.style.animationDelay = `${i * 0.1}s`;
        step.innerHTML = `
            <span><strong>${i+1}.</strong> ${stops[i+1]}</span>
            <button onclick="navigateTo('${stops[i+1]}')">🗺️ Ir</button>
        `;
        container.appendChild(step);
    }
}

function navigateTo(address) {
    // Usamos el enlace oficial de Google Maps para crear rutas y quitamos Mosquera
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address + ', Colombia')}`;
    window.open(url, '_blank');
}

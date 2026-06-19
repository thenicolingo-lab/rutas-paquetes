// Iniciar la cámara tan pronto se abra la app
window.onload = async function() {
    const video = document.getElementById('camera-stream');
    try {
        // Pide permiso y usa la cámara trasera (environment)
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        video.srcObject = stream;
    } catch (err) {
        console.error("Error al acceder a la cámara: ", err);
        // Si el navegador bloquea la cámara, no importa, ella puede usar la entrada manual
    }
}

// Opción A: Entrada Manual (La más rápida y confiable)
function addManualAddress() {
    const input = document.getElementById('manual-address');
    if (input.value.trim() !== "") {
        addStopToList(input.value.trim());
        input.value = ""; // Limpiar el campo
    }
}

// Opción B: Escáner en vivo (Mantenido como opción secundaria)
function scanLiveFrame() {
    const video = document.getElementById('camera-stream');
    const scannedList = document.getElementById('scanned-list');
    
    const loadingMsg = document.createElement('p');
    loadingMsg.innerText = "Leyendo imagen...";
    scannedList.appendChild(loadingMsg);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = canvas.toDataURL('image/png');

    Tesseract.recognize(imageData, 'spa')
        .then(({ data: { text } }) => {
            loadingMsg.remove();
            if(text.trim().length > 2) {
                addStopToList(text.trim());
            } else {
                alert("No se detectó texto claro. Intenta acercar la cámara o usa la entrada manual.");
            }
        });
}

// Función compartida para inyectar la dirección en la lista
function addStopToList(addressText) {
    const scannedList = document.getElementById('scanned-list');
    const div = document.createElement('div');
    div.className = 'stop-card';
    div.innerHTML = `
        <input type="text" value="${addressText}" class="package-address">
        <button class="btn-red" onclick="this.parentElement.remove()">X</button>
    `;
    scannedList.appendChild(div);
}

// Tu clave API oficial
const API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjEzZWNmZjAwZWNiYTQ4YjE5MTQ3MGZhZTFhZGMyY2E5IiwiaCI6Im11cm11cjY0In0='; 

// 1. Convertir texto a coordenadas GPS (Usando el dominio estándar CORS)
async function geocodeAddress(address) {
    const fullAddress = `${address}, Mosquera, Colombia`;
    const response = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(fullAddress)}`);
    
    if (!response.ok) throw new Error(`Fallo de conexión al buscar: ${address}`);
    
    const data = await response.json();
    if (data.features && data.features.length > 0) {
        return data.features[0].geometry.coordinates; // Retorna [longitud, latitud]
    }
    throw new Error(`No pudimos encontrar en el mapa: ${address}. Revisa la dirección.`);
}

// 2. El Cerebro Principal
async function calculateRoute() {
    const vehicleProfile = document.getElementById('vehicle').value; 
    const addresses = Array.from(document.querySelectorAll('.package-address')).map(input => input.value);
    const pickup = document.getElementById('pickup-address').value;
    const finalStop = document.getElementById('final-address').value;

    if(!pickup || addresses.length === 0 || !finalStop) {
        alert("Faltan datos. Asegúrate de tener punto de partida, al menos un paquete, y destino final.");
        return;
    }

    try {
        const btn = document.querySelector('.btn-green');
        btn.innerText = "Calculando ruta óptima...";
        btn.disabled = true;

        // Convertir todas las direcciones a coordenadas
        const allTextStops = [pickup, ...addresses, finalStop];
        const coordinates = [];
        for (const text of allTextStops) {
            const coords = await geocodeAddress(text);
            coordinates.push(coords);
        }

        // Armar el problema para la API de optimización
        const body = {
            jobs: addresses.map((addr, i) => ({
                id: i + 1,
                location: coordinates[i + 1] 
            })),
            vehicles: [{
                id: 1,
                profile: vehicleProfile, 
                start: coordinates[0], 
                end: coordinates[coordinates.length - 1] 
            }]
        };

        // Enviar a OpenRouteService (Usando el dominio estándar CORS)
        const optResponse = await fetch('https://api.openrouteservice.org/optimization', {
            method: 'POST',
            headers: {
                'Authorization': API_KEY,
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(body)
        });

        if (!optResponse.ok) throw new Error("Fallo de conexión al calcular la ruta.");

        const optData = await optResponse.json();

        // Organizar los resultados
        if(optData.code === 0 || optData.routes) {
            const sortedSteps = optData.routes[0].steps;
            const finalOrderedText = [];
            
            sortedSteps.forEach(step => {
                if (step.type === 'start') finalOrderedText.push(pickup);
                else if (step.type === 'end') finalOrderedText.push(finalStop);
                else if (step.type === 'job') finalOrderedText.push(addresses[step.id - 1]);
            });

            displayRoute(finalOrderedText);
        } else {
            alert("Hubo un error calculando el orden de la ruta.");
            console.error(optData);
        }

        btn.innerText = "Optimizar Ruta";
        btn.disabled = false;

    } catch (error) {
        alert(error.message); // Esto nos dirá exactamente dónde falla si ocurre un error
        const btn = document.querySelector('.btn-green');
        btn.innerText = "Optimizar Ruta";
        btn.disabled = false;
    }
}

function displayRoute(orderedStops) {
    const container = document.getElementById('optimized-stops');
    container.innerHTML = "";
    document.getElementById('route-results').style.display = "block";

    for (let i = 0; i < orderedStops.length - 1; i++) {
        const nextStop = orderedStops[i+1];
        const div = document.createElement('div');
        div.className = 'stop-card';
        div.innerHTML = `
            <span><strong>Parada ${i+1}:</strong> ${nextStop}</span>
            <button class="btn-green" style="width: auto; padding: 8px 15px;" onclick="navigateTo('${nextStop}')">Ir en Maps</button>
        `;
        container.appendChild(div);
    }
}

function navigateTo(address) {
    const url = `http://googleusercontent.com/maps.google.com/maps?daddr=${encodeURIComponent(address + ', Mosquera, Colombia')}`;
    window.open(url, '_blank');
}

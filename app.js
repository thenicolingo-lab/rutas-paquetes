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
        alert("Por favor permite el acceso a la cámara o usa la entrada manual.");
    }
}

// Opción A: Entrada Manual
function addManualAddress() {
    const input = document.getElementById('manual-address');
    if (input.value.trim() !== "") {
        addStopToList(input.value.trim());
        input.value = ""; // Limpiar el campo
    }
}

// Opción B: Escáner en vivo
function scanLiveFrame() {
    const video = document.getElementById('camera-stream');
    const scannedList = document.getElementById('scanned-list');
    
    // Mensaje temporal
    const loadingMsg = document.createElement('p');
    loadingMsg.innerText = "Leyendo imagen...";
    scannedList.appendChild(loadingMsg);

    // Crear un canvas invisible para capturar el frame de la cámara
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Extraer la imagen en base64
    const imageData = canvas.toDataURL('image/png');

    // Pasar a Tesseract
    Tesseract.recognize(imageData, 'spa')
        .then(({ data: { text } }) => {
            loadingMsg.remove();
            // Solo agregar si detectó texto
            if(text.trim().length > 2) {
                addStopToList(text.trim());
            } else {
                alert("No se detectó texto claro. Intenta acercar la cámara.");
            }
        });
}

// Función compartida para inyectar la dirección en la lista de paradas
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

// Pega tu clave de OpenRouteService entre las comillas aquí abajo:
const API_KEY = 'PEGA_TU_CLAVE_AQUI'; 

// 1. Convertir texto a coordenadas GPS
async function geocodeAddress(address) {
    // Agregamos "Mosquera, Colombia" automáticamente para mayor precisión
    const fullAddress = `${address}, Mosquera, Colombia`;
    // Usamos el nuevo dominio heigit.org para evitar el aviso de deprecación
    const response = await fetch(`https://api.heigit.org/openrouteservice/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(fullAddress)}`);
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
        return data.features[0].geometry.coordinates; // Retorna [longitud, latitud]
    }
    throw new Error(`No pudimos encontrar en el mapa: ${address}. Intenta ser más específico.`);
}

// 2. El Cerebro Principal
async function calculateRoute() {
    const vehicleProfile = document.getElementById('vehicle').value; 
    const addresses = Array.from(document.querySelectorAll('.package-address')).map(input => input.value);
    const pickup = document.getElementById('pickup-address').value;
    const finalStop = document.getElementById('final-address').value;

    if(!pickup || addresses.length === 0 || !finalStop) {
        alert("Faltan datos. Asegúrate de tener punto de partida, paquetes y destino final.");
        return;
    }

    if(API_KEY === 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjEzZWNmZjAwZWNiYTQ4YjE5MTQ3MGZhZTFhZGMyY2E5IiwiaCI6Im11cm11cjY0In0=') {
        alert("Falta configurar la API Key en el código.");
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
                location: coordinates[i + 1] // Los paquetes están en el medio del array
            })),
            vehicles: [{
                id: 1,
                profile: vehicleProfile, // El algoritmo sabrá si va en el Suzuki (carro) o en bicicleta
                start: coordinates[0], // Punto de partida
                end: coordinates[coordinates.length - 1] // Destino final
            }]
        };

        // Enviar a OpenRouteService
        const optResponse = await fetch('https://api.heigit.org/openrouteservice/optimization', {
            method: 'POST',
            headers: {
                'Authorization': API_KEY,
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(body)
        });

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
            alert("Hubo un error calculando la mejor ruta.");
            console.error(optData);
        }

        btn.innerText = "Optimizar Ruta";
        btn.disabled = false;

    } catch (error) {
        alert(error.message);
        const btn = document.querySelector('.btn-green');
        btn.innerText = "Optimizar Ruta";
        btn.disabled = false;
    }
}

function displayRoute(orderedStops) {
    const container = document.getElementById('optimized-stops');
    container.innerHTML = "";
    document.getElementById('route-results').style.display = "block";

    // Omitimos el último porque es el destino final a donde se dirige para descansar/comer
    for (let i = 0; i < orderedStops.length - 1; i++) {
        const nextStop = orderedStops[i+1];
        const div = document.createElement('div');
        div.className = 'stop-card';
        div.innerHTML = `
            <span><strong>${i+1}.</strong> ${nextStop}</span>
            <button class="btn-green" style="width: auto; padding: 8px 15px;" onclick="navigateTo('${nextStop}')">Ir</button>
        `;
        container.appendChild(div);
    }
}

function navigateTo(address) {
    // Al hacer clic, abre Google Maps con tráfico en vivo hacia esa dirección en Mosquera
    const url = `http://googleusercontent.com/maps.google.com/maps?daddr=${encodeURIComponent(address + ', Mosquera, Colombia')}`;
    window.open(url, '_blank');
}

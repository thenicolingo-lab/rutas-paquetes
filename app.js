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

// Integración del Vehículo en el Algoritmo
async function calculateRoute() {
    // Aquí capturamos el perfil exacto del vehículo seleccionado
    const vehicleProfile = document.getElementById('vehicle').value; 
    
    const addresses = Array.from(document.querySelectorAll('.package-address')).map(input => input.value);
    const pickup = document.getElementById('pickup-address').value;
    const finalStop = document.getElementById('final-address').value;

    if(!pickup || addresses.length === 0 || !finalStop) {
        alert("Faltan datos de la ruta.");
        return;
    }

    // El vehicleProfile ("driving-car" o "cycling-regular") se enviará a la API
    // Ejemplo de cómo se armará la URL de la API:
    // const apiUrl = `https://api.openrouteservice.org/v2/matrix/${vehicleProfile}`;
    
    console.log(`Calculando ruta para vehículo: ${vehicleProfile}`);
    
    // Simulación del resultado
    displayRoute([pickup, ...addresses, finalStop]);
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
            <span>Parada ${i+1}: ${nextStop}</span>
            <button onclick="navigateTo('${nextStop}')" style="width: auto;">Ir</button>
        `;
        container.appendChild(div);
    }
}

function navigateTo(address) {
    const url = `http://googleusercontent.com/maps.google.com/maps?daddr=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
}
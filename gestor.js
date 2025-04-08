// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyACOeoU8xXUuzCYrPxONmeBgImfQd63UOA",
    authDomain: "basedatoscheck.firebaseapp.com",
    projectId: "basedatoscheck",
    storageBucket: "basedatoscheck.appspot.com",
    messagingSenderId: "580954254341",
    appId: "1:580954254341:web:684651c6c8f55449d8006c"
};

// Inicializar Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Variables globales
let signaturePad;
let currentUserEmail = '';
let isDrawing = false;

// DOM Elements
const loginGestorForm = document.getElementById('loginGestorForm');
const gestorProtectedContent = document.getElementById('gestorProtectedContent');
const gestorEmailSpan = document.getElementById('gestorEmail');
const logoutGestorBtn = document.getElementById('logoutGestorBtn');
const pendientesBody = document.getElementById('pendientesBody');
const revisionModal = new bootstrap.Modal('#revisionModal');
const guardarRevisionBtn = document.getElementById('guardarRevisionBtn');
const limpiarFirma = document.getElementById('limpiarFirma');
const firmaCanvas = document.getElementById('firmaCanvas');

// Inicializar Signature Pad (versión mejorada)
function initSignaturePad() {
    // Configurar tamaño del canvas
    const canvas = firmaCanvas;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    
    signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgba(255, 255, 255, 0)',
        penColor: 'rgb(0, 0, 0)',
        minWidth: 1,
        maxWidth: 3,
        throttle: 16
    });

    // Manejo mejorado de eventos táctiles
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    // Manejo de eventos de ratón
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseout', handleMouseUp);

    function handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }
    }

    function handleTouchEnd(e) {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup');
        canvas.dispatchEvent(mouseEvent);
    }

    function handleMouseDown(e) {
        isDrawing = true;
        const pos = getPosition(e, canvas);
        signaturePad._strokeBegin(pos);
    }

    function handleMouseMove(e) {
        if (!isDrawing) return;
        const pos = getPosition(e, canvas);
        signaturePad._strokeMoveUpdate(pos);
    }

    function handleMouseUp() {
        isDrawing = false;
        signaturePad._strokeEnd();
    }

    function getPosition(event, canvas) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }
}

// Limpiar firma
function limpiarPadFirma() {
    signaturePad.clear();
    const ctx = firmaCanvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, firmaCanvas.width, firmaCanvas.height);
}

// Mostrar alertas
function showGestorAlert(message, type = 'danger') {
    const alertContainer = document.getElementById('gestorAlertContainer');
    alertContainer.innerHTML = '';
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 150);
    }, 5000);
}

// Formatear fecha
function formatFecha(fecha) {
    if (!fecha) return 'N/A';
    if (fecha.toDate) fecha = fecha.toDate();
    return fecha.toLocaleDateString('es-CO');
}

// Cargar verificaciones pendientes
function cargarPendientes() {
    pendientesBody.innerHTML = '<tr><td colspan="5" class="text-center"><div class="spinner-border text-primary" role="status"></div></td></tr>';
    
    db.collection('verificaciones')
      .where('estado', '==', 'Pendiente para revisión')
      .get()
      .then(snapshot => {
          pendientesBody.innerHTML = '';
          
          if (snapshot.empty) {
              pendientesBody.innerHTML = `
                  <tr>
                      <td colspan="5" class="text-center text-muted py-4">
                          No hay verificaciones pendientes
                      </td>
                  </tr>
              `;
              return;
          }
          
          snapshot.forEach(doc => {
              const data = doc.data();
              const row = document.createElement('tr');
              row.innerHTML = `
                  <td>${formatFecha(data.fechaCreacion)}</td>
                  <td>${data.placa || 'N/A'}</td>
                  <td>${data.tipo || 'N/A'}</td>
                  <td>${data.conductor || 'N/A'}</td>
                  <td>
                      <button class="btn btn-sm btn-primary btn-revisar" data-id="${doc.id}">
                          <i class="fas fa-clipboard-check me-1"></i>Revisar
                      </button>
                  </td>
              `;
              pendientesBody.appendChild(row);
          });
          
          document.querySelectorAll('.btn-revisar').forEach(btn => {
              btn.addEventListener('click', () => abrirModalRevision(btn.dataset.id));
          });
      })
      .catch(error => {
          console.error("Error cargando pendientes:", error);
          pendientesBody.innerHTML = `
              <tr>
                  <td colspan="5" class="text-center text-danger py-4">
                      Error al cargar datos
                  </td>
              </tr>
          `;
          showGestorAlert("Error al cargar verificaciones: " + error.message);
      });
}

// Abrir modal para revisión
async function abrirModalRevision(verificacionId) {
    try {
        const doc = await db.collection('verificaciones').doc(verificacionId).get();
        if (!doc.exists) {
            showGestorAlert("La verificación no existe");
            return;
        }
        
        const data = doc.data();
        document.getElementById('verificacionId').value = verificacionId;
        document.getElementById('modalPlaca').value = data.placa || '';
        document.getElementById('modalFecha').value = formatFecha(data.fechaCreacion);
        document.getElementById('gestorNombre').value = '';
        document.getElementById('presentacionCheck').checked = false;
        document.getElementById('gestorObservaciones').value = '';
        limpiarPadFirma();
        
        // Re-inicializar el pad de firma al abrir el modal
        initSignaturePad();
        revisionModal.show();
        
    } catch (error) {
        console.error("Error abriendo modal:", error);
        showGestorAlert("Error al cargar la verificación");
    }
}

// Guardar revisión
async function guardarRevision() {
    const verificacionId = document.getElementById('verificacionId').value;
    const gestorNombre = document.getElementById('gestorNombre').value.trim();
    const presentacionOk = document.getElementById('presentacionCheck').checked;
    const observaciones = document.getElementById('gestorObservaciones').value.trim();
    
    if (!gestorNombre) {
        showGestorAlert("Debe ingresar su nombre", "warning");
        return;
    }
    // si esta vacia mostrar una alerta de peligro y evitar que guarde
    if (signaturePad.isEmpty()) {
        showGestorAlert("Debe firmar para completar la revisión", "warning");
        return;
    }
    // recolector de errores para encontrar aprobado o rechazado
    try {
        const firmaURL = signaturePad.toDataURL('image/png');
        
        await db.collection('verificaciones').doc(verificacionId).update({
            estado: presentacionOk ? "Aprobado" : "Rechazado",
            revision: {
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                gestor: gestorNombre,
                presentacionPersonalOk: presentacionOk,
                observaciones: observaciones,
                firma: firmaURL,
                revisadoPor: currentUserEmail
            }
        });
        // Despues de revisar guardar correctamente 
        showGestorAlert("Revisión Registrada correctamente", "success");
        revisionModal.hide();
        cargarPendientes();
        // capturar el error y mostrar el error 
    } catch (error) {
        console.error("Error guardando revisión:", error);
        showGestorAlert("Error al guardar la revisión: " + error.message);
    }
}

// Autenticación
auth.onAuthStateChanged(user => {
    if (user && user.email === 'gestor@combuses.com') {
        currentUserEmail = user.email;
        document.getElementById('authSection').style.display = 'none';
        gestorProtectedContent.style.display = 'block';
        gestorEmailSpan.textContent = user.email;
        cargarPendientes();
    } else {
        document.getElementById('authSection').style.display = 'block';
        gestorProtectedContent.style.display = 'none';
    }
});

// Evento de login
loginGestorForm.addEventListener('submit', e => {
    e.preventDefault();
    
    const email = document.getElementById('loginGestorEmail').value;
    const password = document.getElementById('loginGestorPassword').value;
    
    if (email !== 'gestor@combuses.com') {
        showGestorAlert("Solo usuarios gestores pueden acceder aquí");
        return;
    }
    
    auth.signInWithEmailAndPassword(email, password)
        .then(() => showGestorAlert("Bienvenido Gestor", "success"))
        .catch(error => {
            const errorMsg = error.code === 'auth/wrong-password' ? 
                "Contraseña incorrecta" : "Error al iniciar sesión";
            showGestorAlert(errorMsg);
        });
});

// Evento de logout de cerrado de sesion 
logoutGestorBtn.addEventListener('click', () => {
    auth.signOut()
        .then(() => {
            showGestorAlert("Sesión cerrada correctamente", "success");
            loginGestorForm.reset();
        })
        .catch(error => showGestorAlert("Error al cerrar sesión"));
});

// Eventos del modal
guardarRevisionBtn.addEventListener('click', guardarRevision);
limpiarFirma.addEventListener('click', limpiarPadFirma);

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar el canvas de firma 
    initSignaturePad();
    
    // Toggle password visibility
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            const icon = this.querySelector('i');
            input.type = input.type === 'password' ? 'text' : 'password';
            icon.classList.toggle('fa-eye-slash');
            icon.classList.toggle('fa-eye');
        });
    });
    
    // Redimensionar canvas cuando se muestre el modal
    revisionModal._element.addEventListener('shown.bs.modal', () => {
        const canvas = document.getElementById('firmaCanvas');
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
    });
});

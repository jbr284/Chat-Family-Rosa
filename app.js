// --- CONFIGURAÇÃO DO FIREBASE ---
// 1. Cole suas chaves do Console do Firebase aqui dentro:
const firebaseConfig = {
  apiKey: "AIzaSyAB3KCfomPt3TAtV9mL4lx393TaMhNA5tY",
  authDomain: "chat-family-rosa.firebaseapp.com",
  databaseURL: "https://chat-family-rosa-default-rtdb.firebaseio.com",
  projectId: "chat-family-rosa",
  storageBucket: "chat-family-rosa.firebasestorage.app",
  messagingSenderId: "237093132146",
  appId: "1:237093132146:web:280b9c3a36f1bff6672feb"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// --- VARIÁVEIS GLOBAIS ---
let currentUser = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Elementos do DOM
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const msgInput = document.getElementById('msg-input');
const btnSend = document.getElementById('btn-send');
const messagesList = document.getElementById('messages-list');
const btnAttach = document.getElementById('btn-attach');
const fileInput = document.getElementById('file-input');
const btnMic = document.getElementById('btn-mic');
const recordingIndicator = document.getElementById('recording-indicator');

// --- 1. AUTENTICAÇÃO ---

// Observer: Verifica se tem usuário logado
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        document.getElementById('user-name').innerText = user.displayName;
        carregarMensagens();
    } else {
        currentUser = null;
        loginScreen.classList.remove('hidden');
        chatScreen.classList.add('hidden');
    }
});

// Login com Google
btnLogin.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => alert("Erro no login: " + error.message));
});

// Logout
btnLogout.addEventListener('click', () => auth.signOut());

// --- 2. LÓGICA DE CHAT (TEXTO) ---

// Mostrar/Ocultar botão de enviar texto dependendo se tem algo digitado
msgInput.addEventListener('input', () => {
    if (msgInput.value.trim() !== "") {
        btnSend.style.display = "flex";
        btnMic.style.display = "none";
    } else {
        btnSend.style.display = "none";
        btnMic.style.display = "flex";
    }
});

// Enviar Texto
btnSend.addEventListener('click', enviarTexto);
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviarTexto();
});

function enviarTexto() {
    const texto = msgInput.value.trim();
    if (!texto) return;

    db.collection('mensagens').add({
        texto: texto,
        tipo: 'texto',
        uid: currentUser.uid,
        nome: currentUser.displayName.split(' ')[0], // Primeiro nome
        data: firebase.firestore.FieldValue.serverTimestamp()
    });

    msgInput.value = "";
    btnSend.style.display = "none";
    btnMic.style.display = "flex";
}

// --- 3. LÓGICA DE ARQUIVOS (FOTO) ---

btnAttach.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    // Upload Imagem
    const nomeArquivo = `imagens/${Date.now()}_${arquivo.name}`;
    const ref = storage.ref(nomeArquivo);

    ref.put(arquivo).then(snapshot => {
        snapshot.ref.getDownloadURL().then(url => {
            db.collection('mensagens').add({
                arquivoUrl: url,
                tipo: 'imagem',
                uid: currentUser.uid,
                nome: currentUser.displayName.split(' ')[0],
                data: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
    }).catch(err => alert("Erro ao enviar imagem: " + err.message));
});

// --- 4. LÓGICA DE ÁUDIO (GRAVAÇÃO) ---

btnMic.addEventListener('click', async () => {
    if (!isRecording) {
        iniciarGravacao();
    } else {
        pararGravacaoEEnviar();
    }
});

async function iniciarGravacao() {
    // Verifica suporte do navegador
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Navegador não suporta gravação de áudio.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.start();
        
        // Atualiza UI
        isRecording = true;
        btnMic.classList.add('recording-active'); // Vermelho
        btnMic.innerHTML = '<i class="material-icons">stop</i>'; // Ícone Stop
        recordingIndicator.classList.remove('hidden'); // Mostra "Gravando..."

    } catch (err) {
        console.error(err);
        alert("Permita o uso do microfone.");
    }
}

function pararGravacaoEEnviar() {
    if (!mediaRecorder) return;
    mediaRecorder.stop();

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        // UI volta ao normal
        isRecording = false;
        btnMic.classList.remove('recording-active');
        btnMic.innerHTML = '<i class="material-icons">mic</i>';
        recordingIndicator.classList.add('hidden');

        // Enviar para o Firebase Storage
        const nomeAudio = `audios/${Date.now()}.webm`;
        const ref = storage.ref(nomeAudio);

        ref.put(audioBlob).then(snapshot => {
            snapshot.ref.getDownloadURL().then(url => {
                db.collection('mensagens').add({
                    arquivoUrl: url,
                    tipo: 'audio',
                    uid: currentUser.uid,
                    nome: currentUser.displayName.split(' ')[0],
                    data: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        }).catch(err => alert("Erro ao enviar áudio."));
    };
}

// --- 5. RENDERIZAÇÃO (MOSTRAR MENSAGENS) ---

function carregarMensagens() {
    db.collection('mensagens')
        .orderBy('data', 'asc')
        .onSnapshot(snapshot => {
            messagesList.innerHTML = ''; // Limpa tela
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                const div = document.createElement('div');
                const isMe = msg.uid === currentUser.uid;

                div.className = `msg ${isMe ? 'sent' : 'received'}`;

                // Formatar hora
                let hora = '';
                if (msg.data) {
                    const date = msg.data.toDate();
                    hora = date.getHours().toString().padStart(2,'0') + ':' + 
                           date.getMinutes().toString().padStart(2,'0');
                }

                let conteudo = '';
                if (msg.tipo === 'imagem') {
                    conteudo = `<img src="${msg.arquivoUrl}" class="msg-img">`;
                } else if (msg.tipo === 'audio') {
                    conteudo = `
                        <audio controls controlsList="nodownload">
                            <source src="${msg.arquivoUrl}" type="audio/webm">
                            Seu navegador não suporta áudio.
                        </audio>`;
                } else {
                    conteudo = `<p>${msg.texto}</p>`;
                }

                div.innerHTML = `
                    <span class="msg-author">${isMe ? 'Você' : msg.nome}</span>
                    ${conteudo}
                    <span class="msg-time">${hora}</span>
                `;

                messagesList.appendChild(div);
            });

            // Rola para o fim
            messagesList.scrollTop = messagesList.scrollHeight;
        });
}

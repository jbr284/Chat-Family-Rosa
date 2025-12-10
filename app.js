import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs, writeBatch, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js";

const NOME_APP = "Chat Family Rosa"; 
const URL_BACKEND = "https://notificacoes-chat-family.vercel.app/api/notificar";
const VAPID_KEY = "BLuIEsTyT5C-eJppJhiLWE8_5roTQ0MxU6awA--kc6C9SBctxgxrXS3DcFJOYahrUpAaATMJnp6re1iJd7qp4jA"; 

const firebaseConfig = {
  apiKey: "AIzaSyAB3KCfomPt3TAtV9mL4lx393TaMhNA5tY",
  authDomain: "chat-family-rosa.firebaseapp.com",
  databaseURL: "https://chat-family-rosa-default-rtdb.firebaseio.com",
  projectId: "chat-family-rosa",
  storageBucket: "chat-family-rosa.firebasestorage.app",
  messagingSenderId: "237093132146",
  appId: "1:237093132146:web:280b9c3a36f1bff6672feb"
};

const somNotificacao = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const messaging = getMessaging(app);

let usuarioAtual = null;
let perfilUsuarioAtual = null;
let contatoAtual = null;
let chatIdAtual = null;
let unsubscribeChat = null; 
let unsubscribeStatus = null;
let unsubscribeDigitando = null;
let timeoutDigitando = null;

let primeiroCarregamento = true;
let mediaRecorder = null;
let audioChunks = [];
let arquivoParaEnvio = null;

function ajustarAlturaReal() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
ajustarAlturaReal();
window.addEventListener('resize', ajustarAlturaReal);

document.title = NOME_APP;
setTimeout(() => {
    const appTitles = document.querySelectorAll('.app-title');
    if(appTitles) appTitles.forEach(el => el.innerText = NOME_APP);
}, 100);

// --- NOVO: LIMPA NOTIFICAÇÕES DA BANDEJA 🧹 ---
async function limparNotificacoesDoAndroid() {
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                const notifications = await registration.getNotifications();
                notifications.forEach(notification => notification.close());
            }
        } catch (e) { console.log("Erro ao limpar notificações:", e); }
    }
}

// Limpa notificações quando a janela volta a ter foco (usuário abriu o app)
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        limparNotificacoesDoAndroid();
    }
});

// 1. MONITOR DE LOGIN & PRESENÇA
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtual = user;
        const docRef = doc(db, "usuarios", user.email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            perfilUsuarioAtual = docSnap.data();
            mostrarTela('contactsScreen');
            carregarContatosDoBanco();
            verificarEAtualizarToken();
            iniciarPresenca();
            limparNotificacoesDoAndroid(); // Limpa ao entrar
        } else {
            mostrarTela('profileScreen');
            const nomeInput = document.getElementById('profileName');
            if(nomeInput) nomeInput.value = user.displayName || "";
        }
    } else {
        usuarioAtual = null;
        perfilUsuarioAtual = null;
        mostrarTela('loginScreen');
    }
});

function iniciarPresenca() {
    const atualizarStatus = async () => {
        if(usuarioAtual) {
            const userRef = doc(db, "usuarios", usuarioAtual.email);
            await updateDoc(userRef, { online: true, vistoPorUltimo: serverTimestamp() });
        }
    };
    atualizarStatus();
    setInterval(atualizarStatus, 120000);
}

// 2. NOTIFICAÇÕES
async function verificarEAtualizarToken() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        document.getElementById('avisoNotificacao').style.display = 'none';
        await salvarTokenNoBanco();
    } else if (Notification.permission === "default") {
        document.getElementById('avisoNotificacao').style.display = 'block';
    } else {
        document.getElementById('avisoNotificacao').style.display = 'none';
    }
}
window.solicitarPermissaoNotificacao = async function() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            await salvarTokenNoBanco();
            alert("Notificações ativadas!");
            document.getElementById('avisoNotificacao').style.display = 'none';
        } else {
            alert("Permissão negada.");
        }
    } catch (error) { console.error(error); }
}
async function salvarTokenNoBanco() {
    try {
        const swRegistration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swRegistration });
        if (token && usuarioAtual) {
            const userRef = doc(db, "usuarios", usuarioAtual.email);
            await setDoc(userRef, { tokenFcm: token }, { merge: true });
        }
    } catch (err) { console.log("Erro token:", err); }
}
const btnAviso = document.getElementById('avisoNotificacao');
if(btnAviso) btnAviso.addEventListener('click', window.solicitarPermissaoNotificacao);

function chamarCarteiro(textoMensagem) {
    if (contatoAtual && contatoAtual.tokenFcm) {
        fetch(URL_BACKEND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: contatoAtual.tokenFcm,
                titulo: `Nova mensagem de ${perfilUsuarioAtual ? perfilUsuarioAtual.nome : 'Família'}`,
                corpo: textoMensagem,
                link: window.location.href
            })
        }).catch(e => console.error(e));
    }
}

// 3. PERFIL
window.salvarPerfil = async function() {
    const nome = document.getElementById('profileName').value.trim();
    const status = document.getElementById('profileStatus').value.trim();
    const btn = document.querySelector('.btn-save');
    if(!nome) return alert("Digite seu nome.");
    btn.innerText = "Salvando..."; btn.disabled = true;
    try {
        let fotoUrl = "https://cdn-icons-png.flaticon.com/512/847/847969.png";
        if (perfilUsuarioAtual && perfilUsuarioAtual.foto) fotoUrl = perfilUsuarioAtual.foto;
        const inputFoto = document.getElementById('profilePhotoInput');
        if (inputFoto.files[0]) {
            const arquivo = inputFoto.files[0];
            const storageRef = ref(storage, `perfis/${usuarioAtual.email}_${Date.now()}`);
            await uploadBytes(storageRef, arquivo);
            fotoUrl = await getDownloadURL(storageRef);
        }
        const dadosPerfil = { nome: nome, status: status || "Usando o Zap", foto: fotoUrl, email: usuarioAtual.email, online: true, vistoPorUltimo: serverTimestamp() };
        if (perfilUsuarioAtual && perfilUsuarioAtual.tokenFcm) dadosPerfil.tokenFcm = perfilUsuarioAtual.tokenFcm;
        await setDoc(doc(db, "usuarios", usuarioAtual.email), dadosPerfil);
        perfilUsuarioAtual = dadosPerfil;
        alert("Perfil salvo!");
        mostrarTela('contactsScreen');
        carregarContatosDoBanco();
    } catch (e) { console.error(e); alert("Erro ao salvar."); } 
    finally { btn.innerText = "💾 Salvar Perfil"; btn.disabled = false; }
}
window.previewImagemPerfil = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) { document.getElementById('profilePreview').src = e.target.result; }
        reader.readAsDataURL(input.files[0]);
    }
}
window.editarMeuPerfil = function() {
    if(perfilUsuarioAtual) {
        document.getElementById('profileName').value = perfilUsuarioAtual.nome;
        document.getElementById('profileStatus').value = perfilUsuarioAtual.status;
        document.getElementById('profilePreview').src = perfilUsuarioAtual.foto;
    }
    mostrarTela('profileScreen');
}

// 4. CONTATOS
function carregarContatosDoBanco() {
    const lista = document.getElementById('listaContatos');
    lista.innerHTML = '<div style="text-align:center; padding:20px;">Carregando...</div>';
    const q = query(collection(db, "usuarios"));
    onSnapshot(q, (snapshot) => {
        lista.innerHTML = "";
        const emailLogado = usuarioAtual.email.toLowerCase();
        snapshot.forEach((doc) => {
            const user = doc.data();
            if (user.email.toLowerCase() === emailLogado) return;
            const div = document.createElement('div');
            div.className = 'contact-card';
            div.onclick = () => abrirConversa(user);
            const safeId = user.email.replace(/[^a-zA-Z0-9]/g, '');
            div.innerHTML = `
                <img class="avatar" src="${user.foto}" alt="Avatar">
                <div class="contact-info">
                    <div class="contact-name">${user.nome}</div>
                    <div class="contact-status">${user.status}</div>
                </div>
                <span id="badge-${safeId}" class="badge">0</span>
            `;
            lista.appendChild(div);
            monitorarNaoLidas(user, safeId);
        });
    });
}
function monitorarNaoLidas(userContato, safeId) {
    const emailLogado = usuarioAtual.email.toLowerCase();
    const q = query(collection(db, "mensagens"), where("remetente", "==", userContato.email.toLowerCase()), where("destinatario", "==", emailLogado), where("lido", "==", false));
    onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        const badge = document.getElementById(`badge-${safeId}`);
        if (badge) {
            if (count > 0) { badge.innerText = count; badge.classList.add('visible'); } 
            else { badge.classList.remove('visible'); }
        }
    });
}

// 5. CHAT
window.abrirConversa = function(userDestino) {
    contatoAtual = userDestino;
    const emails = [usuarioAtual.email.toLowerCase(), userDestino.email.toLowerCase()].sort();
    chatIdAtual = emails.join('_');
    document.getElementById('chatTitle').innerText = userDestino.nome;
    document.getElementById('chatStatus').innerText = "Carregando status...";
    document.getElementById('chatHeaderAvatar').src = userDestino.foto;
    
    mostrarTela('chatScreen');
    
    // Limpa notificações assim que abre a conversa
    limparNotificacoesDoAndroid();

    primeiroCarregamento = true;
    iniciarEscutaMensagens();
    marcarMensagensComoLidas(userDestino.email.toLowerCase(), usuarioAtual.email.toLowerCase());
    monitorarStatusContato(userDestino.email);
    monitorarSeEleEstaDigitando(userDestino.email.toLowerCase());
}
function monitorarStatusContato(emailContato) {
    if (unsubscribeStatus) unsubscribeStatus();
    unsubscribeStatus = onSnapshot(doc(db, "usuarios", emailContato), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const elStatus = document.getElementById('chatStatus');
            const isDigitando = document.getElementById('chatStatus').classList.contains('status-digitando');
            if(isDigitando) return;
            const agora = new Date();
            let isOnline = false;
            let textoVisto = "";
            if (data.vistoPorUltimo) {
                const ultimo = data.vistoPorUltimo.toDate();
                const diffMinutos = (agora - ultimo) / 1000 / 60;
                if (diffMinutos < 3) { isOnline = true; } 
                else {
                    const hora = ultimo.getHours().toString().padStart(2,'0') + ":" + ultimo.getMinutes().toString().padStart(2,'0');
                    textoVisto = `Visto hoje às ${hora}`;
                }
            }
            if (isOnline) { elStatus.innerText = "Online"; elStatus.className = "status-online"; } 
            else { elStatus.innerText = textoVisto || data.status; elStatus.className = ""; }
        }
    });
}
window.avisarDigitando = async function() {
    const statusRef = doc(db, "conversa_status", chatIdAtual);
    const meuEmail = usuarioAtual.email.toLowerCase();
    const dados = {}; dados[`digitando_${meuEmail.replace(/\./g, '_')}`] = true;
    await setDoc(statusRef, dados, { merge: true });
    if (timeoutDigitando) clearTimeout(timeoutDigitando);
    timeoutDigitando = setTimeout(async () => {
        const dadosOff = {}; dadosOff[`digitando_${meuEmail.replace(/\./g, '_')}`] = false;
        await setDoc(statusRef, dadosOff, { merge: true });
    }, 2500);
}
function monitorarSeEleEstaDigitando(emailDele) {
    if (unsubscribeDigitando) unsubscribeDigitando();
    const statusRef = doc(db, "conversa_status", chatIdAtual);
    unsubscribeDigitando = onSnapshot(statusRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const campo = `digitando_${emailDele.replace(/\./g, '_')}`;
            const eleEstaDigitando = data[campo];
            const elStatus = document.getElementById('chatStatus');
            if (eleEstaDigitando) { elStatus.innerText = "Digitando..."; elStatus.className = "status-digitando"; } 
            else { monitorarStatusContato(contatoAtual.email); }
        }
    });
}
async function marcarMensagensComoLidas(emailRemetente, emailDestinatario) {
    const q = query(collection(db, "mensagens"), where("remetente", "==", emailRemetente), where("destinatario", "==", emailDestinatario), where("lido", "==", false));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db); 
    snapshot.forEach(doc => batch.update(doc.ref, { lido: true }));
    if (!snapshot.empty) await batch.commit();
}
window.voltarParaContatos = function() {
    if(unsubscribeChat) unsubscribeChat();
    if(unsubscribeStatus) unsubscribeStatus();
    if(unsubscribeDigitando) unsubscribeDigitando();
    mostrarTela('contactsScreen');
}
function iniciarEscutaMensagens() {
    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#666">Carregando...</div>';
    const q = query(collection(db, "mensagens"), where("chatId", "==", chatIdAtual), orderBy("data", "asc"));
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        if (!primeiroCarregamento) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const novaMsg = change.doc.data();
                    if (novaMsg.remetente.toLowerCase() !== usuarioAtual.email.toLowerCase()) {
                        tocarAlerta();
                        marcarMensagensComoLidas(novaMsg.remetente, usuarioAtual.email.toLowerCase());
                    }
                }
            });
        }
        primeiroCarregamento = false;
        chatBox.innerHTML = "";
        if(snapshot.empty) { chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Nenhuma mensagem.<br>Diga Oi! 👋</div>'; return; }
        snapshot.forEach((docSnapshot) => {
            const msg = docSnapshot.data();
            const div = document.createElement('div');
            const souEu = msg.remetente.toLowerCase() === usuarioAtual.email.toLowerCase();
            div.className = `message ${souEu ? 'mine' : 'theirs'}`;
            let statusIcon = "";
            if(souEu) statusIcon = msg.lido ? " <span style='color:#4fc3f7;'>✓✓</span>" : " <span style='color:#999;'>✓</span>";
            if (souEu) div.addEventListener('dblclick', async () => { if (confirm("Apagar?")) await deleteDoc(doc(db, "mensagens", docSnapshot.id)); });
            let hora = msg.data ? msg.data.toDate().getHours().toString().padStart(2,'0') + ":" + msg.data.toDate().getMinutes().toString().padStart(2,'0') : "...";
            let conteudoHTML = msg.texto;
            if (msg.tipo === 'imagem') conteudoHTML = `<img src="${msg.texto}" alt="Foto" loading="lazy">`;
            if (msg.tipo === 'audio') conteudoHTML = `<audio controls src="${msg.texto}"></audio>`;
            div.innerHTML = `${conteudoHTML} <span class="msg-time">${hora}${statusIcon}</span>`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTo({ left: 0, top: chatBox.scrollHeight, behavior: 'smooth' });
    });
}
function tocarAlerta() { somNotificacao.play().catch(e=>{}); }
window.enviarMensagem = async function(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto || !contatoAtual) return;
    try {
        await addDoc(collection(db, "mensagens"), { chatId: chatIdAtual, texto: texto, remetente: usuarioAtual.email.toLowerCase(), destinatario: contatoAtual.email.toLowerCase(), lido: false, tipo: "texto", data: serverTimestamp() });
        chamarCarteiro(texto);
        input.value = ""; input.focus();
    } catch(err) { console.error(err); }
}

// PREVIEW E CONFIRMAÇÃO
async function enviarArquivoComum(evento) { abrirModalPreview(evento.target.files[0]); evento.target.value = ""; }
async function enviarFotoCamera(evento) { abrirModalPreview(evento.target.files[0]); evento.target.value = ""; }

function abrirModalPreview(arquivo) {
    if (!arquivo) return;
    arquivoParaEnvio = arquivo;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('imgPreviewToSend').src = e.target.result;
        document.getElementById('imagePreviewModal').classList.add('active');
    }
    reader.readAsDataURL(arquivo);
}
window.cancelarEnvioFoto = function() {
    arquivoParaEnvio = null;
    document.getElementById('imagePreviewModal').classList.remove('active');
}
window.confirmarEnvioFoto = async function() {
    if (!arquivoParaEnvio) return;
    const btnConfirm = document.querySelector('.btn-confirm');
    btnConfirm.innerText = "Enviando..."; btnConfirm.disabled = true;
    try {
        const nomeArquivo = Date.now() + "_" + arquivoParaEnvio.name;
        const storageRef = ref(storage, `uploads/${chatIdAtual}/${nomeArquivo}`);
        await uploadBytes(storageRef, arquivoParaEnvio);
        const url = await getDownloadURL(storageRef);
        await addDoc(collection(db, "mensagens"), { chatId: chatIdAtual, texto: url, remetente: usuarioAtual.email.toLowerCase(), destinatario: contatoAtual.email.toLowerCase(), lido: false, tipo: "imagem", data: serverTimestamp() });
        chamarCarteiro("📷 Foto enviada");
    } catch (e) { console.error(e); alert("Erro ao enviar foto."); } 
    finally {
        arquivoParaEnvio = null;
        document.getElementById('imagePreviewModal').classList.remove('active');
        btnConfirm.innerText = "✅ Enviar"; btnConfirm.disabled = false;
    }
}

async function alternarGravacao() {
    const btnMic = document.getElementById('btnMic');
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const nomeArquivo = Date.now() + "_audio.webm";
                const storageRef = ref(storage, `uploads/${chatIdAtual}/${nomeArquivo}`);
                await uploadBytes(storageRef, audioBlob);
                const url = await getDownloadURL(storageRef);
                await addDoc(collection(db, "mensagens"), { chatId: chatIdAtual, texto: url, remetente: usuarioAtual.email.toLowerCase(), destinatario: contatoAtual.email.toLowerCase(), lido: false, tipo: "audio", data: serverTimestamp() });
                chamarCarteiro("🎤 Áudio enviado");
            };
            mediaRecorder.start(); btnMic.classList.add("gravando"); btnMic.innerText = "⏹️";
        } catch (e) { alert("Erro Mic"); }
    } else { mediaRecorder.stop(); btnMic.classList.remove("gravando"); btnMic.innerText = "🎤"; }
}

const inputFile = document.getElementById('fileInput'); if(inputFile) inputFile.addEventListener('change', enviarArquivoComum);
const inputCamera = document.getElementById('cameraInput'); if(inputCamera) inputCamera.addEventListener('change', enviarFotoCamera);
const btnMic = document.getElementById('btnMic'); if(btnMic) btnMic.addEventListener('click', alternarGravacao);

window.limparConversaInteira = async function() {
    if (!confirm("Apagar TUDO?")) return;
    const q = query(collection(db, "mensagens"), where("chatId", "==", chatIdAtual));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.forEach((d) => batch.delete(d.ref));
    await batch.commit();
}
window.mostrarTela = function(idTela) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(idTela).classList.add('active'); }
window.fazerLogin = function() {
    const email = document.getElementById('emailInput').value; const pass = document.getElementById('passInput').value;
    signInWithEmailAndPassword(auth, email.trim(), pass).catch(e => { document.getElementById('loginError').innerText = "Erro: " + e.message; });
}
window.fazerLogout = function() { signOut(auth); }

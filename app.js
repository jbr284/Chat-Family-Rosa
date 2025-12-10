import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs, writeBatch, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js";

// --- CONFIGURAÇÃO GERAL ---
const NOME_APP = "Zap da Família"; 

// ✅ SEU SERVIDOR BACKEND
const URL_BACKEND = "https://notificacoes-chat-family.vercel.app/api/notificar";

// ✅ SUA CHAVE PÚBLICA (VAPID)
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
let primeiroCarregamento = true;

let mediaRecorder = null;
let audioChunks = [];

// Ajuste de altura Mobile
function ajustarAlturaReal() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
ajustarAlturaReal();
window.addEventListener('resize', ajustarAlturaReal);

// Aplica o nome do App
document.title = NOME_APP;
setTimeout(() => {
    const appTitles = document.querySelectorAll('.app-title');
    if(appTitles) appTitles.forEach(el => el.innerText = NOME_APP);
}, 100);

// 1. MONITOR DE LOGIN
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtual = user;
        const docRef = doc(db, "usuarios", user.email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            perfilUsuarioAtual = docSnap.data();
            mostrarTela('contactsScreen');
            carregarContatosDoBanco();
            verificarPermissaoNotificacao();
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

// 2. SISTEMA DE NOTIFICAÇÕES REAIS (PUSH)
window.solicitarPermissaoNotificacao = async function() {
    if (!("Notification" in window)) {
        alert("Navegador sem suporte.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            const token = await getToken(messaging, { vapidKey: VAPID_KEY });
            console.log("Token gerado:", token);

            if (token && usuarioAtual) {
                const userRef = doc(db, "usuarios", usuarioAtual.email);
                await setDoc(userRef, { tokenFcm: token }, { merge: true });
                
                alert("Notificações ativadas! Agora você receberá avisos reais.");
                const aviso = document.getElementById('avisoNotificacao');
                if(aviso) aviso.style.display = 'none';
            }
        } else {
            alert("Permissão negada. Verifique as configurações do site (Cadeado).");
        }
    } catch (error) {
        console.error("Erro ao ativar notificação:", error);
        alert("Erro ao ativar. Veja o console.");
    }
}

function verificarPermissaoNotificacao() {
    if ("Notification" in window && Notification.permission === "default") {
        const aviso = document.getElementById('avisoNotificacao');
        if(aviso) aviso.style.display = 'block';
    } else {
        const aviso = document.getElementById('avisoNotificacao');
        if(aviso) aviso.style.display = 'none';
    }
}

const btnAviso = document.getElementById('avisoNotificacao');
if(btnAviso) btnAviso.addEventListener('click', window.solicitarPermissaoNotificacao);

// Função Auxiliar para Chamar o Carteiro (Backend)
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
        }).catch(e => console.error("Erro no envio push:", e));
    }
}

// 3. SALVAR PERFIL
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

        const dadosPerfil = {
            nome: nome,
            status: status || "Usando o Zap",
            foto: fotoUrl,
            email: usuarioAtual.email
        };

        if (perfilUsuarioAtual && perfilUsuarioAtual.tokenFcm) {
            dadosPerfil.tokenFcm = perfilUsuarioAtual.tokenFcm;
        }

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

// 4. LISTA DE CONTATOS
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
            if (count > 0) {
                badge.innerText = count;
                badge.classList.add('visible');
            } else {
                badge.classList.remove('visible');
            }
        }
    });
}

// 5. CHAT
window.abrirConversa = function(userDestino) {
    contatoAtual = userDestino;
    const emails = [usuarioAtual.email.toLowerCase(), userDestino.email.toLowerCase()].sort();
    chatIdAtual = emails.join('_');

    document.getElementById('chatTitle').innerText = userDestino.nome;
    const st = document.getElementById('chatStatus');
    if(st) st.innerText = userDestino.status;
    const avatarImg = document.getElementById('chatHeaderAvatar');
    if(avatarImg) avatarImg.src = userDestino.foto;
    
    mostrarTela('chatScreen');
    primeiroCarregamento = true;
    iniciarEscutaMensagens();
    marcarMensagensComoLidas(userDestino.email.toLowerCase(), usuarioAtual.email.toLowerCase());
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

// 6. ENVIOS
window.enviarMensagem = async function(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto || !contatoAtual) return;
    try {
        await addDoc(collection(db, "mensagens"), { 
            chatId: chatIdAtual, 
            texto: texto, 
            remetente: usuarioAtual.email.toLowerCase(), 
            destinatario: contatoAtual.email.toLowerCase(), 
            lido: false, 
            tipo: "texto", 
            data: serverTimestamp() 
        });
        
        chamarCarteiro(texto);

        input.value = ""; input.focus();
    } catch(err) { console.error(err); }
}

async function enviarArquivo(evento) {
    const input = evento.target; const arquivo = input.files[0];
    if (!arquivo) return;
    try {
        const nomeArquivo = Date.now() + "_" + arquivo.name;
        const storageRef = ref(storage, `uploads/${chatIdAtual}/${nomeArquivo}`);
        await uploadBytes(storageRef, arquivo);
        const url = await getDownloadURL(storageRef);
        await addDoc(collection(db, "mensagens"), { 
            chatId: chatIdAtual, 
            texto: url, 
            remetente: usuarioAtual.email.toLowerCase(), 
            destinatario: contatoAtual.email.toLowerCase(), 
            lido: false, 
            tipo: "imagem", 
            data: serverTimestamp() 
        });
        
        chamarCarteiro("📷 Mídia enviada");

    } catch (e) {}
    input.value = "";
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
                await addDoc(collection(db, "mensagens"), { 
                    chatId: chatIdAtual, 
                    texto: url, 
                    remetente: usuarioAtual.email.toLowerCase(), 
                    destinatario: contatoAtual.email.toLowerCase(), 
                    lido: false, 
                    tipo: "audio", 
                    data: serverTimestamp() 
                });
                
                chamarCarteiro("🎤 Áudio enviado");
            };
            mediaRecorder.start(); btnMic.classList.add("gravando"); btnMic.innerText = "⏹️";
        } catch (e) { alert("Erro Mic"); }
    } else { mediaRecorder.stop(); btnMic.classList.remove("gravando"); btnMic.innerText = "🎤"; }
}

const inputFile = document.getElementById('fileInput'); if(inputFile) inputFile.addEventListener('change', enviarArquivo);
const btnMic = document.getElementById('btnMic'); if(btnMic) btnMic.addEventListener('click', alternarGravacao);

window.limparConversaInteira = async function() {
    if (!confirm("Apagar TUDO?")) return;
    const q = query(collection(db, "mensagens"), where("chatId", "==", chatIdAtual));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.forEach((d) => batch.delete(d.ref));
    await batch.commit();
}

window.mostrarTela = function(idTela) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(idTela).classList.add('active');
}

window.fazerLogin = function() {
    const email = document.getElementById('emailInput').value; const pass = document.getElementById('passInput').value;
    signInWithEmailAndPassword(auth, email.trim(), pass).catch(e => { document.getElementById('loginError').innerText = "Erro: " + e.message; });
}
window.fazerLogout = function() { signOut(auth); }

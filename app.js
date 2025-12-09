import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs, writeBatch, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

// --- TÍTULO FLEXÍVEL DO APP 🏷️ ---
// Mude aqui para mudar no app inteiro!
const NOME_APP = "Zap da Família"; 

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

let usuarioAtual = null;
let perfilUsuarioAtual = null; // Guarda nome, foto, status do banco
let contatoAtual = null;
let chatIdAtual = null;
let unsubscribeChat = null; 
let primeiroCarregamento = true;
let mediaRecorder = null;
let audioChunks = [];

// Aplica o Nome do App
document.title = NOME_APP;
document.querySelectorAll('.app-title').forEach(el => el.innerText = NOME_APP);

function ajustarAlturaReal() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
ajustarAlturaReal();
window.addEventListener('resize', ajustarAlturaReal);

// 1. MONITOR DE LOGIN & PERFIL
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtual = user;
        // Verifica se o usuário já criou o perfil no banco
        const docRef = doc(db, "usuarios", user.email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // Perfil existe: Vai para contatos
            perfilUsuarioAtual = docSnap.data();
            mostrarTela('contactsScreen');
            carregarContatosDoBanco();
            verificarPermissaoNotificacao();
        } else {
            // Perfil NÃO existe: Vai para criar perfil
            mostrarTela('profileScreen');
            // Preenche o campo nome com algo padrão se der
            document.getElementById('profileName').value = user.displayName || "";
        }
    } else {
        usuarioAtual = null;
        perfilUsuarioAtual = null;
        mostrarTela('loginScreen');
    }
});

// 2. SALVAR PERFIL (NOVO 💾)
window.salvarPerfil = async function() {
    const nome = document.getElementById('profileName').value.trim();
    const status = document.getElementById('profileStatus').value.trim();
    const btn = document.querySelector('.btn-save');
    
    if(!nome) return alert("Por favor, digite seu nome.");

    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        let fotoUrl = "https://cdn-icons-png.flaticon.com/512/847/847969.png"; // Padrão
        
        // Se já tinha foto antes, mantém
        if (perfilUsuarioAtual && perfilUsuarioAtual.foto) fotoUrl = perfilUsuarioAtual.foto;

        // Se selecionou uma NOVA foto agora, faz upload
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

        // Salva na coleção "usuarios" (usando o email como ID do documento)
        await setDoc(doc(db, "usuarios", usuarioAtual.email), dadosPerfil);
        
        perfilUsuarioAtual = dadosPerfil;
        alert("Perfil salvo com sucesso!");
        mostrarTela('contactsScreen');
        carregarContatosDoBanco();

    } catch (e) {
        console.error("Erro ao salvar perfil:", e);
        alert("Erro ao salvar. Tente novamente.");
    } finally {
        btn.innerText = "💾 Salvar Perfil";
        btn.disabled = false;
    }
}

// Preview da imagem ao selecionar
window.previewImagemPerfil = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('profilePreview').src = e.target.result;
        }
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

// 3. CARREGAR CONTATOS DO BANCO (Substitui FAMILIA)
function carregarContatosDoBanco() {
    const lista = document.getElementById('listaContatos');
    lista.innerHTML = '<div style="text-align:center; padding:20px;">Atualizando lista...</div>';
    
    // Pega todos os usuários cadastrados
    const q = query(collection(db, "usuarios"));
    
    onSnapshot(q, (snapshot) => {
        lista.innerHTML = "";
        const emailLogado = usuarioAtual.email.toLowerCase();

        snapshot.forEach((doc) => {
            const user = doc.data();
            // Não mostra eu mesmo na lista
            if (user.email.toLowerCase() === emailLogado) return;

            const div = document.createElement('div');
            div.className = 'contact-card';
            div.onclick = () => abrirConversa(user);
            
            div.innerHTML = `
                <img class="avatar" src="${user.foto}" alt="Avatar">
                <div class="contact-info">
                    <div class="contact-name">${user.nome}</div>
                    <div class="contact-status">${user.status}</div>
                </div>
                <span id="badge-${user.email.replace(/[^a-zA-Z0-9]/g, '')}" class="badge">0</span>
            `;
            lista.appendChild(div);

            // Monitor de não lidas
            monitorarNaoLidas(user);
        });
    });
}

function monitorarNaoLidas(userContato) {
    const emailLogado = usuarioAtual.email.toLowerCase();
    const q = query(collection(db, "mensagens"), where("remetente", "==", userContato.email.toLowerCase()), where("destinatario", "==", emailLogado), where("lido", "==", false));
    
    onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        // ID seguro para o seletor HTML
        const safeId = userContato.email.replace(/[^a-zA-Z0-9]/g, '');
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

// 4. ABRIR CONVERSA
window.abrirConversa = function(userDestino) {
    contatoAtual = userDestino;
    const emails = [usuarioAtual.email.toLowerCase(), userDestino.email.toLowerCase()].sort();
    chatIdAtual = emails.join('_');

    document.getElementById('chatTitle').innerText = userDestino.nome;
    document.getElementById('chatStatus').innerText = userDestino.status;
    document.getElementById('chatHeaderAvatar').src = userDestino.foto;
    
    mostrarTela('chatScreen');
    primeiroCarregamento = true;
    iniciarEscutaMensagens();
    marcarMensagensComoLidas(userDestino.email.toLowerCase(), usuarioAtual.email.toLowerCase());
}

// ... (Resto das funções de mensagem permanecem iguais, só atualizando referências)

// --- FUNÇÕES AUXILIARES MANTIDAS (Notificação, Envio, etc) ---
window.mostrarTela = function(idTela) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(idTela).classList.add('active');
}

// As funções enviarMensagem, enviarArquivo, alternarGravacao, etc...
// continuam idênticas ao código anterior, pois a lógica de envio não mudou.
// Apenas vou repetir aqui as essenciais para garantir que o arquivo esteja completo.

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
                        let corpoMsg = novaMsg.tipo === 'texto' ? novaMsg.texto : '📷 Mídia';
                        // Busca nome no perfil salvo se possível, ou usa genérico
                        dispararNotificacaoSistema(contatoAtual ? contatoAtual.nome : "Novo Zap", corpoMsg);
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

// Notificações
function solicitarPermissaoNotificacao() {
    if (!("Notification" in window)) return alert("Sem suporte.");
    Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
            alert("Ativado!");
            document.getElementById('avisoNotificacao').style.display = 'none';
        }
    });
}
function verificarPermissaoNotificacao() {
    if ("Notification" in window && Notification.permission === "default") {
        document.getElementById('avisoNotificacao').style.display = 'block';
    } else {
        document.getElementById('avisoNotificacao').style.display = 'none';
    }
}
function dispararNotificacaoSistema(titulo, corpo) {
    if (Notification.permission === "granted") {
        try { new Notification(titulo, { body: corpo, icon: "https://cdn-icons-png.flaticon.com/512/1244/1244696.png" }); } catch (e) {}
    }
}
const btnAviso = document.getElementById('avisoNotificacao');
if(btnAviso) btnAviso.addEventListener('click', solicitarPermissaoNotificacao);

function tocarAlerta() { somNotificacao.play().catch(e=>{}); }

// Envios
window.enviarMensagem = async function(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto || !contatoAtual) return;
    try {
        await addDoc(collection(db, "mensagens"), { chatId: chatIdAtual, texto: texto, remetente: usuarioAtual.email.toLowerCase(), destinatario: contatoAtual.email.toLowerCase(), lido: false, tipo: "texto", data: serverTimestamp() });
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
        await addDoc(collection(db, "mensagens"), { chatId: chatIdAtual, texto: url, remetente: usuarioAtual.email.toLowerCase(), destinatario: contatoAtual.email.toLowerCase(), lido: false, tipo: "imagem", data: serverTimestamp() });
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
                await addDoc(collection(db, "mensagens"), { chatId: chatIdAtual, texto: url, remetente: usuarioAtual.email.toLowerCase(), destinatario: contatoAtual.email.toLowerCase(), lido: false, tipo: "audio", data: serverTimestamp() });
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
window.fazerLogin = function() {
    const email = document.getElementById('emailInput').value; const pass = document.getElementById('passInput').value;
    signInWithEmailAndPassword(auth, email.trim(), pass).catch(e => { document.getElementById('loginError').innerText = "Erro: " + e.message; });
}
window.fazerLogout = function() { signOut(auth); }

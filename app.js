import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAB3KCfomPt3TAtV9mL4lx393TaMhNA5tY",
  authDomain: "chat-family-rosa.firebaseapp.com",
  databaseURL: "https://chat-family-rosa-default-rtdb.firebaseio.com",
  projectId: "chat-family-rosa",
  storageBucket: "chat-family-rosa.firebasestorage.app",
  messagingSenderId: "237093132146",
  appId: "1:237093132146:web:280b9c3a36f1bff6672feb"
};

const FAMILIA = [
    { email: "jbrosa2009@gmail.com", nome: "Pai 👨🏻", avatar: "👨🏻" },
    { email: "noemielidi@gmail.com", nome: "Mãe 👩🏼", avatar: "👩🏼" },
    { email: "rosajoaobatista943@gmail.com", nome: "Filha 👧🏻", avatar: "👧🏻" }
];

const somNotificacao = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let usuarioAtual = null;
let contatoAtual = null;
let chatIdAtual = null;
let unsubscribeChat = null; 
let primeiroCarregamento = true;

let mediaRecorder = null;
let audioChunks = [];

function ajustarAlturaReal() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
ajustarAlturaReal();
window.addEventListener('resize', ajustarAlturaReal);

onAuthStateChanged(auth, (user) => {
    if (user) {
        usuarioAtual = user;
        mostrarTela('contactsScreen');
        gerarListaDeContatos();
        verificarPermissaoNotificacao(); // Checa se já temos permissão
    } else {
        usuarioAtual = null;
        mostrarTela('loginScreen');
    }
});

// --- LÓGICA DE NOTIFICAÇÃO DO SISTEMA 🔔 ---
window.solicitarPermissaoNotificacao = function() {
    if (!("Notification" in window)) {
        alert("Seu navegador não suporta notificações.");
        return;
    }
    
    // Pede permissão ao usuário
    Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
            alert("Notificações ativadas! 🎉");
            document.getElementById('avisoNotificacao').style.display = 'none';
        }
    });
}

function verificarPermissaoNotificacao() {
    // Se o navegador suporta e ainda não foi permitido ou negado
    if ("Notification" in window && Notification.permission === "default") {
        document.getElementById('avisoNotificacao').style.display = 'block';
    } else {
        document.getElementById('avisoNotificacao').style.display = 'none';
    }
}

// Envia a notificação para a barra de status do celular
function dispararNotificacaoSistema(titulo, corpo) {
    if (Notification.permission === "granted") {
        // Cria a notificação na barra do sistema
        new Notification(titulo, {
            body: corpo,
            icon: "https://cdn-icons-png.flaticon.com/512/733/733585.png" // Ícone do WhatsApp genérico
        });
    }
}
// ------------------------------------------

window.mostrarTela = function(idTela) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(idTela).classList.add('active');
    if(idTela !== 'chatScreen') document.title = "Zap da Família";
}

function gerarListaDeContatos() {
    const lista = document.getElementById('listaContatos');
    lista.innerHTML = "";
    
    const emailLogado = usuarioAtual.email.toLowerCase();
    const contatosPossiveis = FAMILIA.filter(m => m.email.toLowerCase() !== emailLogado);

    contatosPossiveis.forEach(membro => {
        const div = document.createElement('div');
        div.className = 'contact-card';
        div.onclick = () => abrirConversa(membro);
        
        div.innerHTML = `
            <div class="avatar">${membro.avatar}</div>
            <span id="badge-${membro.email}" class="badge">0</span>
            <div class="contact-name">${membro.nome}</div>
        `;
        lista.appendChild(div);

        const q = query(
            collection(db, "mensagens"),
            where("remetente", "==", membro.email.toLowerCase()),
            where("destinatario", "==", emailLogado),
            where("lido", "==", false)
        );

        onSnapshot(q, (snapshot) => {
            const count = snapshot.size; 
            const badge = document.getElementById(`badge-${membro.email}`);
            
            if (badge) {
                if (count > 0) {
                    badge.innerText = count;
                    badge.classList.add('visible');
                    // NOTIFICAÇÃO NA TELA DE CONTATOS
                    if(document.getElementById('contactsScreen').classList.contains('active')) {
                        // Só toca se tiver mudado o número (evita loop)
                        // Para simplificar, deixamos o som no chat, ou aqui se preferir
                    }
                } else {
                    badge.classList.remove('visible');
                }
            }
        });
    });
}

window.abrirConversa = function(membroDestino) {
    contatoAtual = membroDestino;
    const meuEmail = usuarioAtual.email.toLowerCase();
    const emailDele = membroDestino.email.toLowerCase();
    
    const emails = [meuEmail, emailDele].sort();
    chatIdAtual = emails.join('_');

    document.getElementById('chatTitle').innerText = membroDestino.nome;
    mostrarTela('chatScreen');
    
    primeiroCarregamento = true;
    iniciarEscutaMensagens();
    
    marcarMensagensComoLidas(emailDele, meuEmail);
}

async function marcarMensagensComoLidas(emailRemetente, emailDestinatario) {
    const q = query(
        collection(db, "mensagens"),
        where("remetente", "==", emailRemetente),
        where("destinatario", "==", emailDestinatario),
        where("lido", "==", false)
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db); 
    
    snapshot.forEach(doc => {
        batch.update(doc.ref, { lido: true });
    });

    if (!snapshot.empty) await batch.commit();
}

window.voltarParaContatos = function() {
    if(unsubscribeChat) unsubscribeChat();
    mostrarTela('contactsScreen');
}

function iniciarEscutaMensagens() {
    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#666">Carregando...</div>';

    const q = query(
        collection(db, "mensagens"), 
        where("chatId", "==", chatIdAtual),
        orderBy("data", "asc")
    );

    unsubscribeChat = onSnapshot(q, (snapshot) => {
        if (!primeiroCarregamento) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const novaMsg = change.doc.data();
                    if (novaMsg.remetente.toLowerCase() !== usuarioAtual.email.toLowerCase()) {
                        
                        // 1. Toca o som
                        tocarAlerta();
                        
                        // 2. Manda para a Barra de Status do Celular! 📲
                        let corpoMsg = novaMsg.tipo === 'texto' ? novaMsg.texto : '📷 Enviou uma mídia';
                        
                        // Descobre o nome de quem mandou
                        const remetenteObj = FAMILIA.find(f => f.email.toLowerCase() === novaMsg.remetente.toLowerCase());
                        const nomeRemetente = remetenteObj ? remetenteObj.nome : "Alguém";

                        dispararNotificacaoSistema(nomeRemetente, corpoMsg);

                        marcarMensagensComoLidas(novaMsg.remetente, usuarioAtual.email.toLowerCase());
                    }
                }
            });
        }
        primeiroCarregamento = false;

        chatBox.innerHTML = "";
        if(snapshot.empty) {
            chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#888; font-size:0.9em">Nenhuma mensagem ainda.<br>Diga Oi! 👋</div>';
            return;
        }

        snapshot.forEach((docSnapshot) => {
            const msg = docSnapshot.data();
            const msgId = docSnapshot.id; 
            const div = document.createElement('div');
            const souEu = msg.remetente.toLowerCase() === usuarioAtual.email.toLowerCase();
            
            div.className = `message ${souEu ? 'mine' : 'theirs'}`;
            
            let statusIcon = "";
            if(souEu) {
                statusIcon = msg.lido ? " <span style='color:#4fc3f7; font-size:0.8em'>✓✓</span>" : " <span style='color:#999; font-size:0.8em'>✓</span>";
            }

            if (souEu) {
                div.addEventListener('dblclick', async () => {
                    if (confirm("Apagar mensagem?")) await deleteDoc(doc(db, "mensagens", msgId));
                });
            }

            let hora = "...";
            if(msg.data) {
                const d = msg.data.toDate();
                hora = d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            }

            let conteudoHTML = msg.texto;
            if (msg.tipo === 'imagem') conteudoHTML = `<img src="${msg.texto}" alt="Foto" loading="lazy">`;
            if (msg.tipo === 'audio') conteudoHTML = `<audio controls src="${msg.texto}"></audio>`;

            div.innerHTML = `${conteudoHTML} <span class="msg-time">${hora}${statusIcon}</span>`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTo({ left: 0, top: chatBox.scrollHeight, behavior: 'smooth' });
    });
}

function tocarAlerta() {
    somNotificacao.play().catch(e => console.log("Som bloqueado:", e));
    document.title = "🔔 Nova Mensagem!";
    setTimeout(() => { document.title = "Zap da Família"; }, 3000);
}

window.enviarMensagem = async function(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto) return;
    if(!contatoAtual) return;

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
        input.value = "";
        input.focus();
    } catch(err) { console.error(err); }
}

async function enviarArquivo(evento) {
    const input = evento.target; 
    const arquivo = input.files[0];
    if (!arquivo) return;

    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML += `<div style="text-align:center; margin:10px;">Enviando foto... ⌛</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

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
    } catch (error) { console.error(error); }
    input.value = ""; 
}

async function alternarGravacao() {
    const btnMic = document.getElementById('btnMic');

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const chatBox = document.getElementById('messagesList');
                chatBox.innerHTML += `<div style="text-align:center;">Enviando áudio... 🎤</div>`;
                chatBox.scrollTop = chatBox.scrollHeight;

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
            };

            mediaRecorder.start();
            btnMic.classList.add("gravando");
            btnMic.innerText = "⏹️"; 
        } catch (err) { alert("Erro microfone: " + err.message); }
    } else {
        mediaRecorder.stop();
        btnMic.classList.remove("gravando");
        btnMic.innerText = "🎤";
    }
}

const inputFile = document.getElementById('fileInput');
if(inputFile) inputFile.addEventListener('change', enviarArquivo);
const btnMic = document.getElementById('btnMic');
if(btnMic) btnMic.addEventListener('click', alternarGravacao);

window.limparConversaInteira = async function() {
    if (!confirm("Apagar TUDO?")) return;
    try {
        const q = query(collection(db, "mensagens"), where("chatId", "==", chatIdAtual));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach((d) => batch.delete(d.ref));
        await batch.commit();
    } catch (e) { console.error(e); }
}

window.fazerLogin = function() {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    const err = document.getElementById('loginError');
    signInWithEmailAndPassword(auth, email.trim(), pass).catch(e => {
        err.innerText = "Erro: " + e.message;
    });
}

window.fazerLogout = function() {
    signOut(auth);
}

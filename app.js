import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

// --- CONFIGURAÇÃO ---
const firebaseConfig = {
  apiKey: "AIzaSyAB3KCfomPt3TAtV9mL4lx393TaMhNA5tY",
  authDomain: "chat-family-rosa.firebaseapp.com",
  databaseURL: "https://chat-family-rosa-default-rtdb.firebaseio.com",
  projectId: "chat-family-rosa",
  storageBucket: "chat-family-rosa.firebasestorage.app",
  messagingSenderId: "237093132146",
  appId: "1:237093132146:web:280b9c3a36f1bff6672feb"
};

// --- CADASTRO DA FAMÍLIA ---
const FAMILIA = [
    { email: "jbrosa2009@gmail.com", nome: "Pai 👨🏻", avatar: "👨🏻" },
    { email: "noemielidi@gmail.com", nome: "Mãe 👩🏼", avatar: "👩🏼" },
    { email: "rosajoaobatista943@gmail.com", nome: "Filha 👧🏻", avatar: "👧🏻" }
];

// Som de notificação
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

// Variáveis de Mídia
let mediaRecorder = null;
let audioChunks = [];

// --- CORREÇÃO DE ALTURA (MÓVEL) ---
function ajustarAlturaReal() {
    // Pega a altura real da janela visível em pixels e passa para o CSS
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
// Roda ao iniciar e ao redimensionar
ajustarAlturaReal();
window.addEventListener('resize', ajustarAlturaReal);


// 1. MONITOR DE LOGIN
onAuthStateChanged(auth, (user) => {
    if (user) {
        usuarioAtual = user;
        mostrarTela('contactsScreen');
        gerarListaDeContatos();
    } else {
        usuarioAtual = null;
        mostrarTela('loginScreen');
    }
});

// 2. FUNÇÕES DE NAVEGAÇÃO
window.mostrarTela = function(idTela) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(idTela).classList.add('active');
    if(idTela !== 'chatScreen') document.title = "Zap da Família";
}

// 3. LÓGICA DE CONTATOS (COM BADGE 🔴)
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

        // MONITOR DE MENSAGENS NÃO LIDAS PARA ESTE CONTATO
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
                    // Toca som se estiver na tela de contatos e chegar msg nova
                    if(document.getElementById('contactsScreen').classList.contains('active') && count > 0) {
                        // Opcional: tocarAlerta() aqui se quiser som na lista também
                    }
                } else {
                    badge.classList.remove('visible');
                }
            }
        });
    });
}

// 4. ABRIR CONVERSA
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
    
    // Marca mensagens como lidas imediatamente ao entrar
    marcarMensagensComoLidas(emailDele, meuEmail);
}

// FUNÇÃO PARA MARCAR COMO LIDO
async function marcarMensagensComoLidas(emailRemetente, emailDestinatario) {
    const q = query(
        collection(db, "mensagens"),
        where("remetente", "==", emailRemetente),
        where("destinatario", "==", emailDestinatario),
        where("lido", "==", false)
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db); // Prepara para atualizar várias de uma vez
    
    snapshot.forEach(doc => {
        batch.update(doc.ref, { lido: true });
    });

    if (!snapshot.empty) await batch.commit();
}

window.voltarParaContatos = function() {
    if(unsubscribeChat) unsubscribeChat();
    mostrarTela('contactsScreen');
}

// 5. CHAT EM TEMPO REAL
function iniciarEscutaMensagens() {
    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#666">Carregando...</div>';

    const q = query(
        collection(db, "mensagens"), 
        where("chatId", "==", chatIdAtual),
        orderBy("data", "asc")
    );

    unsubscribeChat = onSnapshot(q, (snapshot) => {
        // Notificação sonora quando o chat está aberto
        if (!primeiroCarregamento) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const novaMsg = change.doc.data();
                    // Se a mensagem não é minha
                    if (novaMsg.remetente.toLowerCase() !== usuarioAtual.email.toLowerCase()) {
                        tocarAlerta();
                        // Se o chat está aberto, já marco como lido na hora
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
            
            // Ícone de status (✓ ou ✓✓)
            let statusIcon = "";
            if(souEu) {
                statusIcon = msg.lido ? " <span style='color:#4fc3f7; font-size:0.8em'>✓✓</span>" : " <span style='color:#999; font-size:0.8em'>✓</span>";
            }

            // Duplo clique para apagar
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
    somNotificacao.play().catch(e => console.log("Som bloqueado pelo navegador:", e));
    document.title = "🔔 Nova Mensagem!";
    setTimeout(() => { document.title = "Zap da Família"; }, 3000);
}

// 6. ENVIAR TEXTO (Com Destinatário e lido:false)
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

// 7. ENVIAR FOTO (Com Destinatário e lido:false)
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

// 8. GRAVAR ÁUDIO (Com Destinatário e lido:false)
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

// 9. LISTENERS (Botões do rodapé)
const inputFile = document.getElementById('fileInput');
if(inputFile) inputFile.addEventListener('change', enviarArquivo);
const btnMic = document.getElementById('btnMic');
if(btnMic) btnMic.addEventListener('click', alternarGravacao);

// 10. LIMPAR CONVERSA
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

// 11. LOGIN / LOGOUT
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

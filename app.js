import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
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
    { 
        email: "jbrosa2009@gmail.com", 
        nome: "Pai 👨🏻", 
        avatar: "👨🏻" 
    },
    { 
        email: "noemielidi@gmail.com", 
        nome: "Mãe 👩🏼", 
        avatar: "👩🏼" 
    },
    { 
        email: "rosajoaobatista943@gmail.com", 
        nome: "Filha 👧🏻", 
        avatar: "👧🏻" 
    }
];

// --- SOM DE NOTIFICAÇÃO 🔔 ---
// Link direto para um som curto de "ding"
const somNotificacao = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let usuarioAtual = null;
let contatoAtual = null;
let chatIdAtual = null;
let unsubscribe = null;
let primeiroCarregamento = true; // Flag para não tocar som ao abrir o app

// Variáveis para Áudio (Microfone)
let mediaRecorder = null;
let audioChunks = [];

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
    
    // Se voltar para a lista, reseta o título
    if(idTela !== 'chatScreen') {
        document.title = "Zap da Família";
    }
}

// 3. LÓGICA DE CONTATOS
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
            <div class="contact-name">${membro.nome}</div>
        `;
        lista.appendChild(div);
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
    
    // Reseta flag para só tocar som em mensagens NOVAS
    primeiroCarregamento = true; 
    iniciarEscutaMensagens();
}

window.voltarParaContatos = function() {
    if(unsubscribe) unsubscribe();
    mostrarTela('contactsScreen');
}

// 5. CHAT EM TEMPO REAL (AGORA COM NOTIFICAÇÃO 🔔)
function iniciarEscutaMensagens() {
    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#666">Carregando...</div>';

    const q = query(
        collection(db, "mensagens"), 
        where("chatId", "==", chatIdAtual),
        orderBy("data", "asc")
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        // --- LÓGICA DE NOTIFICAÇÃO ---
        // Verificamos o que mudou (adicionado, modificado, removido)
        // docChanges é mais inteligente que ler tudo de novo
        if (!primeiroCarregamento) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const novaMsg = change.doc.data();
                    // Se a mensagem NÃO fui eu que mandei...
                    if (novaMsg.remetente.toLowerCase() !== usuarioAtual.email.toLowerCase()) {
                        tocarAlerta();
                    }
                }
            });
        }
        primeiroCarregamento = false; // Já carregou o histórico inicial

        // --- RENDERIZAÇÃO (Mantemos a lógica de limpar e redesenhar por segurança) ---
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
            
            // Apagar Mensagem
            if (souEu) {
                div.title = "Dê dois cliques para apagar";
                div.addEventListener('dblclick', async () => {
                    if (confirm("Deseja apagar esta mensagem?")) {
                        await deleteDoc(doc(db, "mensagens", msgId));
                    }
                });
            }

            let hora = "...";
            if(msg.data) {
                const d = msg.data.toDate();
                hora = d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            }

            // Exibição por Tipo
            let conteudoHTML = "";
            if (msg.tipo === 'imagem') {
                conteudoHTML = `<img src="${msg.texto}" alt="Foto" loading="lazy">`;
            } 
            else if (msg.tipo === 'audio') {
                conteudoHTML = `<audio controls src="${msg.texto}"></audio>`;
            } 
            else {
                conteudoHTML = msg.texto;
            }

            div.innerHTML = `${conteudoHTML} <span class="msg-time">${hora}</span>`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTo({ left: 0, top: chatBox.scrollHeight, behavior: 'smooth' });
    });
}

// FUNÇÃO AUXILIAR DE ALERTA
function tocarAlerta() {
    // 1. Toca o som
    somNotificacao.play().catch(erro => console.log("Navegador bloqueou som automático:", erro));
    
    // 2. Muda o título da aba
    document.title = "🔔 Nova Mensagem!";
    
    // 3. Volta o título ao normal depois de 3 segundos
    setTimeout(() => {
        document.title = "Zap da Família";
    }, 3000);
}

// 6. ENVIAR TEXTO
window.enviarMensagem = async function(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto) return;

    try {
        await addDoc(collection(db, "mensagens"), {
            chatId: chatIdAtual,
            texto: texto,
            remetente: usuarioAtual.email.toLowerCase(),
            tipo: "texto",
            data: serverTimestamp()
        });
        input.value = "";
        input.focus();
    } catch(err) {
        console.error("Erro ao enviar:", err);
    }
}

// 7. ENVIAR FOTO
async function enviarArquivo(evento) {
    const input = evento.target; 
    const arquivo = input.files[0];
    if (!arquivo) return;

    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML += `<div style="text-align:center; font-size:0.8em; color:#666; margin:10px;">Enviando foto... ⌛</div>`;
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
            tipo: "imagem", 
            data: serverTimestamp()
        });
    } catch (error) {
        console.error(error);
        alert("Erro ao enviar imagem.");
    }
    input.value = ""; 
}

// 8. GRAVAR ÁUDIO
async function alternarGravacao() {
    const btnMic = document.getElementById('btnMic');

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const chatBox = document.getElementById('messagesList');
                chatBox.innerHTML += `<div style="text-align:center; font-size:0.8em; color:#666;">Enviando áudio... 🎤</div>`;
                chatBox.scrollTop = chatBox.scrollHeight;

                const nomeArquivo = Date.now() + "_audio.webm";
                const storageRef = ref(storage, `uploads/${chatIdAtual}/${nomeArquivo}`);
                
                await uploadBytes(storageRef, audioBlob);
                const url = await getDownloadURL(storageRef);

                await addDoc(collection(db, "mensagens"), {
                    chatId: chatIdAtual,
                    texto: url, 
                    remetente: usuarioAtual.email.toLowerCase(),
                    tipo: "audio",
                    data: serverTimestamp()
                });
            };

            mediaRecorder.start();
            btnMic.classList.add("gravando");
            btnMic.innerText = "⏹️"; 

        } catch (err) {
            alert("Erro: Precisamos de permissão para usar o microfone.");
            console.error(err);
        }
    } else {
        mediaRecorder.stop();
        btnMic.classList.remove("gravando");
        btnMic.innerText = "🎤";
    }
}

// 9. LISTENERS
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
        snapshot.forEach(async (d) => await deleteDoc(doc(db, "mensagens", d.id)));
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

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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

// --- CADASTRO DA FAMÍLIA (Edite aqui!) ---
// Isso serve para gerar a lista de contatos automaticamente
const FAMILIA = [
    { email: "joão@rosa.family", nome: "Pai 👨🏻", avatar: "👨🏻" },
    { email: "noemi@rosa.family", nome: "Mãe 👩🏼", avatar: "👩🏼" },
    { email: "lilica@rosa.family", nome: "Filha 👧🏻", avatar: "👧🏻" }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let usuarioAtual = null;
let contatoAtual = null; // Com quem estou falando agora?
let chatIdAtual = null;  // Qual a sala (ID)?
let unsubscribe = null;  // Para parar de escutar o chat quando sair

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
}

// 3. LÓGICA DE CONTATOS
function gerarListaDeContatos() {
    const lista = document.getElementById('listaContatos');
    lista.innerHTML = ""; // Limpa

    // Filtra para não mostrar eu mesmo na lista
    const contatosPossiveis = FAMILIA.filter(m => m.email !== usuarioAtual.email);

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

// 4. ABRIR CONVERSA (O Pulo do Gato 🐈)
window.abrirConversa = function(membroDestino) {
    contatoAtual = membroDestino;
    
    // GERA O ID DA SALA: Junta os dois emails em ordem alfabética
    // Ex: "mae@..." e "pai@..." vira sempre "mae@..._pai@..."
    const emails = [usuarioAtual.email, membroDestino.email].sort();
    chatIdAtual = emails.join('_');

    document.getElementById('chatTitle').innerText = membroDestino.nome;
    mostrarTela('chatScreen');
    
    iniciarEscutaMensagens();
}

window.voltarParaContatos = function() {
    if(unsubscribe) unsubscribe(); // Para de gastar internet escutando o chat
    mostrarTela('contactsScreen');
}

// 5. CHAT EM TEMPO REAL
function iniciarEscutaMensagens() {
    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#666">Carregando...</div>';

    // Busca apenas mensagens desta sala específica (chatIdAtual)
    const q = query(
        collection(db, "mensagens"), 
        where("chatId", "==", chatIdAtual),
        orderBy("data", "asc")
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        chatBox.innerHTML = "";
        
        if(snapshot.empty) {
            chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#888; font-size:0.9em">Nenhuma mensagem ainda.<br>Diga Oi! 👋</div>';
            return;
        }

        snapshot.forEach((doc) => {
            const msg = doc.data();
            const div = document.createElement('div');
            const souEu = msg.remetente === usuarioAtual.email;

            div.className = `message ${souEu ? 'mine' : 'theirs'}`;
            
            // Hora
            let hora = "";
            if(msg.data) {
                const d = msg.data.toDate();
                hora = d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            }

            div.innerHTML = `${msg.texto} <span class="msg-time">${hora}</span>`;
            chatBox.appendChild(div);
        });

        chatBox.scrollTop = chatBox.scrollHeight; // Rola pro final
    });
}

// 6. ENVIAR
window.enviarMensagem = async function(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto) return;

    try {
        await addDoc(collection(db, "mensagens"), {
            chatId: chatIdAtual, // Importante: Salva em qual sala foi
            texto: texto,
            remetente: usuarioAtual.email,
            tipo: "texto",
            data: serverTimestamp()
        });
        input.value = "";
    } catch(err) {
        console.error(err);
    }
}

// 7. LOGIN / LOGOUT
window.fazerLogin = function() {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    const err = document.getElementById('loginError');
    
    signInWithEmailAndPassword(auth, email, pass).catch(e => {
        err.innerText = "Erro: " + e.message;
    });
}

window.fazerLogout = function() {
    signOut(auth);
}

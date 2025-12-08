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

// --- CADASTRO DA FAMÍLIA (CORRIGIDO: Pai e Filha trocados) ---
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let usuarioAtual = null;
let contatoAtual = null;
let chatIdAtual = null;
let unsubscribe = null;

// 1. MONITOR DE LOGIN
onAuthStateChanged(auth, (user) => {
    if (user) {
        usuarioAtual = user;
        console.log("Logado como:", user.email);
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
    lista.innerHTML = "";

    // Normaliza para comparar emails sempre em minúsculo
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

// 4. ABRIR CONVERSA (CORRIGIDO PARA MINÚSCULAS 🛠️)
window.abrirConversa = function(membroDestino) {
    contatoAtual = membroDestino;
    
    // Transforma tudo em minúsculo para garantir que o ID seja igual para todos
    const meuEmail = usuarioAtual.email.toLowerCase();
    const emailDele = membroDestino.email.toLowerCase();

    // Ordena alfabeticamente
    const emails = [meuEmail, emailDele].sort();
    
    // Cria o ID único da sala
    chatIdAtual = emails.join('_');
    console.log("Entrando no Chat ID:", chatIdAtual);

    document.getElementById('chatTitle').innerText = membroDestino.nome;
    mostrarTela('chatScreen');
    
    iniciarEscutaMensagens();
}

window.voltarParaContatos = function() {
    if(unsubscribe) unsubscribe();
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

    unsubscribe = onSnapshot(q, (snapshot) => {
        chatBox.innerHTML = "";
        
        if(snapshot.empty) {
            chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#888; font-size:0.9em">Nenhuma mensagem ainda.<br>Diga Oi! 👋</div>';
            return;
        }

        snapshot.forEach((doc) => {
            const msg = doc.data();
            const div = document.createElement('div');
            
            // Compara emails em minúsculo para saber quem enviou
            const souEu = msg.remetente.toLowerCase() === usuarioAtual.email.toLowerCase();

            div.className = `message ${souEu ? 'mine' : 'theirs'}`;
            
            // Tratamento de Hora (Evita erro se data for null no inicio)
            let hora = "...";
            if(msg.data) {
                const d = msg.data.toDate();
                hora = d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            }

            div.innerHTML = `${msg.texto} <span class="msg-time">${hora}</span>`;
            chatBox.appendChild(div);
        });

        // Rola pro final suavemente
        chatBox.scrollTo({ left: 0, top: chatBox.scrollHeight, behavior: 'smooth' });
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
            chatId: chatIdAtual,
            texto: texto,
            remetente: usuarioAtual.email.toLowerCase(), // Salva sempre em minúsculo
            tipo: "texto",
            data: serverTimestamp()
        });
        input.value = "";
        input.focus(); // Mantém o teclado aberto/foco no input
    } catch(err) {
        console.error("Erro ao enviar:", err);
    }
}

// 7. LOGIN / LOGOUT
window.fazerLogin = function() {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    const err = document.getElementById('loginError');
    
    // Limpa espaços extras que o corretor do celular pode colocar
    signInWithEmailAndPassword(auth, email.trim(), pass).catch(e => {
        err.innerText = "Erro: " + e.message;
    });
}

window.fazerLogout = function() {
    signOut(auth);
}


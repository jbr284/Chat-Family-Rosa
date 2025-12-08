import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
// NOVO: Importamos o Storage
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

// --- CADASTRO DA FAMÍLIA (COM OS EMAILS CORRETOS DO GMAIL) ---
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
const storage = getStorage(app); // Inicializa o Storage

let usuarioAtual = null;
let contatoAtual = null;
let chatIdAtual = null;
let unsubscribe = null;

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
    
    // Ordena para garantir ID único
    const emails = [meuEmail, emailDele].sort();
    chatIdAtual = emails.join('_');

    document.getElementById('chatTitle').innerText = membroDestino.nome;
    mostrarTela('chatScreen');
    iniciarEscutaMensagens();
}

window.voltarParaContatos = function() {
    if(unsubscribe) unsubscribe();
    mostrarTela('contactsScreen');
}

// 5. CHAT EM TEMPO REAL (AGORA COM FOTOS 📸)
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
            const souEu = msg.remetente.toLowerCase() === usuarioAtual.email.toLowerCase();

            div.className = `message ${souEu ? 'mine' : 'theirs'}`;
            
            // Tratamento de Hora
            let hora = "...";
            if(msg.data) {
                const d = msg.data.toDate();
                hora = d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            }

            // --- LÓGICA DE EXIBIÇÃO (TEXTO OU IMAGEM) ---
            let conteudoHTML = "";
            if (msg.tipo === 'imagem') {
                // Se for imagem, cria a tag IMG com o link do Storage
                conteudoHTML = `<img src="${msg.texto}" alt="Foto enviada" loading="lazy">`;
            } else {
                // Se for texto normal
                conteudoHTML = msg.texto;
            }

            div.innerHTML = `${conteudoHTML} <span class="msg-time">${hora}</span>`;
            chatBox.appendChild(div);
        });

        // Rola pro final suavemente
        chatBox.scrollTo({ left: 0, top: chatBox.scrollHeight, behavior: 'smooth' });
    });
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

// 7. ENVIAR ARQUIVO (NOVO! 📸)
window.enviarArquivo = async function(input) {
    const arquivo = input.files[0];
    if (!arquivo) return;

    // Feedback simples visual
    const chatBox = document.getElementById('messagesList');
    chatBox.innerHTML += `<div style="text-align:center; font-size:0.8em; color:#666; margin:10px;">Enviando foto... ⌛</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        // 1. Criar referência única no Storage
        const nomeArquivo = Date.now() + "_" + arquivo.name;
        const storageRef = ref(storage, `uploads/${chatIdAtual}/${nomeArquivo}`);

        // 2. Fazer Upload
        await uploadBytes(storageRef, arquivo);

        // 3. Pegar Link
        const url = await getDownloadURL(storageRef);

        // 4. Salvar no Banco
        await addDoc(collection(db, "mensagens"), {
            chatId: chatIdAtual,
            texto: url,  // O texto vira o LINK
            remetente: usuarioAtual.email.toLowerCase(),
            tipo: "imagem", 
            data: serverTimestamp()
        });

    } catch (error) {
        console.error("Erro upload:", error);
        alert("Erro ao enviar imagem. Verifique o console.");
    }

    input.value = ""; // Reseta o input
}

// 8. LOGIN / LOGOUT
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

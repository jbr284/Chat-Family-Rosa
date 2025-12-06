import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
// ADICIONEI: deleteDoc e doc nas importações abaixo
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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

window.mostrarTela = function(idTela) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(idTela).classList.add('active');
}

function gerarListaDeContatos() {
    const lista = document.getElementById('listaContatos');
    lista.innerHTML = "";
    
    const contatosPossiveis = FAMILIA.filter(m => m.email !== usuarioAtual.email);

    contatosPossiveis.forEach(membro => {
        const div = document.createElement('div');
        div.className = 'contact-card';
        div.onclick = () => abrirConversa(membro);
        div.innerHTML = `<div class="avatar">${membro.avatar}</div><div class="contact-name">${membro.nome}</div>`;
        lista.appendChild(div);
    });
}

window.abrirConversa = function(membroDestino) {
    contatoAtual = membroDestino;
    const emails = [usuarioAtual.email, membroDestino.email].sort();
    chatIdAtual = emails.join('_');

    document.getElementById('chatTitle').innerText = membroDestino.nome;
    mostrarTela('chatScreen');
    iniciarEscutaMensagens();
}

window.voltarParaContatos = function() {
    if(unsubscribe) unsubscribe();
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

    unsubscribe = onSnapshot(q, (snapshot) => {
        chatBox.innerHTML = "";
        
        if(snapshot.empty) {
            chatBox.innerHTML = '<div style="text-align:center; padding:20px; color:#888; font-size:0.9em">Nenhuma mensagem.<br>Envie algo! 📷</div>';
            return;
        }

        snapshot.forEach((documento) => {
            const msg = documento.data();
            const idMsg = documento.id; // ID para poder apagar
            const div = document.createElement('div');
            const souEu = msg.remetente === usuarioAtual.email;

            div.className = `message ${souEu ? 'mine' : 'theirs'}`;
            
            // --- NOVO: EVENTO PARA APAGAR (DUPLO CLIQUE) ---
            if (souEu) {
                div.title = "Toque 2x para apagar"; // Dica visual no PC
                div.ondblclick = () => confirmarExclusao(idMsg);
            }

            let hora = "";
            if(msg.data) {
                const d = msg.data.toDate();
                hora = d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            }

            let conteudoHTML = "";
            if (msg.tipo === "imagem") {
                conteudoHTML = `<img src="${msg.url_arquivo}" class="chat-img" onclick="window.open(this.src)">`;
                if(msg.texto) conteudoHTML += `<br>${msg.texto}`;
            } else {
                conteudoHTML = msg.texto;
            }

            div.innerHTML = `${conteudoHTML} <span class="msg-time">${hora}</span>`;
            chatBox.appendChild(div);
        });

        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// --- FUNÇÃO NOVA: APAGAR MENSAGEM ---
window.confirmarExclusao = async function(idDocumento) {
    if(confirm("🗑️ Deseja apagar esta mensagem para todos?")) {
        try {
            await deleteDoc(doc(db, "mensagens", idDocumento));
            // Não precisa fazer nada visual, o onSnapshot remove ela da tela sozinho!
        } catch (e) {
            alert("Erro ao apagar: " + e.message);
        }
    }
}

window.enviarMensagem = async function(e) {
    e.preventDefault();
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto) return;

    try {
        await addDoc(collection(db, "mensagens"), {
            chatId: chatIdAtual,
            texto: texto,
            remetente: usuarioAtual.email,
            tipo: "texto",
            data: serverTimestamp()
        });
        input.value = "";
    } catch(err) { console.error(err); alert("Erro ao enviar."); }
}

window.enviarFoto = async function(inputElement) {
    const arquivo = inputElement.files[0];
    if (!arquivo) return;

    const btn = document.querySelector('.btn-anexo');
    const originalText = btn.innerText;
    btn.innerText = "⏳";
    btn.disabled = true;

    try {
        const nomeUnico = `chat_fotos/${Date.now()}_${arquivo.name}`;
        const storageRef = ref(storage, nomeUnico);
        const snapshot = await uploadBytes(storageRef, arquivo);
        const url = await getDownloadURL(snapshot.ref);

        await addDoc(collection(db, "mensagens"), {
            chatId: chatIdAtual,
            texto: "", 
            remetente: usuarioAtual.email,
            tipo: "imagem",
            url_arquivo: url,
            data: serverTimestamp()
        });

    } catch(err) {
        console.error(err);
        alert("Erro ao enviar foto: " + err.message);
    } finally {
        inputElement.value = ""; 
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

window.fazerLogin = function() {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    const err = document.getElementById('loginError');
    signInWithEmailAndPassword(auth, email, pass).catch(e => err.innerText = e.message);
}
window.fazerLogout = function() { signOut(auth); }

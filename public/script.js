const socket = io();

// === Elements du DOM ===
const messagesDiv = document.getElementById("messages");
const usersList = document.getElementById("users");
const pseudoInput = document.getElementById("pseudo");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("send");
const privateMessagesDiv = document.getElementById("private-messages");

// Charger le pseudo depuis le cookie
if (document.cookie.includes("pseudo=")) {
    pseudoInput.value = document.cookie.split("pseudo=")[1];
}

// Définir pseudo quand l'utilisateur le tape
pseudoInput.addEventListener("change", () => {
    const pseudo = pseudoInput.value;
    document.cookie = `pseudo=${pseudo}`;
    socket.emit("set_pseudo", pseudo);
});

// Affiche les 25 derniers messages
socket.on("load_messages", (messages) => {
    messages.forEach(addMessage);
});

// Affiche un nouveau message
socket.on("new_message", (data) => {
    addMessage(data);
});

// Affiche les utilisateurs connectés
socket.on("update_users", (users) => {
    usersList.innerHTML = "";
    for (let id in users) {
        const li = document.createElement("li");
        li.textContent = users[id].pseudo;
        li.addEventListener("click", () => openPrivateChat(id));
        usersList.appendChild(li);
    }
});

// Message d'erreur pseudo
socket.on("pseudo_error", (msg) => {
    alert(msg);
});

// Envoyer un message global
sendBtn.addEventListener("click", () => {
    const msg = messageInput.value;
    if (msg.trim() !== "") {
        socket.emit("send_message", msg);
        messageInput.value = "";
    }
});

// Fonction pour afficher un message dans le chat
function addMessage(data) {
    const div = document.createElement("div");
    div.classList.add("message");
    div.innerHTML = `<strong>[${data.timestamp}] ${data.pseudo}:</strong> ${data.message}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Gestion du chat privé
function openPrivateChat(targetId) {
    const msg = prompt("Message privé à envoyer :");
    if (msg && msg.trim() !== "") {
        socket.emit("send_private", { targetId, message: msg });
    }
}

// Affichage des messages privés
socket.on("private_message", (data) => {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${data.from}:</strong> ${data.message} <em>(${data.timestamp})</em>`;
    privateMessagesDiv.appendChild(div);
});

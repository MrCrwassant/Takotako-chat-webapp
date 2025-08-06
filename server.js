// === Import des modules nécessaires ===
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const path = require("path");
const { networkInterfaces } = require("os");

// === Création de l'app Express et du serveur HTTP ===
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// === Middleware pour servir les fichiers statiques ===
app.use(express.static(path.join(__dirname, "public")));

// === Configuration de la DB SQLite ===
const db = new sqlite3.Database("./db.sqlite");

// Création de la table messages si elle n'existe pas
db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT,
    message TEXT,
    timestamp TEXT
)`);

// === Liste des utilisateurs connectés (en mémoire) ===
let connectedUsers = {};

// === Fonction pour générer un ID unique à partir de l'IP + random salt ===
function generateUniqueId(ip) {
    return crypto.createHash('sha256').update(ip + Date.now() + Math.random()).digest('hex').slice(0, 16);
}

// === Récupérer l'adresse IP du socket ===
function getClientIp(socket) {
    return socket.handshake.address.replace(/^.*:/, ''); // On nettoie l'IPv6
}

// === Socket.IO ===
io.on("connection", (socket) => {
    const ip = getClientIp(socket);
    const userId = generateUniqueId(ip);
    let userPseudo = null;

    console.log(`Nouvelle connexion depuis IP: ${ip}`);

    // Récupère les 25 derniers messages depuis la DB et les envoie au nouvel utilisateur
    db.all("SELECT * FROM messages ORDER BY id DESC LIMIT 25", [], (err, rows) => {
        if (!err) {
            socket.emit("load_messages", rows.reverse());
        }
    });

    // Réception du pseudo
    socket.on("set_pseudo", (pseudo) => {
        const forbidden = ["croissant", "crwassant", "mrcrwassant", "mrcroissant", "admin", "administrateur"];
        if (forbidden.includes(pseudo.toLowerCase())) {
            socket.emit("pseudo_error", "Ce pseudo est interdit.");
            return;
        }
        userPseudo = pseudo;
        connectedUsers[userId] = { pseudo: userPseudo };
        io.emit("update_users", connectedUsers);
        console.log(`Utilisateur connecté: ${userPseudo} (${userId})`);
    });

    // Réception d'un message global
    socket.on("send_message", (message) => {
        if (!userPseudo) return; // On ignore si l'utilisateur n'a pas choisi de pseudo
        const timestamp = new Date().toLocaleTimeString();

        // Sauvegarde en DB
        db.run(`INSERT INTO messages (pseudo, message, timestamp) VALUES (?, ?, ?)`, [userPseudo, message, timestamp]);

        // Envoie à tous les clients
        io.emit("new_message", { pseudo: userPseudo, message, timestamp });
    });

    // Réception d'un message privé
    socket.on("send_private", ({ targetId, message }) => {
        const timestamp = new Date().toLocaleTimeString();
        if (connectedUsers[targetId]) {
            io.to(targetId).emit("private_message", { from: userPseudo, message, timestamp });
            socket.emit("private_message", { from: "Moi", message, timestamp });
        }
    });

    // Déconnexion
    socket.on("disconnect", () => {
        delete connectedUsers[userId];
        io.emit("update_users", connectedUsers);
        console.log(`Utilisateur déconnecté: ${userPseudo} (${userId})`);
    });
});

// === Lancement du serveur ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});

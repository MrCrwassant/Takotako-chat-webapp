import express from "express";
import http from "http";
import { Server } from "socket.io";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(cookieParser());

// Données en mémoire (à remplacer par DB plus tard)
const usersDB = {}; // username => { displayName, passwordHash }
const connectedUsers = new Map(); // socket.id => { username, displayName }
const messages = []; // derniers 25 messages

const bannedUsernames = [
  "croissant", "crwassant", "mrcrwassant", "mrcroissant",
  "admin", "administrateur", "banni", "interdit"
];

// Utils
function isBannedUsername(name) {
  return bannedUsernames.includes(name.toLowerCase());
}

// Routes API
app.post("/api/register", async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) return res.json({ success: false, message: "Champs manquants." });
  if (isBannedUsername(username)) return res.json({ success: false, message: "Nom d'utilisateur interdit." });
  if (usersDB[username]) return res.json({ success: false, message: "Nom d'utilisateur déjà pris." });

  // Validation simple côté serveur
  if (!/^[a-z0-9]{1,18}$/.test(username)) return res.json({ success: false, message: "Nom d'utilisateur invalide." });
  if (!/^[A-Za-z0-9!?\(\)\[\]:;, ]{1,14}$/.test(displayName)) return res.json({ success: false, message: "Nom d'affichage invalide." });
  if (password.length < 8 || password.length > 64) return res.json({ success: false, message: "Mot de passe invalide." });

  const hash = await bcrypt.hash(password, 10);
  usersDB[username] = { displayName, passwordHash: hash };
  console.log(`[REGISTER] ${username}`);

  res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Champs manquants." });

  const user = usersDB[username];
  if (!user) return res.json({ success: false, message: "Utilisateur inconnu." });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.json({ success: false, message: "Mot de passe incorrect." });

  console.log(`[LOGIN] ${username}`);
  res.json({ success: true, displayName: user.displayName });
});

// Socket.io
io.on("connection", (socket) => {
  console.log(`Socket connecté: ${socket.id}`);

  socket.on("auth", ({ username }) => {
    const user = usersDB[username];
    if (!user) {
      socket.emit("auth-error", "Utilisateur non trouvé");
      socket.disconnect();
      return;
    }
    connectedUsers.set(socket.id, { username, displayName: user.displayName });
    updateUsersList();
    socket.emit("chat-history", messages);
    console.log(`[SOCKET] ${username} connecté`);
  });

  socket.on("chat-message", (msg) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    const timestamp = new Date().toISOString();
    const messageObj = {
      from: user.username,
      displayName: user.displayName,
      content: msg,
      timestamp,
    };

    messages.push(messageObj);
    if (messages.length > 25) messages.shift();

    io.emit("chat-message", messageObj);
  });

  socket.on("private-message", ({ toUsername, content }) => {
    const fromUser = connectedUsers.get(socket.id);
    if (!fromUser) return;

    for (const [sockId, user] of connectedUsers.entries()) {
      if (user.username === toUsername) {
        io.to(sockId).emit("private-message", {
          fromUsername: fromUser.username,
          fromDisplayName: fromUser.displayName,
          content,
          timestamp: new Date().toISOString(),
        });
        socket.emit("private-message-sent", { toUsername, content });
        break;
      }
    }
  });

  socket.on("disconnect", () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`[SOCKET] ${user.username} déconnecté`);
      connectedUsers.delete(socket.id);
      updateUsersList();
    }
  });
});

function updateUsersList() {
  const userList = [];
  connectedUsers.forEach((user) => {
    userList.push({ username: user.username, displayName: user.displayName });
  });
  io.emit("users-list", userList);
}

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});

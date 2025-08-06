// == VARIABLES GLOBALES ==
const socket = io(); // connexion socket.io

// Éléments DOM
const authPopup = document.getElementById('auth-popup');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const chatApp = document.getElementById('chat-app');
const usersList = document.getElementById('usersList');
const messagesList = document.getElementById('messagesList');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const contactsDropdown = document.getElementById('contactsDropdown');
const privateNotif = document.getElementById('privateNotif');
const notifSender = document.getElementById('notifSender');
const ignoreBtn = document.getElementById('ignoreBtn');
const readBtn = document.getElementById('readBtn');
const missedNotif = document.getElementById('missedNotif');

let currentUser = null;        // info utilisateur connecté {username, displayName, token}
let contacts = [];             // liste contacts enregistrés [{username, displayName}]
let missedNotifications = 0;   // compteur notifs privées ratées
let activePrivateChats = {};   // {usernameDest: [messages]}

// == UTILITAIRES ==

// Gestion cookies simple
function setCookie(name, value, days = 7) {
  const d = new Date();
  d.setTime(d.getTime() + days*24*60*60*1000);
  document.cookie = name + "=" + encodeURIComponent(value) + ";path=/;expires=" + d.toUTCString();
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )'+name+'=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// Valide nom d'affichage selon ta règle (14 max, latin + !?()[]:;,)
function isValidDisplayName(name) {
  return /^[A-Za-z0-9 !?\(\)\[\]:;,]{1,14}$/.test(name);
}

// Valide username (unique) - 18 max, latin lowercase, chiffres, no symboles
function isValidUsername(username) {
  return /^[a-z0-9]{1,18}$/.test(username);
}

// Valide password (8 à 64 caractères)
function isValidPassword(pw) {
  return pw.length >=8 && pw.length <=64;
}

// Affiche un message d'alerte simple
function alertMsg(msg) {
  alert(msg);
}

// Format heure hh:mm
function formatTime(date) {
  return date.toTimeString().slice(0,5);
}

// Ajoute message dans la zone chat public
function addPublicMessage({displayName, username, content, timestamp}) {
  const li = document.createElement('li');
  li.classList.add('message');
  li.innerHTML = `
    <span class="displayName">${displayName}</span>
    <span class="username">@${username}</span> :
    <span class="content">${escapeHtml(content)}</span>
    <span class="timestamp">${formatTime(new Date(timestamp))}</span>
  `;
  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Échappe HTML pour éviter injection
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Affiche liste utilisateurs connectés
function updateUsersList(users) {
  usersList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u.displayName;
    li.title = u.username;
    li.dataset.username = u.username;
    usersList.appendChild(li);

    // Click droit / gauche sur user
    li.addEventListener('contextmenu', e => {
      e.preventDefault();
      showUserContextMenu(u.username, u.displayName, e.pageX, e.pageY);
    });
    li.addEventListener('click', e => {
      // Left click = ouvrir menu simple pour MP ou ajouter contact
      showUserContextMenu(u.username, u.displayName, e.pageX, e.pageY);
    });
  });
}

// Context menu simple pour utilisateur (MP, ajouter contact)
function showUserContextMenu(username, displayName, x, y) {
  // Remove any existing menu
  let oldMenu = document.getElementById('userContextMenu');
  if(oldMenu) oldMenu.remove();

  // Create menu div
  const menu = document.createElement('div');
  menu.id = 'userContextMenu';
  menu.style.position = 'absolute';
  menu.style.top = y + 'px';
  menu.style.left = x + 'px';
  menu.style.background = '#36393f';
  menu.style.color = 'white';
  menu.style.border = '1px solid #5865f2';
  menu.style.borderRadius = '6px';
  menu.style.zIndex = 10000;
  menu.style.boxShadow = '0 0 8px #5865f2';
  menu.style.userSelect = 'none';
  menu.style.width = '180px';

  // MP option
  const mpOption = document.createElement('div');
  mpOption.textContent = 'Envoyer un message privé';
  mpOption.style.padding = '10px';
  mpOption.style.cursor = 'pointer';
  mpOption.addEventListener('click', () => {
    menu.remove();
    openPrivateChat(username, displayName);
  });
  mpOption.addEventListener('mouseenter', () => mpOption.style.background = '#5865f2');
  mpOption.addEventListener('mouseleave', () => mpOption.style.background = 'transparent');

  // Ajouter contact option
  const contactOption = document.createElement('div');
  contactOption.textContent = 'Enregistrer dans les contacts';
  contactOption.style.padding = '10px';
  contactOption.style.cursor = 'pointer';
  contactOption.addEventListener('click', () => {
    menu.remove();
    addContact(username, displayName);
  });
  contactOption.addEventListener('mouseenter', () => contactOption.style.background = '#5865f2');
  contactOption.addEventListener('mouseleave', () => contactOption.style.background = 'transparent');

  menu.appendChild(mpOption);
  menu.appendChild(contactOption);

  document.body.appendChild(menu);

  // Remove menu if clicked elsewhere
  function removeMenu() {
    menu.remove();
    window.removeEventListener('click', removeMenu);
  }
  window.addEventListener('click', removeMenu);
}

// Ouvre chat privé avec un user (prompt input)
function openPrivateChat(username, displayName) {
  // Prompt pour écrire message
  const message = prompt(`Envoyer un message privé à ${displayName} (@${username}):`);
  if(message && message.trim() !== '') {
    socket.emit('privateMessage', {to: username, content: message.trim()});
    // Stocke localement le message dans chat privé
    if(!activePrivateChats[username]) activePrivateChats[username] = [];
    activePrivateChats[username].push({from: currentUser.username, content: message.trim(), timestamp: new Date()});
  }
}

// Ajoute un contact dans dropdown
function addContact(username, displayName) {
  if(contacts.find(c => c.username === username)) {
    alertMsg(`${displayName} est déjà dans vos contacts.`);
    return;
  }
  contacts.push({username, displayName});
  updateContactsDropdown();
  alertMsg(`${displayName} ajouté aux contacts.`);
}

// Met à jour la liste déroulante contacts
function updateContactsDropdown() {
  contactsDropdown.innerHTML = '<option value="">-- Pas de contact --</option>';
  contacts.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.username;
    opt.textContent = `${c.displayName} (@${c.username})`;
    contactsDropdown.appendChild(opt);
  });
}

// Affiche notification privée popup
function showPrivateNotification(fromUsername, fromDisplayName) {
  notifSender.textContent = `${fromDisplayName} (@${fromUsername})`;
  privateNotif.classList.remove('hidden');

  // Après 5s disparition auto + pastille notif ratée
  setTimeout(() => {
    if (!privateNotif.classList.contains('hidden')) {
      privateNotif.classList.add('hidden');
      missedNotifications++;
      missedNotif.classList.remove('hidden');
      missedNotif.textContent = missedNotifications;
    }
  }, 5000);
}

// Gère bouton ignorer notification privée
ignoreBtn.addEventListener('click', () => {
  privateNotif.classList.add('hidden');
});

// Gère bouton lire notification privée
readBtn.addEventListener('click', () => {
  privateNotif.classList.add('hidden');
  openPrivateChat(lastPrivateSenderUsername, lastPrivateSenderDisplayName);
});

// Gère clic pastille notif ratée
missedNotif.addEventListener('click', () => {
  alertMsg('Vous avez des notifications privées non lues. Ouvre la liste des contacts pour voir.');
  missedNotif.classList.add('hidden');
  missedNotifications = 0;
});

// SESSION (cookie) : tentative auto-login
window.addEventListener('load', () => {
  const savedToken = getCookie('chatToken');
  if(savedToken) {
    // Essaie login auto avec token
    fetch('/api/auth/validate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: savedToken})
    }).then(res => res.json())
      .then(data => {
        if(data.success) {
          currentUser = data.user;
          startChat();
        } else {
          authPopup.classList.remove('hidden');
        }
      })
      .catch(() => authPopup.classList.remove('hidden'));
  } else {
    authPopup.classList.remove('hidden');
  }
});

// INSCRIPTION
registerForm.addEventListener('submit', e => {
  e.preventDefault();
  const displayName = registerForm.registerDisplayName.value.trim();
  const username = registerForm.registerUsername.value.trim();
  const password = registerForm.registerPassword.value;

  if(!isValidDisplayName(displayName)) {
    alertMsg('Nom d\'affichage invalide (max 14 caractères, latin, !?()[]:;,) autorisés)');
    return;
  }
  if(!isValidUsername(username)) {
    alertMsg('Nom d\'utilisateur invalide (1-18 caractères, minuscules et chiffres uniquement)');
    return;
  }
  if(!isValidPassword(password)) {
    alertMsg('Mot de passe invalide (8 à 64 caractères)');
    return;
  }

  // Envoi inscription au backend
  fetch('/api/auth/register', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({displayName, username, password})
  })
  .then(res => res.json())
  .then(data => {
    if(data.success) {
      alertMsg('Inscription réussie, connectez-vous maintenant !');
      registerForm.reset();
    } else {
      alertMsg('Erreur inscription : ' + data.message);
    }
  });
});

// CONNEXION
loginForm.addEventListener('submit', e => {
  e.preventDefault();
  const username = loginForm.loginUsername.value.trim();
  const password = loginForm.loginPassword.value;

  if(!isValidUsername(username)) {
    alertMsg('Nom d\'utilisateur invalide');
    return;
  }

  fetch('/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({username, password})
  })
  .then(res => res.json())
  .then(data => {
    if(data.success) {
      currentUser = data.user;
      setCookie('chatToken', data.token, 7);
      authPopup.classList.add('hidden');
      startChat();
    } else {
      alertMsg('Erreur connexion : ' + data.message);
    }
  });
});

// DÉBUT DU CHAT APRÈS AUTH
function startChat() {
  chatApp.classList.remove('hidden');
  updateContactsDropdown();

  // Envoie info user au serveur socket
  socket.emit('userConnected', currentUser);

  // Réception messages publics
  socket.on('publicMessage', data => {
    addPublicMessage(data);
  });

  // Mise à jour liste utilisateurs
  socket.on('usersUpdate', users => {
    updateUsersList(users.filter(u => u.username !== currentUser.username));
  });

  // Réception message privé
  socket.on('privateMessage', data => {
    const {from, displayName, content, timestamp} = data;
    // Stock message dans chat privé
    if(!activePrivateChats[from]) activePrivateChats[from] = [];
    activePrivateChats[from].push({from, content, timestamp});

    // Notif popup
    lastPrivateSenderUsername = from;
    lastPrivateSenderDisplayName = displayName;
    showPrivateNotification(from, displayName);
  });

  // Envoi message public
  messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if(msg === '') return;
    socket.emit('publicMessage', {content: msg});
    messageInput.value = '';
  });
}

// VARIABLES pour dernière notif privée
let lastPrivateSenderUsername = null;
let lastPrivateSenderDisplayName = null;


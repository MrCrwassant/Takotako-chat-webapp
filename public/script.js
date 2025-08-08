let socket = null;
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(res => res.json()).then(data => {
    if (data.message.includes('réussie')) startChat();
    else alert(data.message);
  });
}

function signup() {
  const displayName = document.getElementById('signup-displayname').value;
  const username = document.getElementById('signup-username').value;
  const password = document.getElementById('signup-password').value;
  fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, username, password })
  }).then(res => res.json()).then(data => {
    if (data.message.includes('réussie')) startChat();
    else alert(data.message);
  });
}

function startChat() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('chat').classList.remove('hidden');

  socket = io({
    auth: {
      token: getCookie('token')
    }
  });

  socket.on('chat history', (msgs) => {
    const messages = document.getElementById('messages');
    messages.innerHTML = '';
    msgs.forEach(msg => addMessage(msg));
  });

  socket.on('chat message', (msg) => {
    addMessage(msg);
  });
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const message = input.value.trim();
  if (message && socket) {
    socket.emit('chat message', message);
    input.value = '';
  }
}

function addMessage(msg) {
  const li = document.createElement('li');
  li.innerHTML = `<strong>${msg.displayName}</strong> <small style="color:gray">(${msg.username})</small> : ${msg.text} <small style="color:gray; float:right">${msg.timestamp}</small>`;
  document.getElementById('messages').appendChild(li);
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}
import express from 'express';

app.post('/api/signup', (req, res) => {
  const { displayName, username, password } = req.body;
  if (users[username]) return res.status(400).json({ message: 'Nom d\'utilisateur déjà pris' });

  const hash = bcrypt.hashSync(password, 10);
  users[username] = { displayName, password: hash };
  saveUsers();
  const token = jwt.sign({ username, displayName }, SECRET);
  res.cookie('token', token, { httpOnly: true }).json({ message: 'Inscription réussie' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Identifiants incorrects' });
  }
  const token = jwt.sign({ username, displayName: user.displayName }, SECRET);
  res.cookie('token', token, { httpOnly: true }).json({ message: 'Connexion réussie' });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Non autorisé'));
  try {
    const user = jwt.verify(token, SECRET);
    socket.user = user;
    next();
  } catch {
    next(new Error('Token invalide'));
  }
});

io.on('connection', (socket) => {
  console.log(`Connecté : ${socket.user.username}`);
  socket.emit('chat history', messages);

  socket.on('chat message', (msg) => {
    const message = {
      displayName: socket.user.displayName,
      username: socket.user.username,
      text: msg,
      timestamp: new Date().toLocaleTimeString()
    };
    messages.push(message);
    if (messages.length > 25) messages.shift();
    io.emit('chat message', message);
  });
});

server.listen(PORT, () => {
  console.log('Serveur lancé sur le port', PORT);

});

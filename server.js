// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const LOG_PATH = process.env.DANTED_LOG_PATH || 'syslog';

// Basic Auth Middleware
const USERNAME = process.env.ADMIN_USER || 'admin';
const PASSWORD = process.env.ADMIN_PASS || 'password';

function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).send('Authentication required.');
  }
  const [, encoded] = auth.split(' ');
  const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
  if (user === USERNAME && pass === PASSWORD) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
  return res.status(401).send('Invalid credentials.');
}

// Parse connections from log (simple heuristic)
function parseConnections(logContent) {
  // danted logs lines like:
  // connect from <client-ip> to <target-ip> port <port>
  // disconnect from <client-ip>
  // We’ll keep a simple map of active connections

  const lines = logContent.trim().split('\n');
  const activeConns = new Map();

  for (const line of lines) {
    // example: "connect from 192.168.1.10 to 8.8.8.8 port 80"
    let connectMatch = line.match(/connect from ([\d\.]+) to ([\d\.]+) port (\d+)/);
    if (connectMatch) {
      const [_, clientIp, targetIp, port] = connectMatch;
      activeConns.set(clientIp, {
        clientIp,
        targetIp,
        port: Number(port),
        startTime: null,
        bytesTransferred: 0,
      });
    }
    // example: "disconnect from 192.168.1.10"
    let disconnectMatch = line.match(/disconnect from ([\d\.]+)/);
    if (disconnectMatch) {
      const clientIp = disconnectMatch[1];
      activeConns.delete(clientIp);
    }
  }

  // We can’t get bytesTransferred or startTime from logs easily
  // so just show what we have

  return Array.from(activeConns.values());
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(basicAuth);

app.get('/api/connections', (req, res) => {
  fs.readFile(LOG_PATH, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Cannot read log file.' });
    }
    try {
      const conns = parseConnections(data);
      return res.json({ connections: conns });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse log file.' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Admin panel listening on port ${PORT}`);
  console.log(`Using danted log file at: ${LOG_PATH}`);
});

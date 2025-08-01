const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const MUSIC_DIR = path.join(__dirname, 'music');
if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR);

const USERNAME = process.env.ADMIN_USER || 'admin';
const PASSWORD = process.env.ADMIN_PASS || 'password';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'replace_with_a_secure_secret',
  resave: false,
  saveUninitialized: false,
}));

// Simple auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

app.get('/login', (req, res) => {
  res.send(`
    <h2>Login</h2>
    <form method="POST" action="/login">
      <input name="username" placeholder="Username" required /><br/>
      <input name="password" type="password" placeholder="Password" required /><br/>
      <button>Login</button>
    </form>
  `);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.send('Invalid credentials. <a href="/login">Try again</a>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.use(requireAuth);

app.get('/', (req, res) => {
  fs.readdir(MUSIC_DIR, (err, files) => {
    if (err) return res.status(500).send('Error reading music directory.');
    const mp3Files = files.filter(f => f.endsWith('.mp3'));

    const listItems = mp3Files.map(file => {
      return `
      <li>
        ${file} 
        <audio controls src="/music/${encodeURIComponent(file)}"></audio>
      </li>`;
    }).join('\n');

    res.send(`
      <h1>My Music Library</h1>
      <a href="/logout">Logout</a>
      <h3>Download from YouTube</h3>
      <form method="POST" action="/download">
        <input name="url" placeholder="YouTube URL" required style="width: 300px;" />
        <button>Download</button>
      </form>
      <h3>Music Files</h3>
      <ul>${listItems || '<li>No music files found.</li>'}</ul>
    `);
  });
});

app.post('/download', (req, res) => {
  const url = req.body.url;
  if (!url || !url.startsWith('http')) {
    return res.send('Invalid URL. <a href="/">Go back</a>');
  }

  // Generate output filename template
  // Save as mp3 in MUSIC_DIR, sanitize name to avoid weird chars
  const outputTemplate = path.join(MUSIC_DIR, '%(title)s.%(ext)s');

  // Run yt-dlp to extract audio only as mp3
  const cmd = `yt-dlp -x --audio-format mp3 --output "${outputTemplate}" "${url}"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('yt-dlp error:', error);
      return res.send(`Download failed: ${error.message} <br/><a href="/">Go back</a>`);
    }
    console.log('yt-dlp output:', stdout);
    res.redirect('/');
  });
});

// Serve music files statically
app.use('/music', express.static(MUSIC_DIR));

app.listen(PORT, () => {
  console.log(`Music server running at http://localhost:${PORT}`);
});

/*
 * Backend entry point for the Pool Service Platform.
 *
 * This file is a copy of the root‐level index.js, relocated into the
 * `backend` directory to clearly separate server code from the front‑end.
 * The primary change is that the root route now serves the HTML from
 * the adjacent `../frontend` directory rather than the legacy `public`
 * folder. Environment variables are still read from the project root via
 * `../.env`.
 */

const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');

const { getServices, saveServices } = require('./serviceStore');
const { getUsers, saveUsers } = require('./userStore');
const crypto = require('crypto');

// Load environment variables from the parent directory's .env file. This
// mirrors the behaviour of the original server but adjusts the path to
// reflect the new location of this file. If the file does not exist the
// attempt is silently ignored.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...vals] = trimmed.split('=');
      if (!key) return;
      const value = vals.join('=');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (err) {
    console.error('Failed to load .env file', err);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function base64urlEncode(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

function generateToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiry = payload.exp || issuedAt + 60 * 60;
  const tokenPayload = { ...payload, iat: issuedAt, exp: expiry };
  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(tokenPayload));
  const data = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64');
  const signatureEncoded = signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${signatureEncoded}`;
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerEncoded, payloadEncoded, signature] = parts;
  const data = `${headerEncoded}.${payloadEncoded}`;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64');
  const expectedEncoded = expectedSig.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (expectedEncoded !== signature) return null;
  try {
    const payloadJson = base64urlDecode(payloadEncoded);
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const port = process.env.PORT || 3000;
const logFile = path.join(__dirname, 'server.log');

function logRequest(req) {
  const now = new Date().toISOString();
  const line = `${now} ${req.method} ${req.url}\n`;
  fs.appendFile(logFile, line, err => {
    if (err) {
      console.error('Failed to write to log', err);
    }
  });
}

const server = http.createServer((req, res) => {
  logRequest(req);
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;
  let authPayload;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    authPayload = verifyToken(token);
    if (authPayload) {
      req.user = authPayload;
    }
  }
  // User registration
  if (req.method === 'POST' && pathname === '/register') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Username and password are required' }));
          return;
        }
        const users = getUsers();
        if (users.some(u => u.username === username)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User already exists' }));
          return;
        }
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        users.push({ username, passwordHash });
        saveUsers(users);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'User registered' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  // Login
  if (req.method === 'POST' && pathname === '/login') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Username and password are required' }));
          return;
        }
        const users = getUsers();
        const user = users.find(u => u.username === username);
        if (!user) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid credentials' }));
          return;
        }
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        if (user.passwordHash === passwordHash) {
          const token = generateToken({ username });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Login successful', token }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid credentials' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  // Root route serving the front‑end from ../frontend/index.html
  if (req.method === 'GET' && pathname === '/') {
    const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');
    fs.readFile(indexPath, (err, data) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Welcome to the Pool Service Platform!');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
    return;
  }
  if (req.method === 'GET' && pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (req.method === 'GET' && pathname.startsWith('/services/')) {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const idStr = pathname.split('/')[2];
    const id = Number(idStr);
    const services = getServices();
    const svc = services.find(s => s.id === id);
    if (svc) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(svc));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service not found' }));
    }
    return;
  }
  if (req.method === 'GET' && pathname === '/services') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const services = getServices();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(services));
    return;
  }
  if (req.method === 'POST' && pathname === '/services') {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newService = JSON.parse(body);
        newService.id = Date.now();
        const services = getServices();
        services.push(newService);
        saveServices(services);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newService));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  if (req.method === 'PUT' && pathname.startsWith('/services/')) {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const idStr = pathname.split('/')[2];
    const id = Number(idStr);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const updatedService = JSON.parse(body);
        const services = getServices();
        const index = services.findIndex(s => s.id === id);
        if (index === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service not found' }));
          return;
        }
        updatedService.id = id;
        services[index] = updatedService;
        saveServices(services);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updatedService));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  if (req.method === 'DELETE' && pathname.startsWith('/services/')) {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const idStr = pathname.split('/')[2];
    const id = Number(idStr);
    const services = getServices();
    const index = services.findIndex(s => s.id === id);
    if (index === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service not found' }));
      return;
    }
    services.splice(index, 1);
    saveServices(services);
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
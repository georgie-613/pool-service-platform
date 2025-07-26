/*
 * Simple HTTP server for the Pool Service Platform.
 *
 * This server uses Node.js' built‑in `http` module to respond to
 * incoming requests. When a request is made to the server, it
 * responds with a plain‑text message welcoming the user to the
 * platform. This serves as the starting point for Day 2 of our
 * beginner guide.
 */

const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');

// Import persistence helpers from the serviceStore module. This
// module encapsulates reading and writing the services JSON file.
const { getServices, saveServices } = require('./serviceStore');
const { getUsers, saveUsers } = require('./userStore');
const crypto = require('crypto');

// -----------------------------------------------------------------------------
// Environment variable loading (.env)
//
// To keep secret values such as JWT signing keys out of source control, this
// code reads a simple .env file located in the project root. Each line of
// the .env file should be of the form KEY=value. Variables defined in the
// environment at runtime override values in the file. The parsed key/values
// are assigned onto process.env so the rest of the application can access
// them normally (e.g. process.env.JWT_SECRET). If the file is missing it is
// silently ignored. See Day 9 of the beginner guide for more details on
// securing secrets.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...vals] = trimmed.split('=');
      if (!key) return;
      const value = vals.join('=');
      // Only set if not already defined in the environment
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (err) {
    console.error('Failed to load .env file', err);
  }
}

// Default secret used for signing JWTs if none provided. In production you
// should provide your own secret via an environment variable.
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// -----------------------------------------------------------------------------
// Simple JSON Web Token (JWT) helpers
//
// A JWT consists of a base64url encoded header and payload and a signature.
// These helper functions generate and verify tokens without any third‑party
// dependencies. The token payload can include arbitrary user data. Tokens
// generated here are signed using HMAC SHA‑256. See Day 9 for details.
function base64urlEncode(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad string to correct length for base64 decoding
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

/**
 * Generate a signed JWT with the given payload. The token will include the
 * standard fields `iat` (issued at) and `exp` (expiration). The default
 * expiration is 1 hour from the time of issuance. You can override by
 * specifying an `exp` property on the payload (seconds since epoch).
 *
 * @param {Object} payload The payload to include in the token
 * @returns {string} The signed JWT
 */
function generateToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiry = payload.exp || issuedAt + 60 * 60; // default 1 hour
  const tokenPayload = { ...payload, iat: issuedAt, exp: expiry };
  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(tokenPayload));
  const data = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64');
  const signatureEncoded = signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${signatureEncoded}`;
}

/**
 * Verify a JWT and return its decoded payload if valid. Returns null if the
 * signature does not match or if the token has expired. Tokens with
 * invalid structure also return null.
 *
 * @param {string} token The JWT to verify
 * @returns {Object|null} The decoded payload or null if invalid
 */
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

// -----------------------------------------------------------------------------
// CORS support
//
// To allow a browser‑based front‑end served from a different origin (such as
// your local development environment) to call this API, we set the necessary
// CORS headers on every response. We also handle pre‑flight OPTIONS requests
// by returning a 204 No Content response with the appropriate headers.
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Define the port on which the server will listen. Use the PORT
// environment variable if set, otherwise fall back to 3000. This
// allows the application to run on different ports without code
// changes.
const port = process.env.PORT || 3000;

// Path to a simple log file. Each incoming request will be
// appended to this file with a timestamp, method and URL. Logging
// requests helps with debugging and provides a minimal audit
// trail for the application.
const logFile = __dirname + '/server.log';

/**
 * Write a single line to the log file describing the incoming
 * request. The line includes an ISO formatted timestamp, the HTTP
 * method and the requested URL. Logging failures are silently
 * ignored to avoid crashing the server due to log errors.
 *
 * @param {http.IncomingMessage} req The request object
 */
function logRequest(req) {
  const now = new Date().toISOString();
  const line = `${now} ${req.method} ${req.url}\n`;
  fs.appendFile(logFile, line, err => {
    if (err) {
      // In a production system you'd handle this appropriately
      console.error('Failed to write to log', err);
    }
  });
}


// Create an HTTP server. The callback function will be invoked
// whenever a request is received. Here we branch based on the
// request method and pathname to build a tiny API. Unsupported
// paths return a 404 Not Found response.
const server = http.createServer((req, res) => {
  // Log the request at the very beginning of handling it.
  logRequest(req);

  // Always set CORS headers so the front‑end can communicate with the API
  setCorsHeaders(res);

  // Handle CORS pre‑flight requests. Browsers send an OPTIONS request
  // before certain cross‑origin requests. We respond immediately with
  // status 204 and return without further processing.
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse the request URL once for reuse. We also extract the
  // pathname outside of each conditional block for convenience.
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;

  // Extract a bearer token from the Authorization header if present. The
  // Authorization header should be of the form "Bearer <token>". If the
  // token verifies successfully, the decoded payload is attached to
  // req.user for use by downstream handlers. Invalid tokens result in
  // req.user remaining undefined.
  let authPayload;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    authPayload = verifyToken(token);
    if (authPayload) {
      req.user = authPayload;
    }
  }

  // -----------------------------------------------------------------
  // User registration and login endpoints
  // -----------------------------------------------------------------
  // Register a new user. Expects a JSON body with `username` and
  // `password`. Usernames must be unique. Passwords are hashed
  // using SHA‑256 before storage.
  if (req.method === 'POST' && pathname === '/register') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        // Basic validation
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
        const passwordHash = crypto
          .createHash('sha256')
          .update(password)
          .digest('hex');
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

  // Authenticate a user. Expects `username` and `password` in the
  // request body. Returns 200 if the credentials match, otherwise
  // 401 Unauthorized.
  if (req.method === 'POST' && pathname === '/login') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
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
        const passwordHash = crypto
          .createHash('sha256')
          .update(password)
          .digest('hex');
        if (user.passwordHash === passwordHash) {
          // Successful login: generate a JWT for the user. The payload
          // includes the username so it can be referenced later. A
          // front‑end client should store this token (for example in
          // sessionStorage) and include it in the Authorization header on
          // subsequent requests.
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

  if (req.method === 'GET' && pathname === '/') {
    // Root route: serve the HTML front‑end from the public directory.
    const indexPath = __dirname + '/public/index.html';
    fs.readFile(indexPath, (err, data) => {
      if (err) {
        // Fallback to plain text welcome message if the HTML is not found
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
    // Status route: return a simple JSON status message
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Retrieve a single service by ID: e.g. GET /services/123
  // The ID is extracted from the URL path after '/services/'.
  if (req.method === 'GET' && pathname.startsWith('/services/')) {
    // Require a valid auth token for all service operations
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
    // Return the list of services from the JSON file
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
    // Receive and parse the request body, then save a new service
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const newService = JSON.parse(body);
        // Assign a unique numeric ID based on the current timestamp. This makes it
        // easy to retrieve/update/delete individual services later on.
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

  // Update an existing service by ID: PUT /services/:id
  if (req.method === 'PUT' && pathname.startsWith('/services/')) {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const idStr = pathname.split('/')[2];
    const id = Number(idStr);
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
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
        // Preserve the original ID
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

  // Delete a service by ID: DELETE /services/:id
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
    // No content response for a successful deletion
    res.writeHead(204);
    res.end();
    return;
  }

  // All other routes: not found
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Start the server and have it listen on the specified port. When
// the server is ready, log a message to the console.
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
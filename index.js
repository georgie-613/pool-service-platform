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

// Import persistence helpers from the serviceStore module. This
// module encapsulates reading and writing the services JSON file.
const { getServices, saveServices } = require('./serviceStore');
const { getUsers, saveUsers } = require('./userStore');
const crypto = require('crypto');

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

  // Parse the request URL once for reuse. We also extract the
  // pathname outside of each conditional block for convenience.
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;

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
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Login successful' }));
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
    // Return the list of services from the JSON file
    const services = getServices();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(services));
    return;
  }

  if (req.method === 'POST' && pathname === '/services') {
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
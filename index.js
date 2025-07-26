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

// Define the port on which the server will listen. Using 3000 is a
// common convention for development servers.
const port = 3000;

// Path to the JSON file that stores service records. Each record
// represents a simple service appointment or note. If the file
// doesn't exist, it will be created when a new service is saved.
const servicesFile = __dirname + '/services.json';

/**
 * Read the services from the JSON file. If the file does not
 * exist or cannot be parsed, an empty array is returned instead of
 * throwing an error. This helper keeps the rest of the server
 * logic simple.
 *
 * @returns {Array} List of service objects
 */
function getServices() {
  try {
    const data = fs.readFileSync(servicesFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

/**
 * Persist the given services array to disk. The data is
 * stringified with indentation to make the file human readable.
 *
 * @param {Array} services Array of service objects
 */
function saveServices(services) {
  fs.writeFileSync(servicesFile, JSON.stringify(services, null, 2));
}

// Create an HTTP server. The callback function will be invoked
// whenever a request is received. Here we branch based on the
// request method and pathname to build a tiny API. Unsupported
// paths return a 404 Not Found response.
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;

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
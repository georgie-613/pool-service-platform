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

// Define the port on which the server will listen. Using 3000 is a
// common convention for development servers.
const port = 3000;

// Create an HTTP server. The callback function will be invoked
// whenever a request is received. Here we set the response
// status code, header, and body.
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content‑Type', 'text/plain');
  res.end('Welcome to the Pool Service Platform!');
});

// Start the server and have it listen on the specified port. When
// the server is ready, log a message to the console.
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
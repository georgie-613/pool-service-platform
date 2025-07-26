/*
 * Service persistence helpers for the backend.
 *
 * This module mirrors the functionality of the root‐level serviceStore.js
 * but resides under the `backend` directory. It reads and writes the
 * services.json file located in the same directory. By keeping
 * persistence logic in its own module we make the server code easier
 * to maintain.
 */

const fs = require('fs');
const path = require('path');

const servicesFile = path.join(__dirname, 'services.json');

function getServices() {
  try {
    const data = fs.readFileSync(servicesFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveServices(services) {
  fs.writeFileSync(servicesFile, JSON.stringify(services, null, 2));
}

module.exports = {
  getServices,
  saveServices,
};
/*
 * Module that encapsulates persistence logic for services.
 *
 * The functions in this file read and write a JSON file on disk
 * to persist service records. By moving these helpers into a
 * separate module we make the main server file easier to read
 * and maintain. Only built‑in Node.js modules are used; no
 * external dependencies are required.
 */

const fs = require('fs');
const path = require('path');

// Path to the JSON file that stores service records. The use of
// path.join ensures the correct path separator is used on any
// operating system. The file lives alongside this module.
const servicesFile = path.join(__dirname, 'services.json');

/**
 * Read all service records from the JSON file. If the file
 * doesn’t exist or cannot be parsed, an empty array is
 * returned. The synchronous API is used here for simplicity
 * since file sizes are small and calls are infrequent.
 *
 * @returns {Array} Array of service objects
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
 * Persist the given list of services to the JSON file. The
 * data is written with indentation to aid manual editing. This
 * function overwrites the existing file.
 *
 * @param {Array} services Array of service objects
 */
function saveServices(services) {
  fs.writeFileSync(servicesFile, JSON.stringify(services, null, 2));
}

module.exports = {
  getServices,
  saveServices,
};
/*
 * Module for managing user data on disk.
 *
 * This file exports simple synchronous helpers for reading and
 * writing an array of user objects from/to a JSON file. Each user
 * object has a `username` and a `passwordHash`. Storing hashed
 * passwords instead of plain text helps protect user credentials.
 */

const fs = require('fs');
const path = require('path');

// Define the path to the users JSON file. It sits alongside
// this module. If the file doesn’t exist, it will be created
// automatically when a new user is saved.
const usersFile = path.join(__dirname, 'users.json');

/**
 * Read the list of users from disk. If the file is missing or
 * corrupt, return an empty array.
 *
 * @returns {Array} array of user objects
 */
function getUsers() {
  try {
    const data = fs.readFileSync(usersFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

/**
 * Persist the provided array of users to disk. Data is written
 * with two-space indentation for readability.
 *
 * @param {Array} users array of user objects
 */
function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

module.exports = {
  getUsers,
  saveUsers,
};
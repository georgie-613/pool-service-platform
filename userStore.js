/*
 * User persistence helpers for the backend.
 *
 * This module duplicates the logic from the root‐level userStore.js
 * and stores users.json alongside it. Users are stored as objects
 * containing a username and a hashed password. Only synchronous
 * filesystem APIs are used to keep the code simple.
 */

const fs = require('fs');
const path = require('path');

const usersFile = path.join(__dirname, 'users.json');

function getUsers() {
  try {
    const data = fs.readFileSync(usersFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

module.exports = {
  getUsers,
  saveUsers,
};
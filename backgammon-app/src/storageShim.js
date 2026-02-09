// src/storageShim.js
// Minimal drop-in shim for the API used in backgammon.jsx
// Backed by localStorage so it persists across refreshes.

function listKeysWithPrefix(prefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  keys.sort();
  return keys;
}

window.storage = {
  async list(prefix /*, includeValues */) {
    const keys = listKeysWithPrefix(prefix);
    return { keys };
  },

  async get(key /*, raw */) {
    const value = localStorage.getItem(key);
    if (value == null) return null;
    return { value };
  },

  async set(key, value /*, raw */) {
    localStorage.setItem(key, value);
    return true;
  },

  async delete(key /*, raw */) {
    localStorage.removeItem(key);
    return true;
  },
};

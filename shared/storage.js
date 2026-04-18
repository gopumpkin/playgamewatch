export function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

export function createStorageNamespace(namespace, storage = globalThis.localStorage) {
  const prefix = `${namespace}:`;

  return {
    get(key, fallback = null) {
      const rawValue = storage.getItem(`${prefix}${key}`);
      if (rawValue === null) {
        return fallback;
      }
      return JSON.parse(rawValue);
    },
    set(key, value) {
      storage.setItem(`${prefix}${key}`, JSON.stringify(value));
      return value;
    },
    remove(key) {
      storage.removeItem(`${prefix}${key}`);
    },
  };
}

// __mocks__/react-native-mmkv.js
// Jest auto-mock for react-native-mmkv v4 (Nitro-based).
// Returns a no-op storage object so tests don't need the native binary.
// `createMMKV()` returns an object with the methods our app actually calls
// (set / getString / getNumber / contains / clearAll / delete / getAllKeys),
// all backed by an in-memory Map. This lets tests run without the new-
// architecture TurboModule `NitroModules` being registered.

const stores = new Map();

function getStore(id = 'mmkv.default') {
  if (!stores.has(id)) stores.set(id, new Map());
  return stores.get(id);
}

function makeInstance(id) {
  const store = getStore(id);
  return {
    id,
    set(key, value) {
      store.set(key, value);
    },
    getString(key) {
      const v = store.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber(key) {
      const v = store.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    getBoolean(key) {
      const v = store.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    contains(key) {
      return store.has(key);
    },
    delete(key) {
      store.delete(key);
    },
    clearAll() {
      store.clear();
    },
    getAllKeys() {
      return Array.from(store.keys());
    },
  };
}

module.exports = {
  createMMKV(config = {}) {
    return makeInstance(config.id);
  },
  useMMKV: () => makeInstance('mmkv.default'),
  useMMKVString: () => [undefined, () => {}],
  useMMKVNumber: () => [undefined, () => {}],
  useMMKVBoolean: () => [undefined, () => {}],
  useMMKVObject: () => [undefined, () => {}],
  useMMKVKeys: () => [[]],
  useMMKVListener: () => {},
};
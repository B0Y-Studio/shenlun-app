/**
 * @format
 */

// Mock mmkv v4 (Nitro Modules) — its TurboModule lookup fails in Jest
// because there is no native binary. We replace the storage API with
// an in-memory mock so src/storage/mmkv.ts can be imported by the App
// shell without crashing.
jest.mock('../src/storage/mmkv', () => {
  const mem = new Map();
  const instance = {
    id: 'shenlun-storage',
    set: (k, v) => mem.set(k, v),
    getString: (k) => (typeof mem.get(k) === 'string' ? mem.get(k) : undefined),
    getNumber: (k) => (typeof mem.get(k) === 'number' ? mem.get(k) : undefined),
    getBoolean: (k) => (typeof mem.get(k) === 'boolean' ? mem.get(k) : undefined),
    contains: (k) => mem.has(k),
    delete: (k) => mem.delete(k),
    clearAll: () => mem.clear(),
    getAllKeys: () => Array.from(mem.keys()),
  };
  return {
    getStorage: () => instance,
    getDeviceId: () => 'test-device-id',
    getCachedArticles: () => [],
    setCachedArticles: () => {},
    getReadIds: () => [],
    markRead: () => {},
    getReadHistory: () => [],
    countReadInList: () => 0,
    countReadsInWindow: () => 0,
    getLocalNotes: () => [],
    addLocalNote: () => {},
    deleteLocalNote: () => {},
  };
});

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});

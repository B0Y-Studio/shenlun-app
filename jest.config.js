module.exports = {
  preset: 'react-native',
  // Allow Jest to transform @react-navigation/elements + native libs whose
  // ESM builds are required at runtime (PNG assets, ESM modules). Without
  // this, __tests__/App.test.tsx fails to load with "Invalid or unexpected
  // token" on back-icon.png.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation/.+|react-native-mmkv|react-native-screens|react-native-safe-area-context)/)',
  ],
};

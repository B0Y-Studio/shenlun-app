// src/config/api.ts
// Single source of truth for API base URL.
// Plan D will flip production to HTTPS once server cert is provisioned.

export const API_BASE: string = __DEV__
  ? 'http://10.0.2.2:3000'    // Android emulator host loopback
  : 'http://124.223.5.144';   // production (HTTPS switch in Plan D)

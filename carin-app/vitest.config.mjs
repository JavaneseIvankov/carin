import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      'react-native': 'react-native-web',
      'expo-crypto': fileURLToPath(new URL('./test/mocks/expo-crypto.ts', import.meta.url)),
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Web nasazení pod cestou (např. /questor/): VITE_ZAKLAD=/questor/ npm run build
  base: process.env.VITE_ZAKLAD ?? '/',
  plugins: [react()],
  server: {
    fs: {
      // dovol import sdíleného balíčku a demo dat z kořene monorepa
      allow: ['..'],
    },
  },
});

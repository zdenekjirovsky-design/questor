import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // dovol import sdíleného balíčku a demo dat z kořene monorepa
      allow: ['..'],
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// O cliente fica em /client e o build vai para /dist, que o servidor entrega.
export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Em desenvolvimento, repassa o Socket.IO para o servidor Node.
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});

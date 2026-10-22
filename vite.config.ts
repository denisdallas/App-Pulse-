import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // The app runs Vite in Express middleware mode without passing the
      // underlying HTTP server to Vite. Enabling HMR in that configuration
      // makes the injected client repeatedly attempt an unavailable socket.
      // Keep file watching for server-side rebuilds, but disable the socket.
      hmr: false,
      watch: {},
    },
  };
});

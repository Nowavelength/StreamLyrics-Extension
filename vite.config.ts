import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
    build: {
        // Keep the locally bundled Gotham font inside the generated JS so
        // Shadow DOM and Document PiP never need a web-accessible font URL.
        assetsInlineLimit: 100_000,
    },
    plugins: [
        react(),
        crx({ manifest }),
    ],
});

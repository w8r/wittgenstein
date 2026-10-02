import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [],
  // Relative asset paths: the site is served from /wittgenstein/
  base: './',
  build: {
    target: 'esnext'
  }
});

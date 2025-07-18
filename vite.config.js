// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Эта строка говорит сборщику, что готовый сайт
  // нужно складывать в папку под названием 'dist'
  build: {
    outDir: 'dist'
  }
});
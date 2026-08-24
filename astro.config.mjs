import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://Baizhi-Angelica.github.io',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory'
  }
});

import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://pz0826.github.io',
  output: 'static',
  integrations: [react()],
  devToolbar: { enabled: false },
  redirects: { '/about': '/', '/about.html': '/' },
  vite: { server: { strictPort: true } },
});

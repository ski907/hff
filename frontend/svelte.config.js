import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // index.html is served for any route the server doesn't know about (SPA mode)
      fallback: 'index.html'
    })
  }
};

export default config;

import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    web_accessible_resources: [
      {
        resources: ['assets/fonts/*.woff2'],
        matches: ['<all_urls>'],
      },
    ],
  },
});

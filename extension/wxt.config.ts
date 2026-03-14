import { defineConfig } from 'wxt';

export default defineConfig({
  runner: {
    // Tell WXT's browser to open the debugging port
    chromiumArgs: ['--remote-debugging-port=9222'],
  },
  modules: ['@wxt-dev/module-react'],
  manifest: {
    action: {},
    permissions: ['storage', 'tabs'],
    web_accessible_resources: [
      {
        resources: ['assets/fonts/*.woff2'],
        matches: ['<all_urls>'],
      },
    ],
  },
});

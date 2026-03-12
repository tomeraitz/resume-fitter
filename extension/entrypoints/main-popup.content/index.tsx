import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import './main-popup.css';

export default defineContentScript({
  matches: ['*://*/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    if (!browser.runtime?.id) return;

    let mounted = false;

    const ui = await createShadowRootUi(ctx, {
      name: 'resume-fitter-popup',
      position: 'overlay',
      zIndex: 2147483640,
      onMount(container) {
        injectFontFaces(container.getRootNode() as ShadowRoot);
        const root = ReactDOM.createRoot(container);
        root.render(
          <ErrorBoundary>
            <App />
          </ErrorBoundary>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    function toggle() {
      if (!browser.runtime?.id) return;
      if (mounted) {
        ui.remove();
        mounted = false;
      } else {
        ui.mount();
        mounted = true;
      }
    }

    function close() {
      if (!browser.runtime?.id) return;
      if (mounted) {
        ui.remove();
        mounted = false;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) close();
    });

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (typeof message !== 'object' || message === null) return;
      const type = (message as Record<string, unknown>).type;

      if (type === 'toggle-popup') {
        toggle();
      } else if (type === 'close-popup') {
        close();
      }
    });
  },
});

function injectFontFaces(shadowRoot: ShadowRoot) {
  if (!browser.runtime?.id) return;

  const dmSansLatin = browser.runtime.getURL('/assets/fonts/dm-sans-latin.woff2');
  const dmSansLatinExt = browser.runtime.getURL('/assets/fonts/dm-sans-latin-ext.woff2');
  const instrumentSerifLatin = browser.runtime.getURL('/assets/fonts/instrument-serif-latin.woff2');
  const instrumentSerifLatinExt = browser.runtime.getURL('/assets/fonts/instrument-serif-latin-ext.woff2');

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'DM Sans';
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
      src: url('${dmSansLatin}') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'DM Sans';
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
      src: url('${dmSansLatinExt}') format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    @font-face {
      font-family: 'Instrument Serif';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url('${instrumentSerifLatin}') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Instrument Serif';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url('${instrumentSerifLatinExt}') format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
  `;

  shadowRoot.appendChild(style);
}

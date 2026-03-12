import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import './main-popup.css';

export default defineContentScript({
  matches: ['*://*/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    injectFontFaces();
    ctx.onInvalidated(() => removeFontFaces());

    let mounted = false;

    const ui = await createShadowRootUi(ctx, {
      name: 'resume-fitter-popup',
      position: 'overlay',
      onMount(container) {
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
      if (mounted) {
        ui.remove();
        mounted = false;
      } else {
        ui.mount();
        mounted = true;
      }
    }

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as Record<string, unknown>).type === 'toggle-popup'
      ) {
        toggle();
      }
    });
  },
});

const FONT_STYLE_ID = 'resume-fitter-fonts';

function injectFontFaces() {
  if (document.getElementById(FONT_STYLE_ID)) return;

  const dmSansLatin = browser.runtime.getURL('/assets/fonts/dm-sans-latin.woff2');
  const dmSansLatinExt = browser.runtime.getURL('/assets/fonts/dm-sans-latin-ext.woff2');
  const instrumentSerifLatin = browser.runtime.getURL('/assets/fonts/instrument-serif-latin.woff2');
  const instrumentSerifLatinExt = browser.runtime.getURL('/assets/fonts/instrument-serif-latin-ext.woff2');

  const style = document.createElement('style');
  style.id = FONT_STYLE_ID;
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

  document.head.appendChild(style);
}

function removeFontFaces() {
  document.getElementById(FONT_STYLE_ID)?.remove();
}

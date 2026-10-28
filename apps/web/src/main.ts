import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/500.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-bengali/700.css';
import '../../../packages/ui/src/styles.css';
import { Coordinator } from './game/coordinator';
import { WebPlatform } from './platform/web';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const app = new Coordinator(canvas, uiRoot, new WebPlatform());

// automation hooks for e2e tests and QA (dev builds or ?debug)
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __aleya: unknown }).__aleya = app.debugApi();
}

window.addEventListener('error', (e) => console.error('[aleya] uncaught', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[aleya] unhandled', e.reason));

void app.boot();

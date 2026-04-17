// Safety shim for libraries trying to polyfill fetch or global objects
if (typeof (window as any).global === 'undefined') {
  (window as any).global = window;
}

// Prevent polyfills from crashing when trying to overwrite read-only fetch
const originalFetch = window.fetch;
try {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => originalFetch,
    set: () => {
      console.warn('Attempted to overwrite window.fetch. Request ignored to prevent TypeError.');
    }
  });
} catch (e) {
  // Silent fail if defineProperty is not allowed
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

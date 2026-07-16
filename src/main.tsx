// Polyfill CustomEvent for older browsers / webviews (e.g. WeChat, WebView, old Safari) where new CustomEvent() throws "Illegal constructor"
try {
  if (typeof window !== 'undefined') {
    new window.CustomEvent('test-custom-event');
  }
} catch (e) {
  const CustomEventPolyfill = function (event: string, params?: any) {
    params = params || { bubbles: false, cancelable: false, detail: null };
    const evt = document.createEvent('CustomEvent');
    evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
    return evt;
  };
  CustomEventPolyfill.prototype = window.Event.prototype;
  (window as any).CustomEvent = CustomEventPolyfill;
}

// Force Bolivia Time (America/La_Paz, UTC-4) and es-BO locale globally on Date prototype methods
const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (
  this: Date,
  locales?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions
): string {
  return originalToLocaleString.call(this, locales || 'es-BO', {
    timeZone: 'America/La_Paz',
    ...options
  });
};

const originalToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (
  this: Date,
  locales?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions
): string {
  return originalToLocaleDateString.call(this, locales || 'es-BO', {
    timeZone: 'America/La_Paz',
    ...options
  });
};

const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function (
  this: Date,
  locales?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions
): string {
  return originalToLocaleTimeString.call(this, locales || 'es-BO', {
    timeZone: 'America/La_Paz',
    ...options
  });
};

const originalToISOString = Date.prototype.toISOString;
Date.prototype.toISOString = function () {
  const time = this.getTime();
  if (isNaN(time)) {
    return originalToISOString.call(this);
  }
  // Subtract 4 hours to get Bolivia time (UTC-4) and format as UTC ISO string
  const boliviaTime = new Date(time - (4 * 60 * 60 * 1000));
  return originalToISOString.call(boliviaTime);
};

const originalFetch = window.fetch;
try {
  Object.defineProperty(window, 'fetch', {
    value: async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      let url = '';
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input && typeof input === 'object' && 'url' in input) {
        url = (input as any).url;
      }

      if (!url.startsWith('http') || url.startsWith(window.location.origin)) {
        const userJson = localStorage.getItem('user');
        if (userJson) {
          try {
            const user = JSON.parse(userJson);
            if (user) {
              init = init || {};
              const headers = new Headers(init.headers || {});
              if (!headers.has('x-user-id') && user.id) {
                headers.set('x-user-id', String(user.id));
              }
              if (!headers.has('x-user-role') && user.role) {
                headers.set('x-user-role', String(user.role));
              }
              if (!headers.has('x-user-username') && user.username) {
                headers.set('x-user-username', String(user.username));
              }
              if (!headers.has('x-user-permissions') && user.permissions) {
                headers.set('x-user-permissions', JSON.stringify(user.permissions));
              }
              const token = localStorage.getItem('auth_token');
              if (token && !headers.has('Authorization')) {
                headers.set('Authorization', `Bearer ${token}`);
              }
              init.headers = headers;
            }
          } catch (err) {
            console.error("Error parsing user in fetch patch", err);
          }
        }
      }
      return originalFetch(input, init);
    },
    writable: true,
    configurable: true,
    enumerable: true
  });
} catch (e) {
  console.warn("Could not patch window.fetch via Object.defineProperty:", e);
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

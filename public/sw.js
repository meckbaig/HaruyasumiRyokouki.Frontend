/*
  Service worker — deliberately the smallest one that works.

  A browser will only offer to install a site that has one with a fetch handler,
  and that is the whole reason this file exists. It caches nothing: every request
  goes to the network exactly as it would without a worker.

  That restraint is on purpose. A caching worker decides for itself when a
  visitor sees a new deployment, and getting that wrong means serving a stale
  site to someone who cannot tell why — a worse problem than the one offline
  support would solve for a site whose content is photographs it has to fetch
  anyway. Add caching deliberately, if ever, not as a side effect of wanting an
  installable icon.

  `skipWaiting` and `clients.claim` keep an updated worker from waiting for
  every tab to close, so this file is never itself the stale part.
*/
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)))

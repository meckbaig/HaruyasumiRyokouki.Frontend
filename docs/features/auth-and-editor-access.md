# Editor access

There is no token endpoint - the API uses HTTP Basic - so "staying signed in" means keeping
the encoded credentials around.

## Files

| File | Role |
| --- | --- |
| `src/stores/auth.js` | The session. |
| `src/api/authState.js` | Holds the header outside Pinia; `encodeBasic`. |
| `src/api/auth.js` | `verifyCredentials`. |
| `src/views/LoginView.vue` | The form. |
| `src/router/index.js` | `requiresEditor` guard, `installAuthRedirect`. |

## The session

| | With "remember me" | Without |
| --- | --- | --- |
| Stored in | `localStorage` (`haruyasumi.auth`) | Memory only |
| Survives | A restart | Nothing; gone when the tab closes |

`auth.restore()` **must run before the first navigation** (it does, in `main.js`), because
the guard on `/admin/*` checks a session that would not otherwise exist yet.

`signIn` verifies against `GET /v1/admin/login` **before** storing anything. That endpoint
takes no parameters and answers 200 or 401/403; credentials travel in the `Authorization`
header, never the URL - a query string leaks the password into server logs, browser history
and `Referer`. Anything that is not an authentication verdict is rethrown.

`signOut` clears the header, the stored copy, **and the tag dictionary** - that is
editor-only data held in memory, and leaving it behind would show the next person a
vocabulary they are not signed in to see. Any future editor-only cache must be cleared here
too.

`encodeBasic` percent-encodes through `TextEncoder` before `btoa`, which only handles
latin1, so non-ASCII credentials survive.

## Why `authState.js` is not a store

`api/client.js` needs the header on every request. Reading it from the Pinia store would
make `client.js` import the store, which imports `api/auth.js`, which imports `client.js`.
`authState.js` is a plain module holding two values to break that cycle. It also holds the
`onUnauthorized` callback the router installs.

**Do not fold it into the store.**

## Two kinds of 401

| Call | `requiresAuth` | A 401 means |
| --- | --- | --- |
| Editor-only (`/tags`, `/media/edit`, `/admin/*`, every write) | `true` | The session expired → sign out and redirect to `/login?redirect=…` |
| Public (`/days`, `/search`, `/media/favorites`, `/tags/suggestion`) | `false` | Surface as an error state |

An anonymous visitor browsing public pages must **never** be yanked to the login screen.
Getting this wrong on one public call makes the whole site look like it requires an account.

`installAuthRedirect` wires the callback and skips the redirect when already on `/login`.

## Route guard

Routes carrying `meta: { requiresEditor: true }` - `/admin/pending`, `/admin/tags`,
`/admin/tags/collect` - redirect to `/login` with the intended path in `?redirect=`, which
`LoginView` replaces to on success.

This is **navigation-level only**. It is not a security boundary: the API enforces access,
and every editor-only call is marked `requiresAuth`. The guard exists so an editor is not
shown an empty admin screen.

## What being an editor changes

`auth.isEditor` gates, across the app:

- The pencil, the star and the hide control on a tile.
- Selection mode and the floating toolbar.
- The day-note editor.
- The `favorite` / `private` fields being non-null at all - the server omits them for
  anonymous readers, which is why `isPrivate` tests `=== true`.

## Invariants

1. `auth.restore()` before the first navigation.
2. `requiresAuth: false` on every public call.
3. Credentials in the header, never the URL.
4. `signOut` clears every editor-only cache, dictionary included.
5. `authState.js` stays outside Pinia.
6. The route guard is convenience, not enforcement.

## Related

- The request pipeline: [api-layer.md](api-layer.md).
- The dictionary cleared on sign-out: [tags.md](tags.md).

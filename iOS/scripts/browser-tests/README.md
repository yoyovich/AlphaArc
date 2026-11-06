# Website feature checks

Node.js 20+, Playwright 1.56.1, Chromium and WebKit are required.

```sh
npm ci --ignore-scripts
npx playwright install chromium webkit
npm test
SAIL_TEST_BROWSER=webkit npm test
```

Linux runner setup: `npx playwright install --with-deps chromium webkit`.
The full ten-configuration matrix runs from the repository root:

```sh
iOS/scripts/test-browser-matrix.sh
```

The suite runs the actual JavaScript resources, and decodes the existing scriptlet
and cosmetic JavaScript literals from Swift with a strict escape decoder. No copied
implementations or real CMP/website hosts are used. All requests are fulfilled by
local Playwright routes. Each test gets a fresh browser context and reports page exceptions.

It covers explicit necessary-only/refusal choices, ambiguous controls left manual,
visibility and disabled controls, dynamic/shadow/frame content, stopping observers,
restoring owned styles, native dark pages, editable areas, modern color spaces, CSP,
large-document responsiveness, eight blocker scriptlets, procedural selectors,
scroll unlocking and a cache-restore event bridge.

`SAIL_TEST_BROWSER` chooses `chromium` or `webkit`. `SAIL_TEST_MOBILE=1` enables a
390×844 touch viewport; `SAIL_TEST_LANDSCAPE=1` uses 844×390. The scheme and browser
locale are selected with `SAIL_TEST_COLOR_SCHEME` and `SAIL_TEST_LOCALE`.

These checks do not compile Swift or exercise WKWebView's native content-world,
cookie-store, signing, CloudKit or delegate integration. A mobile viewport is not
an iPhone device test. Run the Xcode suite and device checklist before distributing
an iOS build. `preview.mjs` generates website fixture screenshots, not app screenshots.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

const resources = new URL('../../SailBrowser/Resources/WebsiteFeatures/', import.meta.url);
const consent = readFileSync(new URL('necessary-cookies.js', resources), 'utf8');
const dark = readFileSync(new URL('force-dark.js', resources), 'utf8');
const engine = process.env.SAIL_TEST_BROWSER || 'chromium';
let browser;
before(async () => {
  assert.ok(['chromium', 'webkit'].includes(engine));
  const executablePath = engine === 'chromium' && (process.env.CHROMIUM_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined));
  browser = await (engine === 'webkit' ? webkit : chromium).launch({
    headless: true, ...(executablePath ? { executablePath } : {}),
    ...(engine === 'chromium' ? { args: ['--no-sandbox'] } : {}),
  });
});
after(async () => { await browser?.close(); });

const instrument = `
  window.__sailTest = { clicks: [], flushes: 0, pendingFlushes: new Set() };
  document.addEventListener('click', event => window.__sailTest.clicks.push(event.target.id), true);
  const originalTimer = window.setTimeout;
  const originalClear = window.clearTimeout;
  window.setTimeout = (callback, delay, ...args) => {
    const id = originalTimer(() => {
      try { callback(...args); } finally {
        if (callback.name === 'flush') { window.__sailTest.flushes++; window.__sailTest.pendingFlushes.delete(id); }
      }
    }, delay);
    if (callback.name === 'flush') window.__sailTest.pendingFlushes.add(id);
    return id;
  };
  window.clearTimeout = id => { window.__sailTest.pendingFlushes.delete(id); return originalClear(id); };
`;
async function mount(t, html, source = consent, options = {}) {
  const context = await browser.newContext({
    colorScheme: process.env.SAIL_TEST_COLOR_SCHEME || 'light',
    locale: process.env.SAIL_TEST_LOCALE || 'en-US',
    ...(process.env.SAIL_TEST_MOBILE === '1' ? { viewport: process.env.SAIL_TEST_LANDSCAPE === '1' ? { width: 844, height: 390 } : { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
    ...options.context,
  });
  t.after(() => context.close());
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  t.after(() => assert.deepEqual(errors, [], 'No JavaScript exceptions'));
  // All network traffic is intercepted. No CMP host or external website is contacted.
  await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html',
    headers: options.headers || {}, body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + (options.pages?.[new URL(route.request().url()).pathname] || html) }));
  await page.addInitScript({ content: instrument + '\n' + source });
  await page.goto('https://fixture.test/');
  return page;
}
const clicks = page => page.evaluate(() => window.__sailTest.clicks);
const flushed = page => page.waitForFunction(() => window.__sailTest.flushes > 0);
const chose = (page, id) => page.waitForFunction(id => window.__sailTest.clicks.includes(id), id);
const banner = (buttons, text = 'We use cookies') => `<div role="dialog">${text}${buttons}</div>`;

for (const [container, button] of [
  ['onetrust-banner-sdk', 'onetrust-reject-all-handler'],
  ['CybotCookiebotDialog', 'CybotCookiebotDialogBodyButtonDecline'],
  ['didomi-host', 'didomi-notice-disagree-button'],
]) {
  test(`necessary cookies: explicit CMP ${container}`, async t => {
    const page = await mount(t, `<div id="${container}">Cookies<button id="accept">Accept all</button>
      <button id="${button}">Reject all</button></div>`);
    await chose(page, button);
    assert.deepEqual(await clicks(page), [button]);
  });
}
for (const label of ['Reject all', 'Only necessary', 'Принять только необходимые', 'Только обязательные',
  'Отклонить все', 'Tout refuser', 'Alle ablehnen', 'Reject all!  ']) {
  test(`necessary cookies: exact label ${label}`, async t => {
    const page = await mount(t, banner(`<button id="accept">Accept all</button><button id="reject">${label}</button>`));
    await chose(page, 'reject');
    assert.deepEqual(await clicks(page), ['reject']);
  });
}
test('necessary cookies: ambiguous, accept-all and unrelated controls stay untouched', async t => {
  const page = await mount(t, banner(`
    <button id="accept">Accept all cookies</button><button id="agree">I agree</button>
    <button id="continue">Continue</button><button id="save">Save settings</button>
    <button id="ambiguous">Do not reject all</button><button id="reject">Only necessary</button>`));
  await chose(page, 'reject');
  assert.deepEqual(await clicks(page), ['reject']);
});
test('necessary cookies: a non-cookie dialog is never acted on', async t => {
  const page = await mount(t, '<div role="dialog">Delete messages?<button id="reject">Reject all</button></div>');
  await flushed(page);
  assert.deepEqual(await clicks(page), []);
  assert.equal(await page.getByRole('dialog').isVisible(), true);
});
test('necessary cookies: an unsupported cookie banner remains visible', async t => {
  const page = await mount(t, banner('<button id="accept">Agree and continue</button>'));
  await flushed(page);
  assert.deepEqual(await clicks(page), []);
  assert.equal(await page.getByRole('dialog').isVisible(), true);
});
test('necessary cookies: hidden, inert, disabled and misleading labels are skipped', async t => {
  const page = await mount(t, banner(`
    <button id="hidden" style="display:none">Reject all</button>
    <button id="transparent" style="opacity:0">Reject all</button>
    <button id="disabled" disabled>Reject all</button><div inert><button id="inert">Reject all</button></div>
    <button id="misleading" aria-label="Reject all">Accept all</button>
    <button id="reject">Only necessary</button>`));
  await chose(page, 'reject');
  assert.deepEqual(await clicks(page), ['reject']);
});
test('necessary cookies: recognized IDs do not override an accept-all label', async t => {
  const page = await mount(t, '<div id="onetrust-banner-sdk">Cookies<button id="onetrust-reject-all-handler">Accept all</button></div>');
  await flushed(page);
  assert.deepEqual(await clicks(page), []);
});
test('necessary cookies: dynamically inserted banner', async t => {
  const page = await mount(t, '<main>Article</main>');
  await flushed(page);
  await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html),
    banner('<button id="late">Reject all</button>'));
  await chose(page, 'late');
  assert.deepEqual(await clicks(page), ['late']);
});
test('necessary cookies: initially hidden banner opened later', async t => {
  const page = await mount(t, '<div id="cookie-panel" style="display:none">Cookies<button id="later">Reject all</button></div>');
  await flushed(page);
  assert.deepEqual(await clicks(page), []);
  await page.evaluate(() => document.getElementById('cookie-panel').style.display = 'block');
  await chose(page, 'later');
});
test('necessary cookies: open shadow DOM and delayed content', async t => {
  const page = await mount(t, '<main>Article</main>');
  await flushed(page);
  await page.evaluate(() => {
    const host = document.createElement('cookie-widget');
    host.attachShadow({ mode: 'open' }).innerHTML = '<div role="dialog">Cookies<button id="shadow">Reject all</button></div>';
    host.shadowRoot.addEventListener('click', event => window.__sailTest.clicks.push(event.target.id));
    document.body.append(host);
  });
  await chose(page, 'shadow');
  assert.ok(!(await clicks(page)).includes('accept'));
});
test('necessary cookies: repeat injection never clicks the same control twice', async t => {
  const page = await mount(t, banner('<button id="reject">Reject all</button>'), consent + '\n' + consent);
  await chose(page, 'reject');
  await page.evaluate(() => document.body.append(document.createElement('p')));
  assert.deepEqual(await clicks(page), ['reject']);
});
test('necessary cookies: no consent cookie, local storage or network is fabricated', async t => {
  const page = await mount(t, banner('<button id="reject">Only necessary</button>'));
  await chose(page, 'reject');
  assert.deepEqual(await page.context().cookies(), []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
});

test('dark mode: light surfaces and text become readable', async t => {
  const page = await mount(t, '<style>body{background:white;color:black}.card{background:#fafafa;color:#222}</style><main class="card" id="card">Readable content</main>', dark);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
  assert.equal(await page.locator('#card').evaluate(el => getComputedStyle(el).color), 'rgb(230, 230, 235)');
  assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).colorScheme), 'dark');
});
test('dark mode: inline !important light styles are adapted', async t => {
  const page = await mount(t, '<div id="card" style="background:white!important;color:black!important">Text</div>', dark);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
  assert.equal(await page.locator('#card').evaluate(el => getComputedStyle(el).color), 'rgb(230, 230, 235)');
});
test('dark mode: native dark surfaces retain their background', async t => {
  const page = await mount(t, '<style>body{background:#101018;color:#eee}#native{background:#17171f;color:#eee}</style><div id="native">Native dark</div>', dark);
  await flushed(page);
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(16, 16, 24)');
  assert.equal(await page.locator('#native').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(23, 23, 31)');
});
test('dark mode: media and SVG are never inverted or recolored', async t => {
  const page = await mount(t, '<img id="image"><video id="video"></video><canvas id="canvas"></canvas><svg id="svg"><path id="path" fill="red"></path></svg>', dark);
  await flushed(page);
  for (const id of ['image', 'video', 'canvas', 'svg', 'path']) {
    assert.equal(await page.locator('#' + id).evaluate(el => getComputedStyle(el).filter), 'none');
    assert.equal(await page.locator('#' + id).getAttribute('style'), null);
  }
  assert.equal(await page.locator('#path').getAttribute('fill'), 'red');
});
test('dark mode: dynamic SPA content is adapted', async t => {
  const page = await mount(t, '<main>App</main>', dark);
  await flushed(page);
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="dynamic" style="background:white;color:black">New content</div>'));
  await page.waitForFunction(() => getComputedStyle(document.getElementById('dynamic')).backgroundColor === 'rgb(28, 28, 32)');
});
test('dark mode: CSP that forbids injected styles still permits property-based recoloring', async t => {
  const page = await mount(t, '<main id="content">Article</main>', dark,
    { headers: { 'content-security-policy': "default-src 'none'; style-src 'none'; script-src 'none'" } });
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(18, 18, 20)');
  assert.ok(['rgb(230, 230, 235)', 'rgb(255, 255, 255)'].includes(
    await page.locator('#content').evaluate(el => getComputedStyle(el).color)));
});
test('dark mode: idempotent injection installs one stylesheet', async t => {
  const page = await mount(t, '<main>Article</main>', dark + '\n' + dark);
  await flushed(page);
  assert.equal(await page.locator('#sail-forced-dark-style').count(), 1);
});
test('features coexist: darkening does not hide the cookie choice before rejection', async t => {
  const page = await mount(t, banner('<button id="reject">Reject all</button>'), dark + '\n' + consent);
  await chose(page, 'reject');
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  assert.deepEqual(await clicks(page), ['reject']);
});

test('necessary cookies: translated accept-all on a familiar CMP ID is not clicked', async t => {
  const page = await mount(t, '<div id="onetrust-banner-sdk">Cookies<button id="onetrust-reject-all-handler">Tout accepter</button></div>');
  await flushed(page);
  assert.deepEqual(await clicks(page), []);
});
test('necessary cookies: script has a bounded action count across banner re-creations', async t => {
  const page = await mount(t, banner('<button id="reject-0">Reject all</button>'));
  await chose(page, 'reject-0');
  for (let i = 1; i < 8; i++) {
    await page.evaluate(i => {
      const button = document.querySelector('button');
      const next = button.cloneNode(true);
      next.id = 'reject-' + i;
      button.replaceWith(next);
    }, i);
    await chose(page, 'reject-' + i);
  }
  await page.evaluate(() => {
    const next = document.createElement('button');
    next.id = 'loop'; next.textContent = 'Reject all';
    document.querySelector('[role=dialog]').append(next);
  });
  assert.equal((await clicks(page)).length, 8);
});
test('features: non-web documents are left untouched', async t => {
  const page = await mount(t, '<main>placeholder</main>', consent + '\n' + dark);
  await page.goto('about:blank');
  assert.equal(await page.evaluate(() => globalThis.__sailNecessaryCookies), undefined);
  assert.equal(await page.evaluate(() => globalThis.__sailForceDark), undefined);
  assert.equal(await page.locator('#sail-forced-dark-style').count(), 0);
});
test('dark mode: a large document is processed in separate event-loop turns', async t => {
  const cards = Array.from({ length: 4000 }, (_, i) => `<div id="card-${i}" style="background:#fff;color:#111">Article ${i}</div>`).join('');
  const page = await mount(t, cards, dark + '\n' + consent);
  await page.evaluate(() => {
    window.__frames = 0;
    const count = () => { window.__frames++; if (window.__frames < 120) requestAnimationFrame(count); };
    requestAnimationFrame(count);
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card-3999')).backgroundColor === 'rgb(28, 28, 32)');
  assert.ok(await page.evaluate(() => window.__frames > 2), 'Rendering gets turns while recoloring a large page');
});

// Exercise the existing blocker's actual Swift-embedded JavaScript too.
const { scriptletSource, cosmeticSource } = await import('./shield-source.mjs');
test('blocker: set-constant intercepts later object assignments', async t => {
  const page = await mount(t, '<script>window.player = { ads: [1], title: "Article" };</script>',
    scriptletSource([['set-constant', 'player.ads', 'undefined']]));
  assert.equal(await page.evaluate(() => window.player.ads), undefined);
  await page.evaluate(() => { window.player.ads = ['new ad']; });
  assert.equal(await page.evaluate(() => window.player.ads), undefined);
  assert.equal(await page.evaluate(() => window.player.title), 'Article');
});
test('blocker: abort-on-property-read blocks only the named property', async t => {
  const page = await mount(t, '<main>Article</main>', scriptletSource([['abort-on-property-read', 'adProbe']]));
  assert.equal(await page.evaluate(() => { try { void window.adProbe; return false; } catch (error) { return error instanceof ReferenceError; } }), true);
  assert.equal(await page.evaluate(() => document.querySelector('main').textContent), 'Article');
});
test('blocker: abort-current-inline-script leaves nonmatching scripts alone', async t => {
  const page = await mount(t, `<script>
    try { window.badAdvertisement = true; void window.adProbe; window.unwantedRan = true; }
    catch { window.blockedInline = true; }
    </script><script>window.allowedInline = true;</script>`,
    scriptletSource([['abort-current-inline-script', 'adProbe', 'badAdvertisement']]));
  assert.equal(await page.evaluate(() => window.blockedInline), true);
  assert.equal(await page.evaluate(() => window.unwantedRan), undefined);
  assert.equal(await page.evaluate(() => window.allowedInline), true);
});
test('blocker: json-prune removes matching payloads, not ordinary JSON', async t => {
  const page = await mount(t, '<main>Article</main>', scriptletSource([['json-prune', 'ads entries.[].tracking', 'video']]));
  assert.deepEqual(await page.evaluate(() => JSON.parse('{"video":true,"ads":[1],"entries":[{"tracking":1,"title":"x"}]}')),
    { video: true, entries: [{ title: 'x' }] });
  assert.deepEqual(await page.evaluate(() => JSON.parse('{"ads":[1],"ordinary":true}')), { ads: [1], ordinary: true });
  assert.deepEqual(await page.evaluate(async () => new Response('{"video":true,"ads":[1]}').json()), { video: true });
});
test('blocker: remove-attr continues working after DOM insertion', async t => {
  const page = await mount(t, '<main><a id="link" data-track="x">Link</a></main>', scriptletSource([['remove-attr', 'data-track']]));
  assert.equal(await page.locator('#link').getAttribute('data-track'), null);
  await page.evaluate(() => document.querySelector('main').insertAdjacentHTML('beforeend', '<a id="later" data-track="y">Next</a>'));
  await page.waitForFunction(() => !document.getElementById('later').hasAttribute('data-track'));
});
test('blocker: remove-class unlocks only the specified classes', async t => {
  const page = await mount(t, '<div id="wall" class="adwall useful">Article</div>', scriptletSource([['remove-class', 'adwall']]));
  assert.equal(await page.locator('#wall').getAttribute('class'), 'useful');
});
test('blocker: prevent-addEventListener preserves unrelated listeners', async t => {
  const page = await mount(t, '<button id="button">Open</button>', scriptletSource([['prevent-addEventListener', 'click', 'adHandler']]));
  await page.evaluate(() => {
    const button = document.getElementById('button');
    button.addEventListener('click', function adHandler() { window.adHit = true; });
    button.addEventListener('click', function normalHandler() { window.normalHit = true; });
    button.click();
  });
  assert.equal(await page.evaluate(() => window.adHit), undefined);
  assert.equal(await page.evaluate(() => window.normalHit), true);
});
test('blocker: prevent-setTimeout preserves unrelated timers', async t => {
  const page = await mount(t, '<main>Article</main>', scriptletSource([['prevent-setTimeout', 'advert', '10']]));
  await page.evaluate(() => {
    setTimeout(function advert() { window.adTimer = true; }, 10);
    setTimeout(function normalTimer() { window.normalTimer = true; }, 20);
  });
  await page.waitForFunction(() => window.normalTimer === true);
  assert.equal(await page.evaluate(() => window.adTimer), undefined);
});
test('blocker: procedural has-text and upward hide the ad parent, not the article', async t => {
  const page = await mount(t, '<section id="ad"><span class="badge">Sponsored</span></section><article id="article">Story</article>',
    cosmeticSource({ procedural: ['.badge:has-text(Sponsored):upward(1)'] }));
  await page.waitForFunction(() => getComputedStyle(document.getElementById('ad')).display === 'none');
  assert.equal(await page.locator('#article').isVisible(), true);
});
test('blocker: nested procedural has follows dynamically added ads', async t => {
  const page = await mount(t, '<main id="main">Article</main>',
    cosmeticSource({ procedural: ['section:has(.badge:has-text(Sponsored))'] }));
  await page.evaluate(() => document.getElementById('main').insertAdjacentHTML('beforeend', '<section id="late-ad"><span class="badge">Sponsored</span></section>'));
  await page.waitForFunction(() => getComputedStyle(document.getElementById('late-ad')).display === 'none');
});
test('blocker: cosmetic rules are scoped to the requested host', async t => {
  const page = await mount(t, '<div id="ad">Article</div>', cosmeticSource({ host: 'other.test', css: '#ad { display: none; }' }));
  assert.equal(await page.locator('#ad').isVisible(), true);
});
test('blocker: hiding a cookie wall unlocks scrolling without submitting consent', async t => {
  const page = await mount(t, `<style>html,body{overflow:hidden}body{position:fixed}</style>
    <div id="CybotCookiebotDialog">Cookies<button id="CybotCookiebotDialogBodyButtonDecline">Reject all</button>
    <button id="accept">Accept all</button></div><main style="height:2000px">Article</main>`,
    cosmeticSource({ css: '#CybotCookiebotDialog { display: none !important; }', unlocksCookieWalls: true }));
  try {
    await page.waitForFunction(() => !['hidden', 'clip'].includes(getComputedStyle(document.body).overflowY)
      && getComputedStyle(document.body).position === 'static', null, { timeout: 5000 });
  } catch (error) {
    console.error(await page.evaluate(() => ({
      body: { overflow: getComputedStyle(document.body).overflowY, position: getComputedStyle(document.body).position, inline: document.body.getAttribute('style') },
      root: { overflow: getComputedStyle(document.documentElement).overflowY, inline: document.documentElement.getAttribute('style') },
      banner: { display: getComputedStyle(document.getElementById('CybotCookiebotDialog')).display, visible: document.getElementById('CybotCookiebotDialog').checkVisibility() },
      work: window.sailShieldWork, timings: window.sailShieldTimings, size: { height: innerHeight, scroll: document.documentElement.scrollHeight },
    })));
    throw error;
  }
  await page.evaluate(() => window.scrollTo(0, 250));
  await page.waitForFunction(() => window.scrollY > 0);
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).position), 'static');
  assert.deepEqual(await clicks(page), []);
});
test('features: a cookie CMP inside an embedded frame is handled in that frame', async t => {
  const page = await mount(t, '<iframe src="https://cmp.test/consent-frame"></iframe>', consent,
    { pages: { '/consent-frame': banner('<button id="framed-reject">Only necessary</button>') } });
  const frame = page.frames().find(frame => frame.url().includes('/consent-frame'));
  assert.ok(frame);
  await frame.waitForFunction(() => window.__sailTest.clicks.includes('framed-reject'));
  assert.deepEqual(await frame.evaluate(() => window.__sailTest.clicks), ['framed-reject']);
});

test('necessary cookies: disabling stops observation and cancels pending work', async t => {
  const page = await mount(t, '<main>Article</main>');
  await page.evaluate(() => window.__sailNecessaryCookies.stop());
  await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), banner('<button id="disabled-late">Reject all</button>'));
  assert.equal(await page.evaluate(() => window.__sailTest.pendingFlushes.size), 0);
  assert.equal(await page.evaluate(() => window.__sailNecessaryCookies), undefined);
  assert.deepEqual(await clicks(page), []);
});
test('dark mode: disabling restores original inline priorities and removes owned styles', async t => {
  const page = await mount(t, '<div id="card" style="background-color:white!important;color:black!important">Article</div>', dark);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
  await page.evaluate(() => window.__sailForceDark.stop());
  assert.equal(await page.locator('#card').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.locator('#card').evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)');
  assert.equal(await page.locator('#card').evaluate(el => el.style.getPropertyPriority('background-color')), 'important');
  assert.equal(await page.locator('#sail-forced-dark-style').count(), 0);
  assert.equal(await page.locator('.sail-dark-surface, .sail-dark-ink').count(), 0);
  assert.equal(await page.evaluate(() => window.__sailTest.pendingFlushes.size), 0);
});
test('dark mode: disabling preserves subsequent changes made by the website', async t => {
  const page = await mount(t, '<div id="card" style="background:white;color:black">Article</div>', dark);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
  await page.evaluate(() => {
    document.getElementById('card').style.color = 'red';
    window.__sailForceDark.stop();
  });
  assert.equal(await page.locator('#card').evaluate(el => getComputedStyle(el).color), 'rgb(255, 0, 0)');
});
test('dark mode: re-enabling on the same document starts cleanly', async t => {
  const page = await mount(t, '<main id="card" style="background:white;color:black">Article</main>', dark);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
  await page.evaluate(() => window.__sailForceDark.stop());
  await page.addScriptTag({ content: dark });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
  assert.equal(await page.locator('#sail-forced-dark-style').count(), 1);
});

test('dark mode: translucent light panels keep readable text', async t => {
  const page = await mount(t, '<div id="card" style="background:rgba(255,255,255,.5);color:black">Article</div>', dark);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
  assert.equal(await page.locator('#card').evaluate(el => getComputedStyle(el).color), 'rgb(230, 230, 235)');
});
test('dark mode: editable content is left under the site’s control', async t => {
  const page = await mount(t, '<div contenteditable id="editor" style="background:white;color:black">Draft</div>', dark);
  await flushed(page);
  assert.equal(await page.locator('#editor').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.locator('#editor').evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)');
});
test('cache restore bridge: only a persisted pageshow asks native policy again', async t => {
  const { restoreBridgeSource } = await import('./shield-source.mjs');
  const page = await mount(t, '<main>Article</main>', `
    window.__restores = [];
    window.webkit = { messageHandlers: { sailFeatureRestore: { postMessage: value => window.__restores.push(value) } } };
    ${restoreBridgeSource()}
  `);
  assert.deepEqual(await page.evaluate(() => window.__restores), []);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
  assert.deepEqual(await page.evaluate(() => window.__restores), []);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  assert.deepEqual(await page.evaluate(() => window.__restores), ['restore']);
});

test('necessary cookies: detached shadow roots can be observed again after reattachment', async t => {
  const page = await mount(t, '<main>Article</main>');
  await flushed(page);
  await page.evaluate(() => {
    const host = document.createElement('cookie-widget');
    host.attachShadow({ mode: 'open' }).innerHTML = '<div role="dialog">Cookies<button id="shadow-first">Reject all</button></div>';
    host.shadowRoot.addEventListener('click', event => window.__sailTest.clicks.push(event.target.id));
    document.body.append(host);
    window.__shadowHost = host;
  });
  await chose(page, 'shadow-first');
  const last = await page.evaluate(() => window.__sailTest.flushes);
  await page.evaluate(() => {
    window.__shadowHost.remove();
    const other = document.createElement('other-widget');
    other.attachShadow({ mode: 'open' }).innerHTML = '<p>Article</p>';
    document.body.append(other);
  });
  await page.waitForFunction(last => window.__sailTest.flushes > last, last);
  await page.evaluate(() => {
    window.__shadowHost.shadowRoot.innerHTML = '<div role="dialog">Cookies<button id="shadow-second">Reject all</button></div>';
    document.body.append(window.__shadowHost);
  });
  await chose(page, 'shadow-second');
});

for (const color of ['oklch(100% 0 0)', 'color(display-p3 1 1 1)', 'color(srgb 1 1 1)']) {
  test(`dark mode: modern CSS color ${color} is adapted`, async t => {
    const page = await mount(t, `<main id="card" style="background:${color};color:oklch(10% 0 0)">Article</main>`, dark);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).backgroundColor === 'rgb(28, 28, 32)');
    assert.equal(await page.locator('#card').evaluate(el => getComputedStyle(el).color), 'rgb(230, 230, 235)');
  });
}

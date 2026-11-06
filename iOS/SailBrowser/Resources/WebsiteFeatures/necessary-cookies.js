// Runs in SailWebsiteFeatures' isolated world. No consent strings are forged, no storage is written,
// and no "accept all" or ambiguous "continue/save" control is clicked. Unknown CMPs stay manual.
(() => {
  'use strict';
  if (!/^https?:$/.test(location.protocol) || globalThis.__sailNecessaryCookies) return;
  globalThis.__sailNecessaryCookies = { stop };
  let stopped = false;
  const observers = new Map();

  const knownReject = [
    '#onetrust-banner-sdk #onetrust-reject-all-handler',
    '#CybotCookiebotDialog #CybotCookiebotDialogBodyButtonDecline',
    '#didomi-host #didomi-notice-disagree-button',
    '#iubenda-cs-banner .iubenda-cs-reject-btn',
    '#cookie-notice #cn-refuse-cookie',
    '#cmplz-cookiebanner-container .cmplz-deny',
    '.osano-cm-dialog .osano-cm-denyAll',
  ].join(',');
  const containers = [
    '#onetrust-banner-sdk', '#CybotCookiebotDialog', '#didomi-host', '#iubenda-cs-banner',
    '#cookie-notice', '#cmplz-cookiebanner-container', '.osano-cm-dialog',
    '[id*="cookie" i]', '[id*="consent" i]', '[class*="cookie-banner" i]',
    '[class*="cookie-consent" i]', '[role="dialog"]', '[aria-modal="true"]',
  ].join(',');
  const labels = new Set([
    'reject', 'reject all', 'reject all cookies', 'decline', 'decline all', 'decline all cookies',
    'deny all', 'deny optional cookies', 'reject optional cookies', 'necessary only', 'essential only',
    'only necessary', 'only essential', 'only necessary cookies', 'only essential cookies',
    'accept necessary cookies', 'accept only necessary cookies', 'accept essential cookies',
    'accept only essential cookies', 'use necessary cookies only', 'continue without accepting',
    'отклонить', 'отклонить все', 'отклонить всё', 'отклонить все cookie', 'отклонить все cookies',
    'отклонить необязательные', 'отклонить необязательные файлы cookie', 'отказаться от всех',
    'только необходимые', 'только обязательные', 'только необходимые cookie', 'только необходимые cookies',
    'только необходимые файлы cookie', 'принять только необходимые', 'принять необходимые',
    'принять только обязательные', 'принять только необходимые файлы cookie', 'продолжить без согласия',
    'alle ablehnen', 'nur notwendige', 'nur notwendige cookies', 'tout refuser', 'refuser tout',
    'uniquement nécessaires', 'rechazar todo', 'rechazar todas', 'solo necesarias',
    'rifiuta tutti', 'solo necessari', 'rejeitar todos', 'apenas necessários',
  ]);
  const normalize = text => text.normalize('NFKC').toLowerCase().trim().replace(/[.!…]+$/u, '')
    .replace(/\s+/gu, ' ').trim();
  const unsafe = /accept all|allow all|agree to all|принять вс[её]|разрешить вс[её]|соглас[еи]тьс[яь] со вс[её]/iu;
  const clicked = new WeakSet();
  const observed = new WeakSet();
  const roots = new Set([document]);
  let timer = null;
  let actions = 0;
  const maxActions = 8;

  function visible(button) {
    const style = getComputedStyle(button);
    return button.isConnected && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
      && !button.closest('[inert]') && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) !== 0
      && button.getClientRects().length > 0;
  }
  function choose(button) {
    if (stopped || actions >= maxActions || clicked.has(button) || !visible(button)) return false;
    const text = normalize(button.innerText || button.textContent || button.value || '');
    const aria = normalize(button.getAttribute('aria-label') || '');
    if (unsafe.test(text) || unsafe.test(aria)) return false;
    // Even a familiar CMP ID needs an explicit refusal/necessary-only label: a renamed or spoofed
    // control must not silently opt the user in. Conflicting accessible labels are left manual.
    if (!labels.has(text || aria) || (text && aria && !labels.has(aria))) return false;
    clicked.add(button);
    actions += 1;
    button.click();
    return true;
  }
  function scan(root) {
    // Known CMP controls first, before generic banner text matching.
    for (const button of root.querySelectorAll(knownReject)) {
      if (choose(button)) return;
    }
    let inspected = 0;
    for (const banner of root.querySelectorAll(containers)) {
      if (++inspected > 80) break;
      const text = banner.textContent || '';
      if (!/cookies?|куки/iu.test(text)) continue;
      for (const button of banner.querySelectorAll('button, [role="button"], input[type="button"]')) {
        if (choose(button)) return;
      }
    }
  }
  function addShadows(node) {
    if (!(node instanceof Element) && !(node instanceof ShadowRoot) && node !== document) return;
    const elements = node instanceof Element ? [node, ...node.querySelectorAll('*')] : node.querySelectorAll('*');
    // Bound the initial search; later inserted components are examined individually by the observer.
    let count = 0;
    for (const element of elements) {
      if (++count > 2500 || roots.size >= 64) break;
      if (element.shadowRoot && !observed.has(element.shadowRoot)) {
        roots.add(element.shadowRoot);
        observe(element.shadowRoot);
        addShadows(element.shadowRoot);
      }
    }
  }
  function flush() {
    timer = null;
    if (stopped || document.hidden || actions >= maxActions) return;
    for (const root of roots) {
      if (root !== document && !root.host.isConnected) {
        roots.delete(root);
        observers.get(root)?.disconnect();
        observers.delete(root);
        observed.delete(root);
        continue;
      }
      scan(root);
    }
  }
  function schedule() {
    if (!stopped && timer === null && actions < maxActions && !document.hidden) timer = setTimeout(flush, 150);
  }
  function observe(root) {
    if (observed.has(root)) return;
    observed.add(root);
    const observer = new MutationObserver(records => {
      if (actions >= maxActions) return;
      let relevant = false;
      for (const record of records) {
        // Opening a hidden CMP via class/style is common. Attribute observations exclude our own writes
        // (the script writes none) and do not watch text fields or cookie values.
        if (record.type === 'attributes' && record.target.closest(containers)) relevant = true;
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          addShadows(node);
          if (node.matches(containers) || node.closest(containers) || node.querySelector(containers) || node.shadowRoot) {
            relevant = true;
          }
        }
      }
      if (relevant) schedule();
    });
    observers.set(root, observer);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  observe(document);
  const start = () => { addShadows(document); schedule(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  addEventListener('pageshow', start);
  const onVisibility = () => { if (!document.hidden) start(); };
  document.addEventListener('visibilitychange', onVisibility);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    observers.forEach(observer => observer.disconnect());
    observers.clear();
    roots.clear();
    document.removeEventListener('DOMContentLoaded', start);
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('pageshow', start);
    delete globalThis.__sailNecessaryCookies;
  }
})();

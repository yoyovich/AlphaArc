// Isolated-world, local-only recoloring. Images/video/canvas/SVG are never inverted or rewritten.
// Native dark backgrounds are preserved. Changes disappear on reload when the site exception is enabled.
(() => {
  'use strict';
  if (!/^https?:$/.test(location.protocol) || globalThis.__sailForceDark) return;
  globalThis.__sailForceDark = { stop };
  let stopped = false;
  let timer = null;
  let ownedStyle = null;
  const originals = new Map();
  const addedClasses = new Map();
  function write(element, name, value) {
    let properties = originals.get(element);
    if (!properties) { properties = new Map(); originals.set(element, properties); }
    if (!properties.has(name)) properties.set(name, {
      value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name), applied: null,
    });
    element.style.setProperty(name, value, 'important');
    properties.get(name).applied = element.style.getPropertyValue(name);
  }
  function mark(element, name) {
    if (element.classList.contains(name)) return;
    let classes = addedClasses.get(element);
    if (!classes) { classes = new Set(); addedClasses.set(element, classes); }
    classes.add(name);
    element.classList.add(name);
  }
  const styleID = 'sail-forced-dark-style';
  const surface = 'sail-dark-surface';
  const ink = 'sail-dark-ink';
  const excluded = 'script, style, link, meta, head, title, template, noscript, img, picture, video, canvas, svg, svg *, iframe, object, embed, math, [contenteditable="true"]';
  const pending = new Set();
  let scheduled = false;
  let styled = false;
  let scanned = 0;
  const maxElements = 30000;
  const css = `
    :root { color-scheme: dark !important; }
    .${surface} { background-color: #1c1c20 !important; }
    .${ink} { color: #e6e6eb !important; }
    a.${ink}, a:link { color: #93b8ff !important; }
    a:visited { color: #c5a5ed !important; }
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, select {
      color-scheme: dark !important;
    }
    ::selection { background: #345a92 !important; color: #fff !important; }
  `;
  const colorCache = new Map();
  let colorContext = null;
  function components(color) {
    if (colorCache.has(color)) return colorCache.get(color);
    const match = color.match(/^rgba?\(([^)]+)\)$/);
    let values = match?.[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (!values || values.length < 3 || values.some(value => !Number.isFinite(value))) {
      // Modern sites use oklch() and display-p3 as well as rgb(). Let the engine convert those
      // to sRGB in our own detached 1-pixel canvas; never read or modify the site's canvases/images.
      try {
        if (!colorContext) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          colorContext = canvas.getContext('2d', { willReadFrequently: true });
        }
        if (!colorContext) return null;
        colorContext.fillStyle = '#010203';
        colorContext.fillStyle = color;
        const accepted = colorContext.fillStyle;
        colorContext.fillStyle = '#040506';
        colorContext.fillStyle = color;
        if (colorContext.fillStyle !== accepted) return null;
        colorContext.clearRect(0, 0, 1, 1);
        colorContext.fillRect(0, 0, 1, 1);
        const pixel = colorContext.getImageData(0, 0, 1, 1).data;
        values = [pixel[0], pixel[1], pixel[2], pixel[3] / 255];
      } catch { return null; }
    }
    if (colorCache.size >= 512) colorCache.clear();
    colorCache.set(color, values);
    return values;
  }
  function luminance(color, includeTranslucent = false) {
    const values = components(color);
    if (!values) return null;
    if (values.length > 3 && (values[3] === 0 || (!includeTranslucent && values[3] < 0.8))) return null;
    const [r, g, b] = values.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  }
  function install() {
    if (!document.documentElement) return;
    if (!document.getElementById(styleID)) {
      const style = document.createElement('style');
      style.id = styleID;
      ownedStyle = style;
      style.textContent = css;
      (document.head || document.documentElement).append(style);
    }
    // Property writes also work on pages whose CSP disallows injected <style> elements.
    write(document.documentElement, 'color-scheme', 'dark');
    const rootBackground = luminance(getComputedStyle(document.documentElement).backgroundColor);
    if (rootBackground === null || rootBackground > 0.55) {
      write(document.documentElement, 'background-color', '#121214');
    }
    styled = true;
  }
  function adapt(element) {
    if (scanned++ >= maxElements || element.matches(excluded) || element.isContentEditable || element.closest('svg, math')) return;
    const style = getComputedStyle(element);
    const background = luminance(style.backgroundColor, true);
    const foreground = luminance(style.color);
    if (background !== null && background > 0.55 && style.backgroundImage === 'none') {
      mark(element, surface);
      write(element, 'background-color', '#1c1c20');
    }
    if (element === document.body && (background === null || background > 0.55) && style.backgroundImage === 'none') {
      write(element, 'background-color', '#121214');
    }
    if (foreground !== null && foreground < 0.38) {
      mark(element, ink);
      write(element, 'color', element.tagName === 'A' ? '#93b8ff' : '#e6e6eb');
    }
  }
  function flush() {
    scheduled = false;
    timer = null;
    if (stopped || document.hidden) return;
    if (scanned >= maxElements) { pending.clear(); observer.disconnect(); return; }
    if (!styled) install();
    // Process a bounded batch per turn; a large document cannot monopolise a frame.
    let budget = 120;
    for (const element of pending) {
      pending.delete(element);
      if (element.isConnected) adapt(element);
      if (--budget <= 0) break;
    }
    if (pending.size) schedule();
  }
  function schedule() {
    if (stopped || scheduled || document.hidden || scanned >= maxElements) return;
    scheduled = true;
    timer = setTimeout(flush, 16);
  }
  function enqueue(node) {
    if (!(node instanceof Element) || pending.has(node) || pending.size + scanned >= maxElements) return;
    pending.add(node);
    for (const element of node.querySelectorAll('*')) {
      if (pending.size + scanned >= maxElements) break;
      pending.add(element);
    }
    schedule();
  }
  const observer = new MutationObserver(records => {
    if (!styled) install();
    for (const record of records) {
      for (const node of record.addedNodes) enqueue(node);
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  install();
  const start = () => { install(); enqueue(document.documentElement); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  addEventListener('pageshow', start);
  const onVisibility = () => { if (!document.hidden) { scheduled = false; schedule(); } };
  document.addEventListener('visibilitychange', onVisibility);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    pending.clear();
    ownedStyle?.remove();
    for (const [element, properties] of originals) {
      for (const [name, original] of properties) {
        // Do not overwrite a style the website changed after our pass.
        if (element.style.getPropertyValue(name) !== original.applied || element.style.getPropertyPriority(name) !== 'important') continue;
        if (original.value) element.style.setProperty(name, original.value, original.priority);
        else element.style.removeProperty(name);
      }
    }
    for (const [element, classes] of addedClasses) for (const name of classes) element.classList.remove(name);
    originals.clear();
    addedClasses.clear();
    colorCache.clear();
    colorContext = null;
    document.removeEventListener('DOMContentLoaded', start);
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('pageshow', start);
    delete globalThis.__sailForceDark;
  }
})();

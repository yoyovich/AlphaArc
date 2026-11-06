import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Read the actual bundled JavaScript literals from Swift, rather than maintaining test copies.
// These literals contain no Swift interpolation. Reject any unsupported escape instead of silently testing
// JavaScript that differs from what the Swift compiler embeds.
function decodeSwift(text) {
  return text.replace(/\\(.)/gs, (_, escaped) => {
    const escapes = { '\\': '\\', '"': '"', n: '\n', r: '\r', t: '\t', '0': '\0' };
    assert.ok(Object.hasOwn(escapes, escaped), `Unsupported Swift escape: ${escaped}`);
    return escapes[escaped];
  });
}
function literal(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing Swift literal ${marker}`);
  const text = source.slice(start + marker.length);
  const end = text.indexOf('"""');
  assert.ok(end >= 0);
  return decodeSwift(text.slice(0, end));
}
const scriptlets = readFileSync(new URL('../../SailBrowser/Web/PageShieldScriptlets.swift', import.meta.url), 'utf8');
const helpers = literal(scriptlets, 'static let helpers = """');
const functions = new Map([...scriptlets.matchAll(/"([^"\n]+)": """([\s\S]*?)"""/g)]
  .map(match => [match[1], decodeSwift(match[2])]));
assert.equal(functions.size, 8);
export function scriptletSource(calls) {
  return `(() => { ${helpers}\nconst functions = {${[...functions].map(([name, source]) => JSON.stringify(name) + ':' + source).join(',')}};
    for (const [name, ...args] of ${JSON.stringify(calls)}) functions[name](args);
  })();`;
}
const shield = readFileSync(new URL('../../SailBrowser/Web/PageShield.swift', import.meta.url), 'utf8');
const cosmetic = literal(shield, 'private static let cosmetic = """');
export function cosmeticSource({ host = 'fixture.test', css = '', procedural = [], unlocksCookieWalls = false } = {}) {
  return `(() => {
    const host = ${JSON.stringify(host)}, css = ${JSON.stringify(css)}, procedural = ${JSON.stringify(procedural)};
    const unlocksCookieWalls = ${JSON.stringify(unlocksCookieWalls)}, recheck = 25, watch = 1000;
    ${cosmetic}
  })();`;
}

export function restoreBridgeSource() {
  const source = readFileSync(new URL('../../SailBrowser/Web/WebsiteFeatureSync.swift', import.meta.url), 'utf8');
  const name = /static let handlerName = "([^"\n]+)"/.exec(source)?.[1];
  assert.ok(name);
  // Resolve this one literal Swift interpolation, then decode the source exactly as above.
  return literal(source.replace('\\(handlerName)', name), 'source: """');
}

// A reproducible website fixture, not an iOS app screenshot. Uses the actual shipped feature scripts.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
const root = new URL('../../../', import.meta.url);
const output = new URL('docs/previews/', root);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      *{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#202124;font:16px/1.6 system-ui}
      header{padding:18px 22px;background:white;border-bottom:1px solid #8884}small{font-size:11px;letter-spacing:.04em}
      main{padding:22px}h1{font-size:32px;line-height:1.2;letter-spacing:-1px;margin:12px 0 18px}
      .card{padding:20px;background:white;border-radius:18px;margin:18px 0}.tag{font-size:12px;text-transform:uppercase;letter-spacing:.1em}
      p{margin:12px 0}svg{width:100%;height:150px;border-radius:16px;display:block}
      a{color:#235fe0}button{border:1px solid #8886;border-radius:11px;padding:12px;font:inherit;background:#f5f6f8;color:#202124;cursor:pointer}
      .cookies{position:fixed;bottom:14px;left:14px;right:14px;background:white;color:#202124;padding:18px;border:1px solid #8885;border-radius:18px;box-shadow:0 8px 30px #0002}
      .buttons{display:flex;gap:8px}.buttons button{flex:1;font-size:13px}#status{font-size:13px;padding:12px 0}
    </style>
    <header><b>Sail · проверка сайтов</b><br><small>ТЕСТОВАЯ СТРАНИЦА · НЕ ИНТЕРФЕЙС ПРИЛОЖЕНИЯ</small></header>
    <main><span class="tag">Чтение без лишнего</span><h1>Ночной город,<br>спокойный браузер</h1>
      <svg viewBox="0 0 350 150" role="img" aria-label="Цветная иллюстрация сохраняет исходные цвета">
        <rect width="350" height="150" fill="#23356d"/><circle cx="275" cy="40" r="24" fill="#f7cf78"/>
        <path d="M0 125L70 45 130 100 210 35 280 110 350 65V150H0Z" fill="#746aca"/>
        <path d="M0 145L80 90 160 145 250 80 350 140V150H0Z" fill="#4a9baf"/>
      </svg>
      <section class="card"><b>Больше внимания содержимому</b><p>Светлые поверхности становятся тёмными, а иллюстрации сохраняют исходные цвета.</p>
      <a href="#details">Продолжить чтение →</a></section>
      <div id="status">Cookie: выбор ещё не сделан.</div>
    </main>
    <div role="dialog" class="cookies" id="cookie-consent"><b>Настройки cookie</b><p>Мы используем необходимые и аналитические cookie.</p>
      <div class="buttons"><button id="accept">Принять все</button><button id="necessary">Только необходимые</button></div></div>
    <script>document.getElementById('necessary').onclick=()=>{document.getElementById('cookie-consent').hidden=true;document.getElementById('status').textContent='✓ Выбраны только необходимые cookie.'};</script>
    </html>` }));
  await page.goto('https://fixture.test/');
  await page.screenshot({ path: fileURLToPath(new URL('website-light.png', output)), fullPage: true });
  for (const name of ['force-dark', 'necessary-cookies']) {
    await page.addScriptTag({ content: readFileSync(new URL(`iOS/SailBrowser/Resources/WebsiteFeatures/${name}.js`, root), 'utf8') });
  }
  await page.waitForFunction(() => document.getElementById('cookie-consent').hidden
    && getComputedStyle(document.querySelector('.card')).backgroundColor === 'rgb(28, 28, 32)');
  await page.screenshot({ path: fileURLToPath(new URL('website-dark.png', output)), fullPage: true });
  console.log('Saved website fixture previews in docs/previews/ (not native iOS screenshots)');
} finally { await browser.close(); }

// Builds the clickable preview of the app as ONE self-contained HTML file:
//   dist-preview/cesme-kahve-onizleme.html
//
// The preview is the real app (web build) running on the built-in demo backend (EXPO_PUBLIC_DEMO=1,
// see src/lib/demo/) with sample data. It needs no server, no internet and no accounts: double-click
// the file to open it in a browser. Nothing is sent anywhere; data stays in that browser.
//
//   node scripts/build-preview.mjs            # export + package
//   node scripts/build-preview.mjs --no-export  # package an existing dist-preview/ export again
//   node scripts/build-preview.mjs --live       # same single file, but connected to the real Supabase project
//                                               # (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY): dist-preview/cesme-kahve-web.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist-preview');
const live = process.argv.includes('--live');
const target = path.join(out, live ? 'cesme-kahve-web.html' : 'cesme-kahve-onizleme.html');

if (!process.argv.includes('--no-export')) {
  fs.rmSync(out, { recursive: true, force: true });
  const env = { ...process.env };
  if (live) delete env.EXPO_PUBLIC_DEMO; else env.EXPO_PUBLIC_DEMO = '1';
  execSync('npx expo export --platform web --output-dir dist-preview --clear', { cwd: root, stdio: 'inherit', env });
}

const MIME = {
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json',
};
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const urlOf = (file) => '/' + path.relative(out, file).split(path.sep).join('/');
const dataUri = (file) => `data:${MIME[path.extname(file)] ?? 'application/octet-stream'};base64,${fs.readFileSync(file).toString('base64')}`;

const assets = walk(out).filter((f) => MIME[path.extname(f)] && !f.endsWith('metadata.json'));
const inlineAssets = (text) => {
  for (const f of assets) {
    const url = urlOf(f);
    if (text.includes(url)) text = text.split(`"${url}"`).join(JSON.stringify(dataUri(f))).split(`'${url}'`).join(`'${dataUri(f)}'`);
  }
  return text;
};

// Expo Router reads the address bar (window.location / window.history). A file opened from disk has a
// file:// address that cannot be rewritten, so the app gets an in-memory location and history instead.
const VIRTUAL_HISTORY = `
(function () {
  var real = window, base = 'http://onizleme.local', entries = [{ state: null, url: '/' }], idx = 0;
  function abs(u) {
    var x = new URL(u == null ? entries[idx].url : String(u), base + entries[idx].url);
    return x.pathname + x.search + x.hash;
  }
  function fire() { real.dispatchEvent(new PopStateEvent('popstate', { state: entries[idx].state })); }
  var loc = {
    assign: function (u) { hist.pushState(null, '', u); fire(); },
    replace: function (u) { hist.replaceState(null, '', u); fire(); },
    reload: function () { real.location.reload(); },
    toString: function () { return this.href; }
  };
  ['href', 'pathname', 'search', 'hash', 'origin', 'host', 'hostname', 'port', 'protocol'].forEach(function (k) {
    Object.defineProperty(loc, k, { enumerable: true, get: function () { return new URL(entries[idx].url, base)[k]; } });
  });
  var hist = {
    scrollRestoration: 'auto',
    get state() { return entries[idx].state; },
    get length() { return entries.length; },
    pushState: function (s, t, u) { entries = entries.slice(0, idx + 1); entries.push({ state: s, url: abs(u) }); idx++; },
    replaceState: function (s, t, u) { entries[idx] = { state: s, url: abs(u) }; },
    go: function (n) {
      var j = Math.max(0, Math.min(entries.length - 1, idx + (n | 0)));
      if (j !== idx) setTimeout(function () { idx = j; fire(); }, 0);
    },
    back: function () { this.go(-1); },
    forward: function () { this.go(1); }
  };
  var win = new Proxy(real, {
    get: function (t, p) {
      if (p === 'location') return loc;
      if (p === 'history') return hist;
      var v = Reflect.get(t, p);
      return typeof v === 'function' && !('prototype' in v) ? v.bind(t) : v;
    },
    set: function (t, p, v) { return Reflect.set(t, p, v); }
  });
  real.__ckPreview = { win: win, loc: loc, hist: hist };
})();`;

const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = inlineAssets(fs.readFileSync(path.join(out, src), 'utf8'));
  // A block (not a function) so the bundle's top-level `var`s stay global, while `window`, `location`
  // and `history` inside it resolve to the in-memory versions.
  return `<script>${VIRTUAL_HISTORY}\n{ let window = __ckPreview.win, location = __ckPreview.loc, history = __ckPreview.hist;\n${safeScript(js)}\n}</script>`;
});
html = html.replace('href="/favicon.ico"', `href="${dataUri(path.join(out, 'favicon.ico'))}"`);
if (!live) html = html.replace('<title>Çeşme Kahve</title>', '<title>Çeşme Kahve · Önizleme</title>');
// On a computer screen, show the app in a phone-sized frame instead of stretched across the window.
html = html.replace('</head>', `<style id="preview-frame">
  @media (min-width: 600px) {
    html, body { background: #e9e1d3; }
    #root { position: relative; max-width: 430px; height: min(932px, calc(100% - 48px)); margin: 24px auto;
      border-radius: 28px; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 40, 62, 0.25); transform: translateZ(0); }
  }
</style></head>`);
fs.writeFileSync(target, html);
console.log(`Preview: ${path.relative(root, target)} (${(fs.statSync(target).size / 1e6).toFixed(1)} MB)`);

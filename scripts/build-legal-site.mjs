// Builds the public legal pages (privacy policy, KVKK notice, terms, account deletion, support) from
// src/content/legal.json — the same texts the app shows. Upload legal-site/ to any static host and put
// the URLs into App Store Connect and Google Play Console.
//   node scripts/build-legal-site.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const legal = JSON.parse(fs.readFileSync(path.join(root, 'src/content/legal.json'), 'utf8'));
const out = path.join(root, 'legal-site');
fs.mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = (t) => t
  .replace(/\{company\.(\w+)\}/g, (_, k) => legal.company[k] ?? '')
  .replace('{stamps_per_reward}', '10')
  .replace('{reward_valid_days}', '90');

const pages = {
  gizlilik: 'gizlilik.html',
  kvkk: 'kvkk.html',
  'kullanim-kosullari': 'kullanim-kosullari.html',
  'ticari-ileti': 'ticari-ileti.html',
  'on-bilgilendirme': 'on-bilgilendirme.html',
  'mesafeli-satis': 'mesafeli-satis.html',
  yardim: 'destek.html',
};

const nav = Object.entries(pages)
  .map(([id, file]) => `<a href="${file}">${esc(legal.docs[id].title)}</a>`)
  .concat('<a href="hesap-silme.html">Hesap silme</a>')
  .join('');

const shell = (title, body) => `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Çeşme Kahve</title>
<style>
:root{--bg:#faf5ec;--surface:#fffdf8;--ink:#00283e;--muted:#4e6170;--line:#e8ddcd;--accent:#8f5410}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 64px}
.brand{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}
h1{font-family:Georgia,"Times New Roman",serif;font-size:32px;line-height:1.2;margin:8px 0 4px}
h2{font-family:Georgia,"Times New Roman",serif;font-size:20px;margin:28px 0 8px}
.updated{color:var(--muted);font-size:14px;margin:0 0 24px}
.card{background:var(--surface);border-radius:20px;padding:24px;box-shadow:0 1px 2px #00283e0f,0 2px 8px #00283e0d}
ul{padding-left:20px}li{margin:6px 0}
nav{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:32px;font-size:14px}nav a{color:var(--ink)}
.draft{background:#fbeac2;color:#845b00;border-radius:12px;padding:12px 16px;font-size:14px;margin-bottom:20px}
</style></head><body><main>
<div class="brand">Çeşme Kahve</div>
${body}
<nav>${nav}</nav>
</main></body></html>
`;

for (const [id, file] of Object.entries(pages)) {
  const d = legal.docs[id];
  let html = `<h1>${esc(d.title)}</h1><p class="updated">Son güncelleme: ${esc(d.updated)}</p><div class="card">`;
  let inList = false;
  for (const [kind, text] of d.blocks) {
    const t = esc(fill(text));
    if (kind === 'li' && !inList) { html += '<ul>'; inList = true; }
    if (kind !== 'li' && inList) { html += '</ul>'; inList = false; }
    html += kind === 'h' ? `<h2>${t}</h2>` : kind === 'li' ? `<li>${t}</li>` : `<p>${t}</p>`;
  }
  if (inList) html += '</ul>';
  html += '</div>';
  fs.writeFileSync(path.join(out, file), shell(d.title, html));
}

// Google Play requires a web page that explains how to delete an account and its data.
const del = `<h1>Hesap ve veri silme</h1><p class="updated">Çeşme Kahve uygulaması</p><div class="card">
<h2>Uygulamadan</h2><ul><li>Uygulamada <b>Profil</b> sekmesini aç.</li><li><b>Hesabımı sil</b>'e dokun.</li><li>Onay kutusuna <b>SİL</b> yaz ve <b>Hesabımı kalıcı olarak sil</b>'e dokun.</li></ul>
<h2>Uygulamaya erişemiyorsan</h2><p>Hesabına kayıtlı e-posta adresinden ${esc(legal.company.email)} adresine “Hesabımı silin” konulu bir e-posta gönder. Talebini en geç 30 gün içinde sonuçlandırırız.</p>
<h2>Silinen veriler</h2><ul><li>Ad, soyad, e-posta, cep telefonu, doğum tarihi, favori şube</li><li>Kahve kartı damgaları ve hediye kahveler</li><li>Bildirim kayıtları ve oturumlar</li></ul>
<h2>Saklanan veriler</h2><p>Vergi mevzuatı gereği sipariş ve ödeme kayıtları (ürünler, tutarlar, tarih, şube) kimliğinle ilişkisi kesilerek 10 yıl saklanır.</p></div>`;
fs.writeFileSync(path.join(out, 'hesap-silme.html'), shell('Hesap ve veri silme', del));
fs.writeFileSync(path.join(out, 'index.html'), shell('Çeşme Kahve uygulaması', `<h1>Çeşme Kahve uygulaması</h1><p class="updated">Yasal metinler ve destek</p><div class="card"><p>Menüden seç, şubende hazır olsun, kahve kartınla hediye kahve kazan.</p></div>`));
console.log('legal-site/ written:', fs.readdirSync(out).join(', '));

# Çeşme Kahve — mobil sipariş ve sadakat uygulaması

Önden sipariş, şubeden teslim alma, iyzico ile kartla ödeme ya da kasada ödeme, dijital kahve kartı (10 damga = 1 hediye kahve) ve baristalar için şube ekranı. iOS ve Android için tek kod tabanı.

> **Yayına almadan önce:** [LAUNCH.md](LAUNCH.md) adım adım yayın rehberi. Mağaza metinleri ve form cevapları: [store/STORE_LISTING.md](store/STORE_LISTING.md).

## Mimari

| Katman | Teknoloji | Nerede |
|---|---|---|
| Uygulama | Expo SDK 57, React Native 0.86, Expo Router, TypeScript | `src/` |
| Veri / önbellek | TanStack Query, Supabase Realtime | `src/lib/api.ts` |
| Hesaplar | Supabase Auth (e-posta + şifre, 6 haneli e-posta kodu ile doğrulama) | `src/state/auth.tsx`, `src/app/auth/` |
| Veritabanı | Supabase Postgres, satır düzeyi güvenlik (RLS) | `supabase/migrations/` |
| Sunucu mantığı | Postgres fonksiyonları (fiyatlandırma, damga, hediye) + Deno edge functions | `supabase/migrations/…_logic.sql`, `supabase/functions/` |
| Ödeme | iyzico Checkout Form (3D Secure dahil) | `supabase/functions/iyzico-*` |
| Bildirim | Expo Push (FCM / APNs): müşteriye "siparişin hazır", baristaya "yeni sipariş" | `src/lib/notifications.ts`, `staff-order-status`, `notify-branch` |
| Güncellemeler | EAS Update: yeni kod telefonlara uygulama yeniden indirilmeden gider | `src/components/UpdateBanner.tsx`, `.github/workflows/ota-update.yml` |
| Görseller | Menü fotoğrafları uygulamanın içinde; sonradan eklenen ürünler için Supabase Storage `menu` kovası | `supabase/seed-images/`, `src/lib/menu/images.ts` |
| Yasal metinler | Uygulama içinde + web'de barındırılan statik sayfalar | `src/content/legal.json`, `legal-site/` |

### Önemli kurallar (sunucuda uygulanır, uygulama sadece gösterir)

- **Fiyat sunucuda hesaplanır.** Uygulamanın gönderdiği tutara güvenilmez; `place_order` sepeti veritabanındaki fiyatlarla yeniden hesaplar. Tüm para tutarları kuruş cinsinden tamsayıdır.
- **İkinci kahve %50:** ücretli kahveler pahalıdan ucuza sıralanır, her ikilinin ucuz olanı yarı fiyat.
- **Kendi bardağın:** sipariş başına ₺10 indirim (`app_settings.own_cup_discount`).
- **Hediye kahve:** sepetteki en pahalı kahvelere uygulanır. Ödenmemiş siparişte rezerve edilir; iptal veya ödeme zaman aşımında geri verilir. 90 gün geçerli.
- **Damga:** kartla ödenmiş siparişte ödeme anında, kasada ödenecek siparişte "Teslim edildi" anında verilir. Hediye kahveler damga kazandırmaz. Kasada sipariş dışı alışverişler için barista üye QR'ını okutup damga ekler.
- **Ödenmemiş kart siparişleri** 30 dakika sonra otomatik iptal olur (pg_cron, 10 dakikada bir).
- Bir müşterinin aynı anda en fazla 3 açık siparişi olabilir.

### Klasörler

```
src/app/            ekranlar (Expo Router, dosya = rota)
  (tabs)/           Ana sayfa, Sepet, Profil, Şube (sadece personel)
  checkout/         şube seçimi → onay ve ödeme
  order/[id]        canlı sipariş durumu
  auth/             giriş, üyelik, e-posta kodu, şifre sıfırlama
  account/          hesap bilgileri, hesap silme
  staff/            QR okutma, tükenen ürünler
src/components/     tasarım sistemi bileşenleri
src/theme/tokens.ts renk, tipografi, boşluk (Çeşme Kahve tasarım sistemi)
src/lib/            API, fiyat önizleme, biçimlendirme, bildirimler
supabase/           şema, seed, edge functions, e-posta şablonları, testler
legal-site/         web'de yayınlanacak yasal sayfalar (üretilmiş)
store/              mağaza ekran görüntüleri ve öne çıkan görsel
```

## Yerel geliştirme

Gerekenler: Node 20+, [Supabase CLI](https://supabase.com/docs/guides/cli), Docker, telefonda bir development build (Expo Go bu SDK'daki tüm native modülleri içermeyebilir).

```bash
npm install
cp .env.example .env            # yerel değerler aşağıda

supabase start                  # Postgres, Auth, Storage, Realtime, e-posta görüntüleyici (Inbucket)
supabase db reset               # migrations + seed.sql

# edge functions (iyzico sandbox anahtarlarıyla)
cat > supabase/.env <<'EOF'
IYZICO_API_KEY=sandbox-...
IYZICO_SECRET_KEY=sandbox-...
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
APP_SCHEME=cesmekahve
EOF
supabase functions serve --env-file supabase/.env

npx expo start                  # development build ile aç
```

`.env` içine `supabase start` çıktısındaki `API URL` ve `anon key` değerlerini yazın. Telefon bilgisayara aynı ağdan bağlanıyorsa `127.0.0.1` yerine bilgisayarın yerel IP'sini kullanın.

Yerelde gönderilen doğrulama e-postaları `http://127.0.0.1:54324` (Inbucket) adresinde görünür.

### Komutlar

```bash
npm run typecheck        # TypeScript
npm run lint             # ESLint (expo lint)
npm run test:backend     # 24 uçtan uca test: RLS, fiyat, damga/hediye, personel, ödeme, iade, şube bildirimi, hesap silme
```

`test:backend` yalnızca **yerel veya staging** projede çalıştırılmalı; test kullanıcıları oluşturup siler:

```bash
SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run test:backend
```

## Önizleme (demo modu)

Uygulama, sunucu ve hesap olmadan da çalışabilir: `EXPO_PUBLIC_DEMO=1` ile derlenince Supabase yerine cihazda çalışan bir demo arka uç (`src/lib/demo/`) kullanılır. Menü, şubeler ve kurallar gerçek uygulamayla aynıdır; veriler yalnızca o tarayıcıda/telefonda tutulur, e-posta gönderilmez, ödeme alınmaz. Her ekranda "ÖNİZLEME" etiketi görünür; sanal bir barista yeni siparişleri sırasıyla "Hazırlanıyor" ve "Hazır" yapar.

| Örnek hesap | E-posta | Şifre |
|---|---|---|
| Müşteri (7 damga, 1 hediye kahve) | `demo@cesmekahve.com` | `demo1234` |
| Barista (Alaçatı şubesi) | `barista@cesmekahve.com` | `demo1234` |

Yeni üyelikte e-posta doğrulama kodu her zaman `123456`. Kasada okutma ekranında örnek kodlar: kahve kartı `A3VTLQBSR6`, hediye kahve `K7M2QX`. Profil sayfasının en altındaki **Önizlemeyi sıfırla** her şeyi başa döndürür.

```bash
node scripts/build-preview.mjs                 # tek dosyalık önizleme: dist-preview/cesme-kahve-onizleme.html
EXPO_PUBLIC_DEMO=1 npx expo start             # telefonda Expo Go ile demo (sunucu gerekmez)
```

Tek dosyalık önizleme internetsiz çalışır; çift tıklayıp tarayıcıda açmak yeterli. Gerçek derlemelerde demo arka ucu pakete girmez (`metro.config.js` onu boş bir taslakla değiştirir).

## Yönetim (admin paneli yerine Supabase Dashboard)

İlk sürümde ayrı bir yönetim paneli yok; menü ve şubeler Supabase Dashboard → **Table Editor** üzerinden düzenlenir. Değişiklikler uygulamaya en geç 5 dakika içinde yansır.

| Ne | Tablo | Not |
|---|---|---|
| Fiyat değişikliği | `products.price` | **Kuruş** cinsinden: ₺135 = `13500` |
| Ürünü menüden kaldır | `products.is_active = false` | Geçmiş siparişler etkilenmez |
| Yeni ürün | `products` | Fotoğrafı Storage → `menu` kovasına yükleyin, `image_path = 'menu/<dosya>.webp'` (mevcut ürünlerin fotoğrafları uygulamanın içinde gelir) |
| Süt seçenekleri | `milk_options` | `is_default` en fazla bir satırda |
| Şube aç/kapat | `branches.status`, `accepts_orders` | `status`: `open` / `coming_soon` / `closed`; `accepts_orders = false` sipariş almayı geçici durdurur |
| Hazırlık süresi | `branches.prep_minutes` | Müşteriye gösterilen tahmini süre |
| Kampanya kartları | `campaigns` | Ana sayfadaki kartlar (görsel amaçlı) |
| Kurallar | `app_settings` | damga sayısı, hediye süresi, indirimler, ödeme süresi |
| Kartla ödeme aç/kapat | `app_settings.card_payments_enabled` | iyzico anahtarları girilene kadar `false` bırakın; kapalıyken uygulamada yalnızca "Şubede öde" görünür |

Tek bir şubede ürün bittiğinde baristalar uygulamadaki **Şube → Tükenenler** ekranını kullanır.

### Personel ekleme

Personel önce uygulamadan normal üye olur. Ardından SQL Editor'da:

```sql
-- barista: tek şube
insert into public.staff_members (user_id, branch_id, role)
select id, 'alacati', 'barista' from auth.users where email = 'barista@ornek.com';

-- yönetici: tüm şubeler (branch_id boş)
insert into public.staff_members (user_id, branch_id, role)
select id, null, 'admin' from auth.users where email = 'yonetici@ornek.com';

-- personel çıkarma
delete from public.staff_members
where user_id = (select id from auth.users where email = 'barista@ornek.com');
```

Şube kimlikleri: `select id, name from public.branches order by sort;`

Personel hesabıyla giriş yapıldığında alt menüde **Şube** sekmesi görünür: sipariş kuyruğu (Yeni → Hazırlanıyor → Hazır → Teslim edildi), **Geçmiş** (bugün / 7 / 30 günün teslim edilen ve iptal edilen siparişleri, ciro ve kahve sayısıyla), QR okutma (hediye kahve kullanımı, kasada damga ekleme) ve tükenen ürünler. Baristalar yalnızca kendi şubelerini görür; `admin` rolü tüm şubeler arasında geçiş yapabilir.

Şube ekranı ilk açıldığında bildirim izni ister. İzin verilen telefonlara, şubeye yeni sipariş düştüğünde (kasada ödemede hemen, kartla ödemede ödeme alınınca) uygulama kapalı olsa da "Yeni sipariş #1234 · Ayşe" bildirimi gelir; dokununca Şube ekranı açılır. Bildirim yalnızca o şubenin personeline gider (tüm şubeleri gören `admin` hesaplarına gitmez). Çıkış yapılan telefona bildirim gönderilmez. Android'de bu bildirimler ayrı bir kanaldadır ("Yeni siparişler (şube)"), telefon ayarlarından ayrıca sessize alınabilir.

### Kartla ödenmiş siparişin iptali

Kartla ödenmiş siparişler uygulamadan iptal edilemez (şube ekranı "önce iade" uyarısı verir). Önce iyzico Üye İşyeri Paneli'nden iadeyi yapın, ardından SQL Editor'da sipariş numarasıyla:

```sql
select public.admin_refund_order(1234);
```

Bu fonksiyon siparişi iptal eder ve "iade edildi" olarak işaretler, siparişte kullanılan hediye kahveyi müşteriye geri verir ve siparişten kazanılan damgaları geri alır. Müşteri uygulamada "Ödemen kartına iade edildi" mesajını görür.

## Bilinen sınırlamalar (v1.0)

- Ayrı yönetim paneli yok (Supabase Dashboard kullanılıyor).
- İade iyzico panelinden elle yapılıyor.
- Kampanya kartları bilgilendirme amaçlı; otomatik uygulanan kampanyalar yalnızca "ikinci kahve %50" ve "kendi bardağın ₺10".
- Uygulama yalnızca Türkçe.
- Kayıtlı kart yok; her ödemede iyzico formu açılır.

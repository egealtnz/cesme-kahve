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
| Bildirim | Android: Firebase (FCM v1, doğrudan); iPhone: Expo Push (APNs). Müşteriye "siparişin hazır", baristaya "yeni sipariş" | `src/lib/notifications.ts`, `supabase/functions/_shared/push.ts` |
| Güncellemeler | EAS Update: yeni kod telefonlara uygulama yeniden indirilmeden gider | `src/components/UpdateBanner.tsx`, `.github/workflows/ota-update.yml` |
| Görseller | Menü fotoğrafları uygulamanın içinde; sonradan eklenen ürünler için Supabase Storage `menu` kovası | `supabase/seed-images/`, `src/lib/menu/images.ts` |
| Yasal metinler | Uygulama içinde + web'de barındırılan statik sayfalar | `src/content/legal.json`, `legal-site/` |

### Önemli kurallar (sunucuda uygulanır, uygulama sadece gösterir)

- **Fiyat sunucuda hesaplanır.** Uygulamanın gönderdiği tutara güvenilmez; `place_order` sepeti veritabanındaki fiyatlarla yeniden hesaplar. Tüm para tutarları kuruş cinsinden tamsayıdır.
- **İkinci kahve %50:** ücretli kahveler pahalıdan ucuza sıralanır, her ikilinin ucuz olanı yarı fiyat.
- **Kendi bardağın:** şu an kapalı (`app_settings.own_cup_discount = 0`). Açmak için tutarı kuruş cinsinden yazın (₺10 = `1000`); sepetteki seçenek kendiliğinden görünür. Kampanya kartı için `campaigns` tablosuna satır ekleyin.
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
npm run test:backend     # 29 uçtan uca test: RLS, fiyat, damga/hediye, personel ve ekip yetkileri, ödeme, iade, şube bildirimi, yönetici araçları, çalışma saatleri, ileri saat, favori, değerlendirme, rapor, doğum günü, bildirim, şirket paneli, hesap silme
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
| Şube müdürü (Alaçatı, ekibi yönetir) | `mudur@cesmekahve.com` | `demo1234` |
| İşletme sahibi (tüm şubeler, rapor, menü, bildirim) | `yonetici@cesmekahve.com` | `demo1234` |

Önizlemede son 30 güne ait örnek siparişler, yorumlar ve bir favori içecek hazır gelir; satış raporu bu verilerle dolu görünür.

Yeni üyelikte e-posta doğrulama kodu her zaman `123456`. Kasada okutma ekranında örnek kodlar: kahve kartı `A3VTLQBSR6`, hediye kahve `K7M2QX`. Profil sayfasının en altındaki **Önizlemeyi sıfırla** her şeyi başa döndürür.

```bash
node scripts/build-preview.mjs                 # tek dosyalık önizleme: dist-preview/cesme-kahve-onizleme.html
EXPO_PUBLIC_DEMO=1 npx expo start             # telefonda Expo Go ile demo (sunucu gerekmez)
```

Tek dosyalık önizleme internetsiz çalışır; çift tıklayıp tarayıcıda açmak yeterli. Gerçek derlemelerde demo arka ucu pakete girmez (`metro.config.js` onu boş bir taslakla değiştirir).

## İşletme yönetimi (uygulama içinde)

Yönetici (`admin`, şirketin sahibi/genel müdürü) hesabıyla **Profil → İşletme yönetimi** (ya da Şube ekranındaki bağlantı) **Şirket paneli**ni açar:

| Ekran | Ne yapılır |
|---|---|
| **Şu an** | Tüm şubeler canlı: bugünkü ciro, teslim edilen ve açık sipariş, sipariş alan şube sayısı; 15 dakikadan uzun bekleyen sipariş, durdurulmuş şube ve tükenen ürün uyarıları. Şubeler en yoğundan başlayarak listelenir (her 30 saniyede yenilenir). |
| **Şube (canlı)** | Bir şubeye dokununca: yoğunluk / 30 dk durdur, açık siparişler, tezgah ekranı, tükenenler, ekip ve şube ayarlarına kısayol. |
| **Siparişler** | Tüm şubelerde sipariş no, müşteri adı, e-posta ya da telefonla arama; durum ve şube süzgeci. Sipariş ayrıntısında ürünler, kimin hazırladığı, müşteri yorumu; tezgahtaki gibi ilerletme ve iptal. |
| **Müşteriler** | Üye sayısı, son 7 günde katılan, kampanya izni; ad / e-posta / telefon / üye koduyla arama. Müşteri sayfasında harcama, kahve kartı, hediye kahveler, son siparişler; **hediye kahve gönder** (bildirimle) ve **damga düzelt**. |
| **Ekip** | Tüm şubelerin müdür ve baristaları şube şube, son giriş tarihi, bekleyen davetler, müdürü olmayan şube uyarısı; **Excel'e aktar (CSV)**. Ekleme/çıkarma şubenin “Yönet” bağlantısından. |
| **Satışlar** | Bugün / 7 / 30 / 90 gün, tüm şubeler ya da tek şube: ciro, sipariş, ortalama sepet, kahve sayısı, müşteri, memnuniyet; şube sıralaması, en çok satanlar, yoğun saatler, müşteri yorumları. **Excel'e aktar (CSV)** muhasebe için sipariş listesini paylaşır/indirir. |
| **Menü ve fiyatlar** | Ürün ekle, fiyat/ad/açıklama/kategori değiştir, fotoğraf yükle (telefonun galerisinden), menüde göster/gizle. |
| **Süt seçenekleri ve kategoriler** | Süt fiyat farkları, süt seçeneğini ve kategorileri göster/gizle. |
| **Şubeler ve çalışma saatleri** | Açık / yakında / kapalı, uygulamadan sipariş alma, hazırlık süresi, haftanın her günü için açılış-kapanış (gece yarısını geçebilir), ekip. |
| **Kampanya kartları** | Ana sayfadaki kartları ekle, düzenle, gizle, sil (renk önizlemeli). |
| **Bildirim gönder** | Kampanya iletisine izin veren ve bildirimleri açık müşterilere (hepsine ya da bir şubenin müdavimlerine) duyuru. İki gönderim arasında en az 10 dakika. |
| **Ayarlar** | Kaç kahvede bir hediye, ikinci kahve indirimi (%20/30/50), kendi bardağın indirimi, doğum günü kahvesi, “Seni özledik” bildirimi. |

Şirket panelinin tüm verileri yalnızca yöneticiye açık veritabanı fonksiyonlarından gelir (`supabase/migrations/…_company_admin.sql`); müdür ve baristalar bu ekranları açamaz. Değişiklikler müşterilere birkaç dakika içinde yansır. Supabase Dashboard → Table Editor hâlâ kullanılabilir (aynı tablolar: `products`, `branches`, `campaigns`, `app_settings`); fiyatlar **kuruş** cinsindendir (₺135 = `13500`). Kartla ödeme anahtarı (`app_settings.card_payments_enabled`) bilerek uygulamada yok: iyzico anahtarları girilmeden açılmamalı.

### Şube ekranındaki yeni araçlar

- **Yoğunluk:** “+10 dk / +20 dk” müşterilere gösterilen bekleme süresini 2 saatliğine uzatır; “30 dk durdur” uygulama siparişlerini kısa süreliğine kapatır (o süreden sonraki ileri saat siparişleri yine gelir). Her barista kullanabilir.
- **Tezgah ekranı:** tablet için büyük yazılı sipariş panosu; ekran açık kalır, her yeni siparişte zil çalar ve bekleyen sipariş varken 45 saniyede bir hatırlatır. Tablet genişliğinde üç sütun yan yana.
- **İleri saat siparişleri:** “Planlı” bölümünde saatine göre sıralanır; hazırlama zamanı gelince (teslim saatinden hazırlık süresi + 10 dk önce) “Yeni”ye geçer ve baristalara bildirim gider.
- **Kim yaptı / müşteri ne dedi:** Geçmiş'te her siparişi kimin kabul ettiği, hazırladığı, teslim ettiği ve müşterinin 👍/👎 yorumu görünür.

### Müşteri tarafında

- **Daha sonra alacağım:** ödeme ekranında bugün ya da yarın için 15 dakikalık aralıklarla saat seçilir; şube kapalı ya da duraklatılmışken yalnızca bu seçenek açıktır.
- **Her zamankinden / Favorilerin:** ana sayfada son siparişi tek dokunuşla tekrarlama ve ürün sayfasında ❤️ ile kaydedilen favoriler.
- **Nasıldı?:** teslimden sonraki 7 gün içinde 👍/👎 ve isteğe bağlı yorum (şube ve yönetici görür).
- **Doğum günü kahvesi:** doğum gününü yazan müşteriye o sabah 06:05'te hediye kahve ve bildirim (yılda bir; Ayarlar'dan kapatılabilir).

Tek bir şubede ürün bittiğinde baristalar uygulamadaki **Şube → Tükenenler** ekranını kullanır.

### Personel ve yetkiler

| Görev | Ne görür, ne yapar |
|---|---|
| **Yönetici** (`admin`) | Tüm şubeler. Her şubeye şube müdürü ve barista ekler/çıkarır. |
| **Şube müdürü** (`manager`) | Kendi şubesi. Barista ne yapıyorsa + kendi şubesine barista ekler/çıkarır. |
| **Barista** (`barista`) | Kendi şubesi: sipariş kuyruğu, geçmiş, QR okutma, tükenenler. |

Günlük kullanımda SQL gerekmez: yönetici ya da şube müdürü uygulamada **Şube → Ekip** ekranından e-posta yazıp **Ekibe ekle**'ye dokunur.

- Kişinin hesabı varsa hemen eklenir; uygulamayı bir sonraki açışında **Şube** sekmesini görür.
- Hesabı yoksa davet bekler. Bu e-postayla üye olup 6 haneli kodla doğruladığı anda otomatik olarak ekibe katılır (başkası o e-postayı doğrulayamayacağı için davet yanlış kişiye geçemez). Bekleyen davetler aynı ekranda listelenir ve geri alınabilir.
- **Ekipten çıkar** yalnızca Şube ekranı erişimini kapatır ve yeni sipariş bildirimlerini durdurur; kişinin müşteri hesabı ve kahve kartı kalır.
- Müdürler başka şubeyi göremez, müdür atayamaz, müdürleri ya da kendilerini çıkaramaz. Bu kurallar veritabanında uygulanır (`supabase/migrations/…_branch_team.sql`), uygulama yalnızca gösterir.

**İlk yöneticiyi** (işletme sahibi) bir kez SQL Editor'dan ekleyin; sonrası uygulamadan yapılır:

```sql
insert into public.staff_members (user_id, branch_id, role)
select id, null, 'admin' from auth.users where email = 'sahip@ornek.com';
```

Kim nerede çalışıyor (kontrol için):

```sql
select u.email, s.branch_id, s.role from public.staff_members s
join auth.users u on u.id = s.user_id order by s.branch_id nulls first, s.role;
```

Şube kimlikleri: `select id, name from public.branches order by sort;`

Personel hesabıyla giriş yapıldığında alt menüde **Şube** sekmesi görünür: sipariş kuyruğu (Yeni → Hazırlanıyor → Hazır → Teslim edildi), **Geçmiş** (bugün / 7 / 30 günün teslim edilen ve iptal edilen siparişleri gün gün, tarih ve saatiyle; ciro ve kahve sayısı; her siparişi kimin kabul ettiği, hazırladığı ve teslim ettiği), QR okutma (hediye kahve kullanımı, kasada damga ekleme), tükenen ürünler ve (müdür/yöneticiler için) **Ekip**. Baristalar ve müdürler yalnızca kendi şubelerini görür; yönetici tüm şubeler arasında geçiş yapabilir.

Şube ekranı ilk açıldığında bildirim izni ister. İzin verilen telefonlara, şubeye yeni sipariş düştüğünde (kasada ödemede hemen, kartla ödemede ödeme alınınca) uygulama kapalı olsa da "Yeni sipariş #1234 · Ayşe" bildirimi gelir; dokununca Şube ekranı açılır. Bildirim o şubenin barista ve müdürlerine gider (tüm şubeleri gören yöneticiye gitmez). Çıkış yapılan telefona bildirim gönderilmez. Android'de bu bildirimler ayrı bir kanaldadır ("Yeni siparişler (şube)"), telefon ayarlarından ayrıca sessize alınabilir.

### Kartla ödenmiş siparişin iptali

Kartla ödenmiş siparişler uygulamadan iptal edilemez (şube ekranı "önce iade" uyarısı verir). Önce iyzico Üye İşyeri Paneli'nden iadeyi yapın, ardından SQL Editor'da sipariş numarasıyla:

```sql
select public.admin_refund_order(1234);
```

Bu fonksiyon siparişi iptal eder ve "iade edildi" olarak işaretler, siparişte kullanılan hediye kahveyi müşteriye geri verir ve siparişten kazanılan damgaları geri alır. Müşteri uygulamada "Ödemen kartına iade edildi" mesajını görür.

## Bilinen sınırlamalar (v1.0)

- İade iyzico panelinden elle yapılıyor.
- Kampanya kartları bilgilendirme amaçlı; otomatik uygulanan kampanya yalnızca "ikinci kahve %50" ("kendi bardağın" indirimi kapalı).
- Uygulama yalnızca Türkçe.
- Kayıtlı kart yok; her ödemede iyzico formu açılır.

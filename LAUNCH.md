# Yayına alma rehberi

Kod hazır. Bu rehber, uygulamayı App Store ve Google Play'de satışa açmak için **sizin** yapmanız gerekenleri sırayla anlatır. Toplam süre çoğunlukla bekleme süreleridir (Apple D-U-N-S ve iyzico onayı birkaç gün ile iki hafta sürebilir), bu yüzden 1. adımdaki başvuruları hemen başlatın.

Her adımın sonunda ✅ ile işaretlenmiş bir kontrol var.

---

## 0. Kod içinde doldurulacak yerler (özet)

| Ne | Nerede | Adım |
|---|---|---|
| Şirket bilgileri (unvan, adres, MERSİS, KEP, telefon, e-posta) | `src/content/legal.json` → `company` | 4 |
| EAS proje kimliği | `app.json` → `extra.eas.projectId` | 6 |
| App Store Connect uygulama kimliği | `eas.json` → `submit.production.ios.ascAppId` | 8 |
| Supabase adresi ve anahtarı | EAS ortam değişkenleri | 6 |
| iyzico anahtarları | Supabase secrets | 3 |
| Firebase `google-services.json` | proje kökü (git'e eklenir) | 6 |
| Expo erişim anahtarı (uygulama içi güncellemeler) | GitHub secret `EXPO_TOKEN` | 9 |
| Uygulama ikonu (vektör logo ile yeniden) | `assets/brand/` | 5 |

---

## 1. Hesaplar ve başvurular (hepsi **şirket adına**)

Mağazada satıcı adı olarak şirket unvanı görünür; kişisel hesap açmayın.

1. **D-U-N-S numarası** — Apple kurumsal hesap için gerekli. [Apple'ın D-U-N-S sorgulama sayfasından](https://developer.apple.com/enroll/duns-lookup/) ücretsiz alınır, 5–14 gün sürebilir.
2. **Apple Developer Program (Organization)** — yıllık 99 USD. D-U-N-S gelince [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/).
3. **Google Play Console (Organization)** — tek seferlik 25 USD. Kurum hesabı seçin: yeni *kişisel* hesaplar yayından önce 14 gün boyunca en az 12 testçiyle kapalı test yapmak zorunda; kurum hesapları bu şarttan muaf. Şirket belgeleri ve D-U-N-S istenir.
4. **iyzico üye işyeri** — [iyzico.com](https://www.iyzico.com) üzerinden başvurun. Vergi levhası, imza sirküleri, faaliyet belgesi istenir. Başvuruda "mobil uygulama, gıda ürünü, şubeden teslim" olduğunu belirtin. Onaydan önce sandbox ile çalışabilirsiniz ([sandbox-merchant.iyzipay.com](https://sandbox-merchant.iyzipay.com)).
5. **Supabase** — [supabase.com](https://supabase.com). Canlı kullanım için **Pro plan** (aylık 25 USD) önerilir: ücretsiz projeler bir hafta işlem olmazsa duraklatılır ve günlük yedek yoktur.
6. **Expo** — [expo.dev](https://expo.dev) ücretsiz hesap, bir *organization* oluşturun. Ücretsiz plandaki aylık build kotası ilk yayın için yeterlidir.
7. **Firebase** — Android bildirimleri için ücretsiz proje ([console.firebase.google.com](https://console.firebase.google.com)).
8. **E-posta gönderimi (SMTP)** — Doğrulama kodları için Resend, Postmark, Amazon SES veya şirket e-posta sağlayıcınız. Supabase'in yerleşik e-postası saatte birkaç e-postayla sınırlıdır ve canlıda kullanılamaz. Gönderen adres örneği: `uygulama@cesmekahve.com` (alan adında SPF/DKIM kayıtlarını sağlayıcının anlattığı şekilde ekleyin).

**Mevzuat (mali müşavir / avukatla):**
- **ETBİS** kaydı — uygulama üzerinden satış elektronik ticaret sayılır.
- **İYS** kaydı — pazarlama e-postası veya SMS gönderecekseniz. Uygulama izni zaten ayrı ve isteğe bağlı topluyor.
- **VERBİS** — şirket büyüklüğüne göre yükümlülük doğabilir.
- Yasal metinlerin avukat tarafından gözden geçirilmesi (4. adım).
- Menü fotoğrafları cesmekahve.com'dan alındı. Fotoğrafların uygulamada ve mağaza görsellerinde kullanım hakkının markada olduğunu teyit edin. Mümkünse daha yüksek çözünürlüklü çekimlerle değiştirin (`supabase/seed-images/`, 7. adım).

✅ Apple ve Google hesapları onaylandı, iyzico sandbox anahtarları elinizde.

---

## 2. Supabase projesi

1. Supabase'de yeni proje: bölge **Frankfurt (eu-central-1)** (Türkiye'ye en yakın, KVKK yurt dışı aktarım açısından aydınlatma metninde belirtiliyor). Güçlü bir veritabanı şifresi seçip saklayın.
2. Bilgisayarınızda [Supabase CLI](https://supabase.com/docs/guides/cli) kurulu olsun, proje klasöründe:

```bash
supabase login
supabase link --project-ref <proje-ref>        # Dashboard → Project Settings → General
supabase db push                                # 6 migration: şema, iş kuralları, güvenlik, iade, kart anahtarı, şube bildirimi
```

Ardından SQL Editor'da, yeni siparişlerin baristalara bildirim olarak gitmesi için:

```sql
update public.app_settings set functions_url = 'https://<proje-ref>.supabase.co/functions/v1';
```

3. Menü ve şube verisini yükleyin. Dashboard → **SQL Editor** → `supabase/seed.sql` dosyasının içeriğini yapıştırıp çalıştırın. **Önce fiyatları ve ürün adlarını gerçekleriyle değiştirin**: seed'deki fiyatlar örnektir, kuruş cinsindendir (₺135 = `13500`).
4. Menü fotoğrafları uygulamanın içinde gelir; yükleme gerekmez. Sonradan eklediğiniz ürünlerin fotoğraflarını Storage → `menu` kovasına yükleyin.

5. Kontrol için SQL Editor'da:

```sql
select count(*) from public.products;                -- 42
select jobname, schedule from cron.job;              -- expire-unpaid-orders, */10 * * * *
select * from pg_publication_tables where pubname = 'supabase_realtime';   -- orders, product_availability
```

`cron.job` boşsa: Dashboard → Database → Extensions → **pg_cron**'u açın, ardından `supabase/migrations/20261010120200_security.sql` içindeki "scheduled cleanup" bloğunu SQL Editor'da tekrar çalıştırın.

✅ Tablolar dolu, zamanlanmış görev ve Realtime yayını var.

---

## 3. Sunucu fonksiyonları ve iyzico

1. `supabase/.env.production` adında bir dosya oluşturun (git'e eklenmez):

```bash
IYZICO_API_KEY=<iyzico API anahtarı>
IYZICO_SECRET_KEY=<iyzico güvenlik anahtarı>
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com   # canlıda: https://api.iyzipay.com
IYZICO_IDENTITY_NUMBER=11111111111                # aşağıdaki nota bakın
APP_SCHEME=cesmekahve
EXPO_ACCESS_TOKEN=<expo.dev → Account settings → Access tokens>
```

2. Yükleyin ve fonksiyonları yayınlayın:

```bash
supabase secrets set --env-file supabase/.env.production
supabase functions deploy           # iyzico-checkout, iyzico-callback, iyzico-status, staff-order-status, delete-account, notify-branch
```

`notify-branch` da JWT doğrulaması olmadan yayınlanır: onu kullanıcı değil veritabanı çağırır (sipariş şubeye düştüğünde, pg_net ile). Her siparişi yalnızca bir kez ve yalnızca o şubenin personeline bildirir.

`iyzico-callback` fonksiyonu JWT doğrulaması olmadan yayınlanır (`supabase/config.toml` içinde `verify_jwt = false`). iyzico ödeme sonrası tarayıcıyı bu adrese yönlendirir. Güvenlik, ödemenin iyzico'dan imzalı olarak tekrar sorgulanmasıyla sağlanır. Dashboard → Edge Functions'ta bu fonksiyonun "Verify JWT" ayarının kapalı olduğunu kontrol edin.

**iyzico notları**
- Ödeme sonrası dönüş adresi otomatik oluşur: `https://<proje-ref>.supabase.co/functions/v1/iyzico-callback`. iyzico panelinde ayrıca bir ayar gerekmez.
- iyzico her ödemede alıcının T.C. kimlik numarasını ister. Uygulama müşteriden kimlik numarası **toplamaz** (KVKK açısından gereksiz veri). Bunun yerine sabit `11111111111` gönderilir. Bu yaygın bir uygulamadır, ancak iyzico hesap yöneticinizden yazılı onay alın. Farklı bir değer isterlerse sadece `IYZICO_IDENTITY_NUMBER` secret'ını değiştirin.
- Sandbox test kartları: başarılı ödeme `5528 7900 0000 0008`, yetersiz bakiye `4111 1111 1111 1129`. Son kullanma tarihi ileri bir tarih, CVC herhangi üç hane olabilir. 3D doğrulama ekranında sandbox'ın gösterdiği yönergeyi izleyin. Tam liste: [iyzico test kartları](https://docs.iyzico.com/ek-bilgiler/test-kartlari).
- Canlıya geçerken yalnızca üç secret'ı değiştirip fonksiyonları yeniden yayınlamanız yeterli: `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL=https://api.iyzipay.com`.

✅ Sandbox kartıyla uygulamadan bir sipariş ödendi ve şube ekranına düştü (7. adımdan sonra test edilir).

---

## 4. Kimlik doğrulama, e-posta ve yasal metinler

**Auth ayarları** (Dashboard → Authentication):
- **URL Configuration** → Site URL: `cesmekahve://`; Redirect URLs: `cesmekahve://**`
- **Sign In / Providers → Email**: "Confirm email" açık, minimum şifre uzunluğu 8, şifre gereksinimi "letters and digits".
- **Emails → SMTP Settings**: 1. adımdaki sağlayıcının bilgileri, gönderen adı "Çeşme Kahve".
- **Emails → Templates**: "Confirm signup" ve "Reset password" için `supabase/templates/confirmation.html` ve `recovery.html` içeriğini yapıştırın. Konu satırları: "Çeşme Kahve doğrulama kodun" ve "Çeşme Kahve şifre sıfırlama kodun". Bu şablonlar bağlantı yerine **6 haneli kod** gönderir; uygulama kodu bekler.
- **Rate Limits**: e-posta gönderim limitini SMTP sağlayıcınızın izin verdiği değere yükseltin (ör. saatte 100).

Alternatif: `supabase config push` komutu `supabase/config.toml` içindeki auth ayarlarını ve şablonları tek seferde gönderir. SMTP bilgileri yine panelden girilmelidir.

**Yasal metinler:**
1. `src/content/legal.json` dosyasının başındaki `company` alanını doldurun. Metinlerde köşeli parantez kalmamalı.
2. Metinler taslaktır; **avukatınıza okutun**: KVKK aydınlatma metni, gizlilik politikası, kullanım koşulları, ön bilgilendirme formu, mesafeli satış sözleşmesi, ticari ileti izni.
3. Web sürümünü üretin ve yayınlayın:

```bash
node scripts/build-legal-site.mjs        # legal-site/ klasörünü yeniden üretir
```

`legal-site/` içindeki dosyaları `https://www.cesmekahve.com/uygulama/` altına yükleyin (web sitenizin yöneticisi yapabilir). Başka bir adres kullanırsanız 6. adımda `EXPO_PUBLIC_LEGAL_BASE_URL` değişkenini ona göre ayarlayın.

Mağaza formlarında kullanılacak adresler:

| Form alanı | Adres |
|---|---|
| Gizlilik politikası (iki mağaza) | `…/uygulama/gizlilik.html` |
| Destek (App Store) | `…/uygulama/destek.html` |
| Hesap silme (Google Play) | `…/uygulama/hesap-silme.html` |

✅ Uygulamada Profil → Yardım ve yasal altındaki metinlerde şirket bilgileri doğru görünüyor; web adresleri açılıyor.

---

## 5. Marka varlıkları

`assets/brand/` içindeki ikonlar mevcut logodan büyütülerek üretildi ve yakından bakınca yumuşak görünür. Tasarımcınızdan logonun **vektör (SVG/AI)** halini alıp şu dosyaları yeniden üretin (aynı ad ve boyutlarla):

| Dosya | Boyut | Not |
|---|---|---|
| `icon.png` | 1024×1024 | iOS ikonu; saydamlık yok, köşe yuvarlatma yok |
| `adaptive-foreground.png` | 1024×1024 | Android; logo ortadaki 640 px'lik güvenli alanda |
| `adaptive-background.png` | 1024×1024 | Düz krem `#faf5ec` |
| `adaptive-monochrome.png` | 1024×1024 | Android 13+ temalı ikon; tek renk, saydam zemin |
| `splash-icon.png` | 1024×1024 | Açılış ekranı, saydam zemin |
| `notification-icon.png` | 96×96 | Android bildirim ikonu; **beyaz**, saydam zemin |

Google Play için 512×512 ikon da gerekir; `icon.png`'yi küçültüp kullanın.

---

## 6. EAS (derleme servisi)

```bash
npm install -g eas-cli
eas login
eas init                                  # Expo'da projeyi oluşturur ve proje kimliğini yazdırır
```

`app.json` içindeki `"projectId": "REPLACE_WITH_EAS_PROJECT_ID"` değerini `eas init`'in verdiği kimlikle değiştirin. Proje `app.config.js` kullandığı için `eas init` bunu kendisi yazamayabilir.

**Ortam değişkenleri** (expo.dev → proje → Environment variables, ya da komutla). `production` ve `preview` ortamları için:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value https://<proje-ref>.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon / publishable anahtar>  --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_LEGAL_BASE_URL    --value https://www.cesmekahve.com/uygulama --visibility plaintext
```

Anon (publishable) anahtar uygulamaya gömülür ve bu güvenlidir: veriye erişim veritabanındaki satır düzeyi güvenlik kurallarıyla sınırlıdır. **`service_role` anahtarını asla buraya koymayın.**

**Android bildirimleri (FCM):**
1. Firebase'de Android uygulaması ekleyin, paket adı `com.cesmekahve.app`. `google-services.json` dosyasını indirip proje köküne koyun ve git'e ekleyin (gizli değildir; her APK'nın içinde zaten bulunur).
2. Firebase → Project settings → Service accounts → "Generate new private key". Bu JSON **gizlidir**: expo.dev → proje → Credentials → Android → `com.cesmekahve.app` → **FCM V1 service account key** bölümüne yükleyin, başka hiçbir yere koymayın.

**iOS bildirimleri:** `eas build` ilk iOS derlemesinde Apple hesabınıza giriş ister; push anahtarını (APNs) ve sertifikaları sizin için oluşturur. Sorulduğunda "Set up Push Notifications" için evet deyin.

✅ `eas env:list --environment production` dört değişkeni gösteriyor.

---

## 7. İlk derleme ve test

```bash
eas build --profile preview --platform android    # telefona doğrudan kurulabilen APK
eas build --profile production --platform ios     # TestFlight için
```

Gerçek cihazda tam test listesi:
- [ ] Üye ol → e-postaya gelen 6 haneli kodla doğrula
- [ ] Şube seç, ürün ekle (süt seçenekli), sepette "ikinci kahve %50" indirimini gör
- [ ] **Kartla öde** → iyzico sandbox formu → 3D şifre → uygulamaya dönüş → sipariş "Alındı"
- [ ] Reddedilen kart (`4111 1111 1111 1129`) → "Ödeme tamamlanamadı", sipariş iptal, kullanılan hediye kahve geri geliyor
- [ ] **Kasada öde** ile sipariş
- [ ] Bildirim izni ver → personel hesabıyla siparişi "Hazır" yap → bildirim geliyor, dokununca sipariş açılıyor
- [ ] Personel telefonunda uygulama kapalıyken müşteri sipariş versin → "Yeni sipariş #…" bildirimi geliyor, dokununca Şube ekranı açılıyor
- [ ] Personel: QR okutma kamera izni, müşterinin üye QR'ı ile kasada damga ekleme, hediye kahve QR'ı ile kullanım
- [ ] Personel: bir ürünü "tükendi" yap → müşteri tarafında o şubede eklenemiyor
- [ ] Şifremi unuttum → kodla yeni şifre
- [ ] Hesabımı sil → aynı e-postayla tekrar giriş yapılamıyor
- [ ] Uçak modunda uygulamayı aç → hata mesajları anlaşılır

İlk personel hesabını README'deki "Personel ekleme" SQL'iyle ekleyin.

---

## 8. Mağazalara gönderim

Metinler, anahtar kelimeler, gizlilik formu cevapları ve inceleme notları **[store/STORE_LISTING.md](store/STORE_LISTING.md)** dosyasında hazır. Ekran görüntüleri `store/screenshots/`, Google Play öne çıkan görseli `store/feature-graphic-1024x500.png`.

**İnceleme ekibi için demo hesap oluşturun** (hem Apple hem Google ister). Uygulamadan normal üye olun (ör. `appreview@cesmekahve.com`), sonra SQL Editor'da birkaç damga ve bir hediye kahve verin:

```sql
update public.profiles set stamps = 7 where id = (select id from auth.users where email = 'appreview@cesmekahve.com');
insert into public.rewards (user_id, code, expires_at)
select id, 'REVW26', now() + interval '1 year' from auth.users where email = 'appreview@cesmekahve.com';
```

Ayrı bir personel demo hesabı açıp bir şubeye barista olarak ekleyin. İnceleme sürerken iyzico'yu **sandbox** anahtarlarıyla bırakmak ya da canlıda kasada ödeme yolunu kullandırmak mümkündür; hangisini seçtiğinizi inceleme notuna yazın.

### App Store

1. [App Store Connect](https://appstoreconnect.apple.com) → Apps → **+** → New App: platform iOS, ad "Çeşme Kahve", birincil dil Türkçe, bundle ID `com.cesmekahve.app`, SKU `cesmekahve-ios`.
2. App Information sayfasındaki **Apple ID** numarasını `eas.json` → `ascAppId` alanına yazın.
3. Gönderin:
   ```bash
   eas build --profile production --platform ios
   eas submit --profile production --platform ios
   ```
4. App Store Connect'te: ekran görüntüleri (6.9"), açıklama ve anahtar kelimeler, **App Privacy** formu, yaş derecelendirmesi, fiyat "Ücretsiz", inceleme notu ve demo hesap. Ardından "Submit for Review". İnceleme genellikle 1–3 gün sürer.

Uygulama içi satın alma gerekmez: satılan şey fiziksel ürün (kahve) olduğu için Apple, iyzico gibi harici ödemeye izin verir (Guideline 3.1.3(e)).

### Google Play

1. Play Console → Create app: ad "Çeşme Kahve", varsayılan dil Türkçe, Uygulama, Ücretsiz.
2. **İlk AAB'yi elle yükleyin** (Google'ın kuralı, API ile ilk yükleme yapılamaz):
   ```bash
   eas build --profile production --platform android
   ```
   expo.dev'den `.aab` dosyasını indirip Play Console → Testing → Internal testing → Create release'e yükleyin.
3. Sonraki sürümler için Google Cloud'da bir servis hesabı oluşturup Play Console'a "Release manager" yetkisiyle ekleyin. JSON anahtarını `eas credentials` → Android → Google Service Account (submissions) bölümüne yükleyin. Bundan sonra `eas submit --platform android` taslak bir internal sürüm oluşturur.
4. **App content** bölümündeki tüm formlar: gizlilik politikası, uygulama erişimi (demo hesap), reklam yok, içerik derecelendirmesi, hedef kitle (18+), **Data safety**, **hesap silme** adresi, finans özellikleri yok.
5. Store listing: kısa ve uzun açıklama, 512 px ikon, öne çıkan görsel, telefon ekran görüntüleri.
6. Internal testing'de denedikten sonra **Production** sürümüne terfi ettirip incelemeye gönderin. İlk inceleme birkaç gün sürebilir.

✅ İki mağazada "Ready for Sale" / "Yayında".

---

## 9. Yayından sonra

- **Kartla ödemeyi açma / canlıya geçiş:** 3. adımdaki iyzico secret'larını girin (canlıda `IYZICO_BASE_URL=https://api.iyzipay.com`), fonksiyonları yeniden yayınlayın ve SQL Editor'da `update public.app_settings set card_payments_enabled = true;` çalıştırın. Uygulamayı yeniden derlemek gerekmez.
- **Yedekler:** Pro planda günlük yedek otomatiktir. Dashboard → Database → Backups'tan kontrol edin.
- **Uygulama içi güncellemeler (yeniden indirmeden):** ekranlar, metinler, iş akışı gibi JavaScript değişiklikleri telefonlara EAS Update ile gider. `main`'e her push'ta `.github/workflows/ota-update.yml` güncellemeyi yayınlar (GitHub → Settings → Secrets → Actions → `EXPO_TOKEN`, expo.dev → Account settings → Access tokens). Telefon uygulama açılırken güncellemeyi indirir; "Yeni sürüm hazır · Yenile" şeridine dokununca ya da bir sonraki açılışta yeni sürüm çalışır. Elle yayınlamak için: `npx eas-cli@latest update --channel preview --environment preview --message "..."` (mağaza sürümleri için `--channel production`).
- **Yeni APK ne zaman gerekir:** yalnızca native taraf değiştiğinde (yeni native kütüphane, `app.json`, ikonlar, `google-services.json`). O zaman aynı commit'te `app.json` → `version`'ı artırın (ör. `1.0.0` → `1.0.1`): güncellemeler yalnızca aynı sürüm numaralı kurulumlara gider, böylece eski APK'lar çalıştıramayacakları kodu almaz. `android-test-apk.yml` bu dosyalar değişince yeni test APK'sını kendiliğinden derler.
- **Sürüm yükseltme:** `eas build --profile production --platform all` ve `eas submit`. Sürüm numarası EAS'ta otomatik artar. Görünen sürümü (`1.0.0`) `app.json` → `version` ile değiştirin.
- **Menü ve fiyat güncellemeleri** için yeni sürüm gerekmez (README → Yönetim).
- **İadeler:** iyzico panelinden iade, ardından `select public.admin_refund_order(<sipariş no>);`
- **İzleme:** Supabase → Logs (edge function hataları), iyzico panelinde günlük ödeme mutabakatı.

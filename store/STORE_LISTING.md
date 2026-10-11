# Mağaza bilgileri — kopyala, yapıştır

Uygulama yalnızca Türkçe olduğu için mağaza sayfaları da Türkçe hazırlandı. İnceleme notları İngilizce, çünkü Apple ve Google inceleme ekipleri İngilizce okur.

Köşeli parantezli `[…]` yerleri kendi bilgilerinizle doldurun.

---

## Ortak bilgiler

| Alan | Değer |
|---|---|
| Uygulama adı | Çeşme Kahve |
| Paket / Bundle ID | `com.cesmekahve.app` |
| Kategori | Yeme ve İçme (Food & Drink); ikincil: Yaşam Tarzı |
| Fiyat | Ücretsiz, uygulama içi satın alma yok, reklam yok |
| Ülke / bölge | Türkiye |
| Gizlilik politikası | `https://www.cesmekahve.com/uygulama/gizlilik.html` |
| Destek adresi | `https://www.cesmekahve.com/uygulama/destek.html` |
| Hesap silme adresi | `https://www.cesmekahve.com/uygulama/hesap-silme.html` |
| Pazarlama web sitesi | `https://www.cesmekahve.com` |
| Destek e-postası | [destek@cesmekahve.com] |
| Telif hakkı (Apple) | © 2026 [Şirket unvanı] |

---

## Metinler

**Alt başlık** (App Store, en fazla 30 karakter)
> Önden sipariş, kahve kartı

**Kısa açıklama** (Google Play, en fazla 80 karakter)
> Sırada bekleme: önden sipariş ver, şubeden al. Her kahvede damga.

**Tanıtım metni** (App Store, en fazla 170 karakter; incelemeye gerek kalmadan değiştirilebilir)
> Kahveni yoldayken sipariş et, şubeye geldiğinde hazır olsun. Ödediğin her kahve bir damga; 10 damgada bir kahve bizden.

**Anahtar kelimeler** (App Store, en fazla 100 karakter; virgülden sonra boşluk bırakmayın, uygulama adındaki kelimeleri tekrarlamayın)
```
kahveci,önden sipariş,latte,espresso,soğuk kahve,damga,sadakat,istanbul,kocaeli,alaçatı,kruvasan
```

**Açıklama** (iki mağaza için de; en fazla 4000 karakter)

```
Kahven hazır olsun, sen gel.

Çeşme Kahve uygulamasıyla siparişini önden ver, seçtiğin şubeden sırada beklemeden teslim al. Ödediğin her kahve kahve kartına damga olarak eklenir; 10 damgada bir kahve bizden.

ÖNDEN SİPARİŞ
• Şubeni seç, menüye göz at: Espresso Bar, demleme kahveler, soğuk kahveler, çaylar, ferahlatıcılar, kahvaltı ve tatlılar.
• Sütünü seç: tam yağlı, yağsız, laktozsuz, soya ya da badem.
• Siparişin hazırlanırken durumunu canlı takip et; hazır olunca bildirim gelsin.

KOLAY ÖDEME
• Kartla güvenli ödeme (iyzico, 3D Secure). Kart bilgilerin bizde saklanmaz.
• İstersen teslim alırken kasada öde.

KAHVE KARTI
• Ödediğin her kahve bir damga. 10 damgada bir kahve bizden.
• Hediye kahveni sepette tek dokunuşla kullan ya da kasada QR kodunu okut.
• Kasada aldığın kahveler için üye QR kodunu göster, damgan karta eklensin.

KÜÇÜK İYİLİKLER
• Sepetteki her iki kahveden ucuz olanı yarı fiyatına.
• Çevre dostu ambalajı seç.

İstanbul, Kocaeli, Ankara, Antalya, Alaçatı ve Didim'deki şubelerimizde seni bekliyoruz.

Sorun ya da önerin için: [destek@cesmekahve.com]
```

> Kampanya koşulları değişirse (₺10 indirim, 10 damga, şube listesi) açıklamayı da güncelleyin.

**Bu sürümdeki yenilikler** (ilk sürüm)
> Çeşme Kahve uygulaması yayında! Önden sipariş ver, şubeden al, her kahvede damga topla.

---

## Görseller

| Ne | Dosya | Gereken |
|---|---|---|
| iPhone ekran görüntüleri (6.9") | `store/screenshots/ios-6.9/01…05.png` (1320×2868) | Apple diğer iPhone boyutlarını bunlardan otomatik türetir |
| Android telefon ekran görüntüleri | `store/screenshots/android-phone/01…05.png` (1080×2160) | En az 2, en fazla 8 |
| Google Play öne çıkan görsel | `store/feature-graphic-1024x500.png` | Zorunlu |
| Google Play ikonu | `assets/brand/icon.png` dosyasını 512×512'ye küçültün | Zorunlu |

Ekran görüntüleri uygulamanın gerçek ekranlarıdır (demo hesap, örnek sipariş): ana sayfa, ürün ve süt seçimi, sepet, "siparişin hazır" ekranı, kahve kartı. Fiyatlar gerçekleriyle değişince yeniden alınmaları gerekir. Fotoğrafçı/tasarımcı ile üzerine başlık yazılmış pazarlama versiyonları da hazırlayabilirsiniz.

**iPad:** Uygulama yalnızca iPhone için (`supportsTablet: false`), iPad ekran görüntüsü gerekmez.

---

## App Store — App Privacy formu

**Do you or your third-party partners collect data from this app?** → Yes

Aşağıdaki her veri türü için: **Linked to the user: Yes**, **Used for tracking: No**.

| Kategori → Tür | Amaç (Purposes) |
|---|---|
| Contact Info → **Name** | App Functionality |
| Contact Info → **Email Address** | App Functionality, Developer's Advertising or Marketing |
| Contact Info → **Phone Number** | App Functionality, Developer's Advertising or Marketing |
| Purchases → **Purchase History** | App Functionality |
| Identifiers → **User ID** | App Functionality |
| Identifiers → **Device ID** | App Functionality (bildirimler için push token) |
| Other Data → **Other Data Types** | App Functionality (isteğe bağlı doğum tarihi) |

İşaretlenmeyecekler ve nedenleri:
- **Payment Info:** Kart bilgileri iyzico'nun güvenli ödeme sayfasında girilir; uygulama ve sunucumuz kart numarasını hiç görmez.
- **Location:** Konum istenmez; şube listeden seçilir.
- **Photos or Videos / Camera:** Kamera yalnızca personelin QR kod okutması için kullanılır, görüntü kaydedilmez veya gönderilmez.
- **Crash Data / Usage Data / Diagnostics:** Analitik veya hata raporlama SDK'sı yok.

Bu cevaplar `app.json` içindeki iOS gizlilik bildirimiyle (privacy manifest) birebir aynıdır. Uygulamaya analitik, reklam veya hata izleme eklerseniz ikisini birlikte güncelleyin.

**Pazarlama izni kullanılmayacaksa:** E-posta ve telefon için "Developer's Advertising or Marketing" amacını kaldırabilirsiniz (`app.json` → privacy manifest'ten de).

---

## App Store — diğer sorular

| Soru | Cevap |
|---|---|
| Age Rating | Anketteki tüm sorulara **None / No** → **4+**. Uygulamada kullanıcı içeriği, sohbet, kumar, web tarayıcı yok. |
| Export Compliance | Standart HTTPS dışında şifreleme yok. `ITSAppUsesNonExemptEncryption = false` ayarlı, soru sorulmaz. |
| Content Rights | "Does your app contain, show, or access third-party content?" → **No** (menü fotoğrafları markanın kendisine ait; 1. adımdaki teyide bakın). |
| Sign in with Apple | Gerekmez: uygulama yalnızca kendi e-posta/şifre hesabını kullanıyor, üçüncü taraf giriş yok. |
| In-App Purchase | Yok. Satılan ürünler uygulama dışında tüketilen fiziksel gıda ürünleridir (Guideline 3.1.3(e)). |
| Account deletion | Uygulama içinde: Profil → Hesabımı sil (Guideline 5.1.1(v)). |

---

## Google Play — App content formları

**Privacy policy:** gizlilik adresi (yukarıda).

**App access:** "All or some functionality is restricted" → demo hesap bilgilerini girin (aşağıdaki inceleme notlarıyla aynı).

**Ads:** No, my app does not contain ads.

**Content rating (IARC):** Kategori "Reference, News, or Educational" değil, **"All Other App Types"**. Şiddet, cinsellik, kumar, kullanıcı etkileşimi soruları → No. "Does the app allow users to purchase digital goods?" → No (fiziksel ürün). Beklenen sonuç: **3+ / Herkes**.

**Target audience:** **18 and over**. Üyelik koşulları 18 yaş ve üzeri içindir; bu seçim Aileler politikası kapsamına girmeyi de önler.

**News app:** No. **Government app:** No. **Financial features:** "My app doesn't provide any financial features" (ödeme almak finansal hizmet sayılmaz). **Health:** No.

**Data safety:**

| Soru | Cevap |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes |
| Do you provide a way for users to request that their data is deleted? | Yes (uygulama içinden ve hesap silme adresinden) |

Toplanan veriler (**Collected: Yes, Shared: No**. Supabase ve iyzico bizim adımıza veri işleyen hizmet sağlayıcılardır, Google'ın tanımında "paylaşım" sayılmaz):

| Kategori → Tür | Zorunlu mu? | Amaç |
|---|---|---|
| Personal info → **Name** | Required | App functionality, Account management |
| Personal info → **Email address** | Required | App functionality, Account management, Developer communications |
| Personal info → **Phone number** | Required | App functionality, Account management, Developer communications |
| Personal info → **Other info** (doğum tarihi) | Optional | App functionality |
| Financial info → **Purchase history** | Required | App functionality |
| Device or other IDs → **Device or other IDs** (push token) | Optional | App functionality |

Hiçbir veri geçici işlemeyle (ephemeral) sınırlı değildir; hepsi hesap açık olduğu sürece saklanır. Kart bilgileri iyzico tarafından toplanır ve uygulamaya ulaşmaz; "Financial info → User payment info" işaretlenmez.

**Account deletion:** "Delete account URL" → hesap silme adresi. Uygulama içinde Profil → Hesabımı sil. Silmede neler silinip neler saklanıyor: kimlik, iletişim, damga ve hediye kahve verisi silinir; sipariş ve ödeme kayıtları kişiyle bağı kesilerek vergi mevzuatı gereği 10 yıl saklanır.

---

## İnceleme notları (App Review Information / App access)

Demo hesapları LAUNCH.md 8. adıma göre oluşturun, sonra şu metni doldurup yapıştırın:

```
Çeşme Kahve is the order-ahead and loyalty app of the Çeşme Kahve coffee shop chain in Türkiye.
Customers order drinks and food for pickup at a branch, pay by card (iyzico) or at the counter,
and collect stamps (10 stamps = 1 free coffee). The app is in Turkish.

CUSTOMER DEMO ACCOUNT
  Email:    [appreview@cesmekahve.com]
  Password: [••••••••]
  Has 7 stamps and one free coffee so the loyalty card can be reviewed.

STAFF DEMO ACCOUNT (barista at the [Alaçatı] branch)
  Email:    [appreview-staff@cesmekahve.com]
  Password: [••••••••]
  Signing in shows an extra "Şube" (Branch) tab: the order queue, QR scanner and sold-out list.

HOW TO TEST AN ORDER
  1. Sign in with the customer account, pick a product, tap "Sepete ekle" (Add to cart).
  2. Open "Sepet" (Cart) → "Ödeme Yap" (Checkout) → choose the branch → confirm.
  3. Payment: choose "Şubede öde" (pay at counter), or "Kartla öde" (card).
     [Card payments currently run in the iyzico TEST environment. Use card 5528 7900 0000 0008,
      any future expiry date, any CVC.]
  4. Sign in with the staff account on a second device to move the order to "Hazır" (Ready);
     the customer receives a push notification.

PAYMENTS
  The app sells physical food and drinks that are consumed at our branches, so it uses an external
  payment processor (iyzico) and no In-App Purchase (Guideline 3.1.3(e)). Card details are entered
  on iyzico's secure page and never reach the app.

ACCOUNT DELETION
  Profil (Profile) → "Hesabımı sil" (Delete my account) → type SİL to confirm.

CAMERA
  Used only by staff to scan customer QR codes at the counter.
```

---

## Yayından önce son kontrol

- [ ] Fiyatlar ve ürün adları gerçek (seed örnek değerlerdi)
- [ ] `legal.json` şirket bilgileri dolu, avukat onayı alındı, web sayfaları yayında
- [ ] İkonlar vektör logodan yeniden üretildi
- [ ] Demo hesaplar çalışıyor ve inceleme notlarına yazıldı
- [ ] iyzico canlı/sandbox durumu inceleme notunda doğru belirtildi
- [ ] Gizlilik formları `app.json` privacy manifest ile aynı
- [ ] Destek e-postası gerçekten okunuyor

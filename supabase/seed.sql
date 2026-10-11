-- Çeşme Kahve — starting data. Menu and branches follow cesmekahve.com; prices are placeholders to edit.
-- Safe to re-run: existing rows are updated.

insert into public.branches (id, name, district, city, prep_minutes, status, sort) values
  ('pendik-marina', 'Pendik Marina', 'Pendik', 'İstanbul', 6, 'open', 0),
  ('aydinli-yolu', 'Aydınlı Yolu Pendik', 'Pendik', 'İstanbul', 5, 'open', 1),
  ('marmara-forum', 'Marmara Forum AVM', 'Bakırköy', 'İstanbul', 8, 'open', 2),
  ('beylikduzu', 'Beylikdüzü 5M Migros', 'Beylikdüzü', 'İstanbul', 7, 'open', 3),
  ('umraniye', 'İstanbul Ümraniye', 'Ümraniye', 'İstanbul', 6, 'open', 4),
  ('florya', 'Florya Flany AVM', 'Florya', 'İstanbul', 6, 'coming_soon', 5),
  ('izmit-merkez', 'İzmit Merkez', 'İzmit', 'Kocaeli', 5, 'open', 6),
  ('41-burda', '41 Burda AVM', 'İzmit', 'Kocaeli', 7, 'open', 7),
  ('yahya-kaptan', 'İzmit Yahya Kaptan Cadde', 'İzmit', 'Kocaeli', 6, 'open', 8),
  ('basiskele', 'Başiskele Sahil', 'Başiskele', 'Kocaeli', 5, 'open', 9),
  ('korfez', 'Kocaeli Körfez', 'Körfez', 'Kocaeli', 6, 'open', 10),
  ('alacati', 'Alaçatı', 'Çeşme', 'İzmir', 6, 'open', 11),
  ('vega-ankara', 'Ankara Vega Center AVM', 'Çankaya', 'Ankara', 7, 'open', 12),
  ('markantalya', 'MarkAntalya AVM', 'Muratpaşa', 'Antalya', 8, 'open', 13),
  ('didim', 'Didim', 'Didim', 'Aydın', 5, 'open', 14),
  ('vega-eskisehir', 'Eskişehir Vega AVM', 'Eskişehir', 'Eskişehir', 6, 'coming_soon', 15)
on conflict (id) do update set name = excluded.name, district = excluded.district, city = excluded.city,
  prep_minutes = excluded.prep_minutes, status = excluded.status, sort = excluded.sort;

insert into public.milk_options (id, label, extra_price, is_plant, is_default, sort) values
  ('tam', 'Tam yağlı süt', 0, false, true, 0),
  ('yagsiz', 'Yağsız süt', 0, false, false, 1),
  ('laktozsuz', 'Laktozsuz süt', 1000, false, false, 2),
  ('soya', 'Soya sütü', 1500, true, false, 3),
  ('badem', 'Badem sütü', 1500, true, false, 4)
on conflict (id) do update set label = excluded.label, extra_price = excluded.extra_price, is_plant = excluded.is_plant,
  is_default = excluded.is_default, sort = excluded.sort;

insert into public.menu_categories (id, name, blurb, is_drink, sort) values
  ('espresso', 'Espresso Bar', 'Espresso bazlı sıcak kahveler', true, 0),
  ('iced', 'Iced Espresso Bar', 'Buzlu espresso bazlı kahveler', true, 1),
  ('brew', 'Brew Bar', 'Özel demleme kahveler', true, 2),
  ('frozen', 'Frappe & Frozen', 'Buzla blend edilen soğuklar', true, 3),
  ('tea', 'Bitki Çayları', 'Demlikte, taze demlenir', true, 4),
  ('other', 'Diğer İçecekler', 'Taze sıkılmış ve şişede', true, 5),
  ('croissant', 'Kruvasan', 'Her sabah fırından', false, 6),
  ('dessert', 'Tatlı', 'Kahvenin yanına', false, 7),
  ('snack', 'Atıştırmalık', 'Hafif ve doyurucu', false, 8)
on conflict (id) do update set name = excluded.name, blurb = excluded.blurb, is_drink = excluded.is_drink, sort = excluded.sort;

insert into public.products (id, category_id, name, description, price, is_coffee, has_milk_options, image_path, badge, sort) values
  ('espresso', 'espresso', 'Espresso', 'Single ya da double servis edilir.', 9500, true, false, 'menu/espresso.webp', null, 0),
  ('macchiato', 'espresso', 'Espresso Macchiato', 'Double espresso ve bir kaşık mikro köpük.', 11000, true, false, 'menu/espresso-macchiato.webp', null, 1),
  ('americano', 'espresso', 'Americano', 'Double espresso ve sıcak su.', 12500, true, false, 'menu/americano.webp', null, 2),
  ('cortado', 'espresso', 'Cortado', 'Double espresso, iki katı mikro köpüklü süt.', 13500, true, true, 'menu/cortado.webp', null, 3),
  ('flat-white', 'espresso', 'Flat White', 'Double ristretto ve ipeksi mikro köpük.', 15000, true, true, 'menu/flat-white.webp', null, 4),
  ('cappuccino', 'espresso', 'Cappuccino', 'Double espresso ve bol köpüklü süt.', 14500, true, true, 'menu/cappuccino.webp', null, 5),
  ('latte', 'espresso', 'Caffè Latte', 'Double espresso ve mikro köpüklü süt.', 14500, true, true, 'menu/latte.webp', null, 6),
  ('mocha-ruby', 'espresso', 'Mocha, Ruby Çikolata', 'Double espresso, Belçika ruby çikolatası ve süt.', 18000, true, true, 'menu/mocha.webp', null, 7),
  ('mocha-caramel', 'espresso', 'Mocha, Karamel Çikolata', 'Double espresso, Belçika karamel çikolatası ve süt.', 17500, true, true, 'menu/mocha.webp', null, 8),
  ('affogato', 'espresso', 'Affogato', 'Kremalı dondurmanın üzerine double espresso.', 16500, true, false, 'menu/affogato.webp', null, 9),
  ('iced-americano', 'iced', 'Iced Americano', 'Double espresso ve buzlu su.', 13500, true, false, 'menu/iced-americano.webp', null, 0),
  ('iced-latte', 'iced', 'Iced Caffè Latte', 'Double espresso ve buzlu süt.', 15500, true, true, 'menu/iced-latte.webp', null, 1),
  ('iced-mocha-white', 'iced', 'Iced Mocha, Beyaz Çikolata', 'Double espresso, Belçika beyaz çikolatası ve buzlu süt.', 18000, true, true, 'menu/iced-mocha.webp', null, 2),
  ('iced-mocha-ruby', 'iced', 'Iced Mocha, Ruby Çikolata', 'Double espresso, Belçika ruby çikolatası ve buzlu süt.', 18500, true, true, 'menu/iced-mocha-ruby.webp', null, 3),
  ('turk-kahvesi', 'brew', 'Türk Kahvesi', 'Geleneksel yöntemle pişirilir.', 9500, true, false, 'menu/turk-kahvesi.webp', null, 0),
  ('cold-brew', 'brew', 'Cold Brew', 'Soğuk damlatma yöntemiyle demlenir.', 16000, true, false, 'menu/cold-brew.webp', null, 1),
  ('nitro', 'brew', 'Nitro Cold Brew', 'Azot gazıyla kadifemsi cold brew.', 18000, true, false, 'menu/nitro-cold-brew.webp', null, 2),
  ('frappe', 'frozen', 'Çikolatalı Frappe', 'Double espresso, süt ve buz.', 17500, true, true, 'menu/frappe.webp', null, 0),
  ('cilek', 'frozen', 'Çilek Frozen', 'Taze çilek ve buz.', 15000, false, false, 'menu/cilek-frozen.webp', null, 1),
  ('karadut', 'frozen', 'Karadut Frozen', 'Taze karadut ve buz.', 15500, false, false, 'menu/karadut-frozen.webp', null, 2),
  ('mango', 'frozen', 'Mango Frozen', 'Taze mango ve buz.', 15500, false, false, 'menu/mango-frozen.webp', null, 3),
  ('yasemin', 'tea', 'Yaseminli Yeşil Çay', 'Yasemin incileriyle harmanlanmış yeşil çay.', 12000, false, false, 'menu/yaseminli-yesil-cay.webp', null, 0),
  ('detoks', 'tea', 'Detoks Beyaz Çay', 'Beyaz çay, ebegümeci, yasemin çiçeği ve portakal.', 12500, false, false, 'menu/detoks-beyaz-cay.webp', null, 1),
  ('ginger-orange', 'tea', 'Ginger Orange', 'Beyaz çay, limon otu, zencefil ve kuru portakal.', 12500, false, false, 'menu/ginger-orange.webp', null, 2),
  ('earl-grey', 'tea', 'Earl Grey', 'Bergamot parçacıkları ve mavi çiçeklerle siyah çay.', 11500, false, false, 'menu/earl-grey.webp', null, 3),
  ('bergamot', 'tea', 'Bergamotlu Çay', 'Bergamot ve Karadeniz çayı.', 9500, false, false, 'menu/bergamotlu-cay.webp', null, 4),
  ('rooibos', 'tea', 'Meyveli Rooibos', 'Tropik kuru meyvelerle rooibos.', 12000, false, false, 'menu/rooibos.webp', null, 5),
  ('portakal', 'other', 'Taze Portakal Suyu', 'Taze sıkılmış portakal suyu.', 13000, false, false, 'menu/portakal-suyu.webp', null, 0),
  ('limonata', 'other', 'Naneli Limonata', 'Ev yapımı, naneli.', 11500, false, false, 'menu/naneli-limonata.webp', null, 1),
  ('karadut-suyu', 'other', 'Karadut Suyu', 'Ev yapımı karadut suyu.', 12000, false, false, 'menu/karadut-suyu.webp', null, 2),
  ('seftali-gazoz', 'other', 'Şeftali Lavanta Gazoz', 'Şişede, soğuk servis.', 8500, false, false, 'menu/seftali-lavanta-gazoz.webp', null, 3),
  ('elma-gazoz', 'other', 'Elma Erik Gazoz', 'Şişede, soğuk servis.', 8500, false, false, 'menu/elma-erik-gazoz.webp', null, 4),
  ('su', 'other', 'Su', 'Soğuk servis.', 3000, false, false, 'menu/su.webp', null, 5),
  ('kruvasan-tereyagli', 'croissant', 'Tereyağlı Kruvasan', 'Kat kat açılmış hamur, her sabah taze.', 9500, false, false, 'menu/kruvasan.webp', 'fresh', 0),
  ('kruvasan-cikolatali', 'croissant', 'Çikolatalı Kruvasan', 'Belçika çikolatası dolgulu.', 11500, false, false, 'menu/kruvasan.webp', null, 1),
  ('kruvasan-bademli', 'croissant', 'Bademli Kruvasan', 'Badem kreması ve dilimlenmiş badem.', 12500, false, false, 'menu/kruvasan.webp', null, 2),
  ('kruvasan-kasarli', 'croissant', 'Kaşarlı Kruvasan', 'Kaşar peyniriyle, sıcak servis.', 13000, false, false, 'menu/kruvasan.webp', null, 3),
  ('cheesecake', 'dessert', 'San Sebastian Cheesecake', 'Yanık üst, kremsi iç.', 18500, false, false, 'menu/tatli.webp', null, 0),
  ('tiramisu', 'dessert', 'Tiramisu', 'Espressoya batırılmış kedidili ve mascarpone.', 17000, false, false, 'menu/tatli.webp', null, 1),
  ('brownie', 'dessert', 'Brownie', 'Bol çikolatalı ve cevizli.', 12000, false, false, 'menu/tatli.webp', null, 2),
  ('avokado', 'snack', 'Avokadolu Sandviç', 'Ekşi mayalı ekmek, avokado ve roka.', 19500, false, false, 'menu/atistirmalik.webp', null, 0),
  ('hindi', 'snack', 'Hindi Füme Sandviç', 'Hindi füme ve kaşar, ekşi mayalı ekmekte.', 18500, false, false, 'menu/atistirmalik.webp', null, 1)
on conflict (id) do update set category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  price = excluded.price, is_coffee = excluded.is_coffee, has_milk_options = excluded.has_milk_options,
  image_path = excluded.image_path, badge = excluded.badge, sort = excluded.sort;

insert into public.campaigns (id, tone, eyebrow, title, body, sort) values
  ('second-coffee', 'primary', 'Sepette otomatik', 'İkinci kahve %50 indirimli', 'Sepetindeki her iki kahveden ucuz olanı yarı fiyatına.', 0),
  ('own-cup', 'eco', 'Çevre dostu', 'Kendi bardağını getir, ₺10 indirim', 'Sepette “Kendi bardağımı getireceğim”i aç.', 1),
  ('fresh', 'copper', 'Her sabah', 'Kruvasanlar fırından yeni çıktı', 'Tereyağlı, çikolatalı, bademli.', 2),
  ('loyalty', 'surface', 'Kahve kartı', '10 kahveye 1 kahve bizden', 'Ödediğin her kahve bir damga.', 3)
on conflict (id) do update set tone = excluded.tone, eyebrow = excluded.eyebrow, title = excluded.title, body = excluded.body, sort = excluded.sort;

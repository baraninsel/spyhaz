# 6 Kasım 2026 — Ayar, bağlantı ve telefon düzeltmeleri

Eski tema ve masaüstü düzeni korunur. Casus sayısı ile tur süresi kurucu tarafından elle seçilir; oyuncu katılması bu tercihleri değiştirmez.

## Bulgular ve değişiklikler

- Hazır ayar seçimi ile odadaki ayarı dosya olarak kaydetme işlemleri ayrıldı. Seçimde konum/süre/casus önizlemesi gösterilir. “Seçili ayarı uygula” yalnızca sunucu onayı ve güncel oda verisi geldikten sonra tamamlanır. Başarısızlıkta seçim ve hata ekranda kalır.
- Küçük grup ayarı 10 konum, 6 dakika, 1 casustur. Lobide etkin hazır ayarın adı ve gerçek konum sayısı gösterilir. Sonradan yapılan elle değişiklikler “Özel ayarlar” olarak görünür. Kaydetme, o anda sunucuda etkin olan ayarı kullanır.
- Ayar işlemleri sıraya alınır. Kaydetme sürerken tur başlatılmaz; tekrarlanan tıklamalar paralel komut üretmez. Oyuncu katıldığında aktif süre/casus kontrolü yeniden oluşturulmaz.
- Adı lobiye düşen yeni oyuncu henüz oyun bağlantısını tamamlamamış olabilir. Bu oyuncu için en fazla 30 saniyelik başlangıç beklemesi eklendi. Önceden bağlanıp ayrılan oyuncu bu yeni katılım beklemesini yeniden başlatmaz. Süre sonunda bağlı olmayanların kart alamayacağı açıklanır; kurucu bekleyebilir veya lobiden çıkarabilir.
- WebSocket komutunun onayı/güncel verisi gecikirse HTTP yedeği aynı işlem kimliğiyle devam eder. Yanıt kaybında ikinci tur başlatılmaz, ayar/timer işlemi ikinci kez uygulanmaz. Bekleyen işleme toplam süre sınırı konur.
- Hazır aşamasında HTTP güncellemesi 2 saniyedir; diğer aşamalarda 5 saniye korunur. Kurucu sayfayı yenilemeden yeni oyuna geçişin ekranlara yansıması doğrulanır.
- Telefonda ayarlar lobinin üstüne, gizli kart ve hazır/soru kontrolleri oyun ekranının başına taşınır. Oyuncu listesi başlangıçta katlanır; masaüstünde üç sütun korunur. Aşama değişince sayfa başına dönülür.
- Dokunma alanları, 16px form metni, konum kartları, klavye açıldığındaki pencere yüksekliği ve iPhone güvenli kenar boşlukları düzenlendi. Mobil bulanıklık/tekrar eden giriş animasyonları azaltıldı.
- Başka oyuncular hazır olduğunda gizli kart ve konum düğmeleri yeniden oluşturulmaz. Aynı sohbet ve sayaç metni gereksiz yere tekrar yazılmaz; arka planda sayaç çizimi durur.

## Doğrulama ve sınırlar

Üretim JavaScript paketi DOM ortamında çalıştırılır. 15 ayrı istemci örneğinin aynı 10 konumlu ayarı alması, hazır aşamasından sorulara geçmesi, gecikmiş onay, yanıt kaybı, başarısız kayıt ve bağlanması süren oyuncu denetlenir. Bu denemeler ekran görüntüsü veya gerçek telefon performansı ölçümü değildir.

61 istemci/motor ve 5 gerçek Worker/SQLite testi geçti. TypeScript, üretim derlemeleri ve npm audit başarılıdır.

Ana Vercel adresinde 15 HTTP oyuncusuyla gerçek küçük grup ayarının herkese 10 konum olarak gitmesi, elle 2 casus / 11 dakika seçiminin korunması, herkesin PLAYING aşamasına ulaşması, açık soru/sonuç dönüşü ve tekrar komut koruması geçti. Worker üzerinde ayrıca 15 WebSocket oyuncusu doğrulandı. Bütün deneme üyelikleri çıkarıldı.

Yayındaki uygulama kaydı `9a52082`; Worker sürümü `29486739-ee09-453f-bf0f-cf073d0f7986`, Vercel üretim yayını `7bGAAEjhivZ9UtLnzaMfk5xGzva9`. GitHub Actions ve Vercel kontrolleri bu kaynak kaydında başarılıdır.

Computer Use, Windows'ta mevcut tarayıcı adresini güvenli biçimde doğrulayamadığı için bu tur görsel testi durdurdu. Başka tarayıcı otomasyonuyla bu kısıt aşılmadı. Fiziksel Android/iPhone/iPad denemesi hâlâ gereklidir.

Ücretsiz kotalar geçerlidir. HTTP yedeğinde ekranlar arasında 2–5 saniyelik yenileme gecikmesi olabilir. İnternetin tamamen kesilmesi veya işletim sisteminin arka planı durdurması engellenemez; kimlik ve oda dönüşü korunur. Ana dala birleştirme yapılmaz; yayın inceleme dalından alınır.

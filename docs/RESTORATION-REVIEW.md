# Eski arayüz ve bağlantı incelemesi

İlk kaynak sürümü (`8ae86d6`) ile ekran yapıları karşılaştırıldı. Koyu gözetleme teması, cyan/mor renkler, piksel başlıklar, giriş dekorları, üç sütunlu lobi, oyun kartları/panelleri ve sonuç tablosu eski CSS sınıflarıyla geri getirildi. Yeni kalıcı oda sunucusu ve 3–15 kişilik kurallar korunuyor.

## Düzeltilen bulgular

| Sorun | Düzeltme |
|---|---|
| Davet bağlantısını yenilemek yeniden katılma penceresi açıyordu. | Önce o kodla eşleşen kayıtlı oyuncu geri yüklenir; başarılı girişte davet sorgusu temizlenir. |
| Bazı ağlarda WebSocket kurulamayınca giriş/oyun ilerlemiyordu. | Aynı site üzerinden HTTP girişi ve kimliği doğrulanan HTTP yedeği eklendi. WebSocket aktarımı Vercel dış yönlendirmesinde varsayılmıyor. |
| Eski Safari/iPad'de yeni tarayıcı API'leri yoktu. | UUID için güvenli WebCrypto yedeği, AbortController zaman aşımı ve eski dizi/olay dinleyici uyumluluğu eklendi. |
| İlk döngüde henüz seçilmemiş bağlantısız oyuncu kilit oluşturuyordu. | Kurucu o oyuncuyu cevap yazmadan bu döngüde atlatabilir. |
| İzleyici kurucu sonuç ekranında hata alıyordu. | Özel kart gerektirmeyen sonuç görünümü ve yalnızca sonuçta herkese açık sonuç verisi eklendi. |
| Yavaş HTTP gövdesi odanın işlem sırasını tutuyordu. | Gövde sıra dışında ve toplam 5 saniye sınırıyla okunur. |
| Eski oy yeni oylamaya uygulanabiliyordu. | Her oylama ayrı kimlikle doğrulanır. |
| Filtrelenmiş konum listesinde toplu seçim görseli/verisi ayrışıyordu. | Bütün kartlar tek seçim kümesinden güncellenir; en az 10 konum korunur. |
| Başarısız ayar kaydı başarı gibi görünüyordu. | Sunucu onayı beklenir; hatada pencere ve seçimler korunur. |
| Depolama kotasında eski oturum okunabiliyordu. | Güncel yedek kayıt öncelikle okunur. |
| Başarısız sohbet gönderiminde taslak kayboluyordu. | Taslak yalnızca başarılı onaydan sonra temizlenir. |

## Doğrulama ve sınırlar

- 48 motor/istemci testi; bunların 5'i gerçek üretim JavaScript paketini DOM ortamında çalıştırır.
- 5 gerçek workerd/SQLite entegrasyon testi: 15 oyuncu, HTTP ve WebSocket kimlikleri, yeniden başlatma, eski bağlantı, yavaş gövde ve komut tekrarları.
- TypeScript ve üretim derlemesi geçer.
- Canlı Worker'da 15 WebSocket ve 15 HTTP oyuncusuyla ayrı testler; ana Vercel adresinde de 15 oyuncuyla yalnızca HTTP kullanarak giriş, gizli kartlar, soru/tur dönüşü, sonuç ve tekrar komut denemeleri geçti. Test üyelikleri çıkarıldı.
- Bu çalışma sırasında Work yerel tarayıcı erişimi kapalı olduğu için görsel tarayıcı/gerçek telefon denemesi yapılamadı. DOM testleri ekran görünümünün veya mobil işletim sistemi davranışının kanıtı değildir.
- Sayfanın hiç açılmadığı DNS/operatör/tarayıcı hatası, arkadaşların gördüğü tam hata olmadan doğrulanmadı. Uygulama giriş hataları ile bu durum ayrı değerlendirilmelidir.
- WebSocket yerine HTTP kullanılırsa diğer oyuncuların işlemleri en fazla yaklaşık 5 saniyelik sorgulama gecikmesiyle görünür. Süre yerelde akmaya devam eder.
- Ücretsiz kotalar, yoğun kullanım ve kötüye kullanım hâlâ sınırdır. Oda oluşturma/katılma için dağıtık IP hız sınırlaması bu değişikliğin kapsamında değildir.
- 13–15 kişilik deneysel oyun dengesi ve gerçek Android/iPhone/iPad kabul denemesi sınıfta ölçülmelidir. Hatasızlık veya her ağda erişim garantisi verilmez.
- Kaynak `codex/reliable-multiplayer` dalına gönderildi; `main` birleştirmesi yapılmadı. Canlı Vercel yayını bu daldan elle alındı. Eski `main` kaynağına yeni bir üretim yayını tetiklenmeden önce incelemedeki değişiklikler birleştirilmelidir.
- 6 Kasım güncellemesinde GitHub otomatik kontrolleri yeniden doğrulandı: `9a52082` kaydında Actions ve Vercel başarılıdır. Güncel ayar/telefon çalışması ve 66 test sonucu [ayrı raporda](SETTINGS-MOBILE-2026-11-06.md) yer alır.

Canlı denemeler yalnızca rastgele kodlu test odalarında yapılır; mevcut oyunlara katılınmaz. Kaynak incelemesi: https://github.com/baraninsel/spyhaz/pull/1.

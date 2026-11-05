# Doğrulama

## Otomatik testler

npm test, istemci yardımcıları ve bağımsız oyun motorunu test eder. npm run test:integration gerçek workerd, SQLite kayıt dizini ve WebSocket bağlantıları kullanır.

Güncel kapsam 48 istemci/motor ve 5 entegrasyon testidir. İstemci akış testleri Vite'ın gerçek üretim paketini JSDOM'da çalıştırır: davetle oturum dönüşü, engellenen WebSocket için HTTP yedeği, başarısız konum kaydı, sohbet taslağı ve izleyici sonuç ekranı. JSDOM görsel tarayıcı veya fiziksel cihaz testi değildir.

Kapsam:
- Gizli konum sızıntısı ve diğer casusun kimliği.
- Tekrarlanan konum ve doğru konumun seçilebilirliği.
- 3, 8, 12 ve 15 kişilik turlar; bir ve iki casus.
- Varsayılan kapalı meslekler ve tekrar bağlanınca sabit kart.
- Hazır aşaması, kurucu devri, eski soket kapanışı, oda süresi.
- Adil soru döngüsü, ilk döngü koruması, hedef/işlem kimliği doğrulaması.
- Gizli oylar, değiştirilemeyen oy, sabit onay eşiği ve süreli sonuç.
- İki casusun tahminleri ve eksik tahminde zaman aşımı.
- Son aday seçimi ve son onay.
- Çift puan engeli, iptal ve eski komutların reddi.
- Gerçek çalışma ortamı kapatılıp açıldığında oda, kart, açık soru, oy ve sonuç kurtarma.
- Origin denetimi, hatalı mesajlar, yinelenen HTTP isteği.
- HTTP yedeğinde 15 oyuncu, eski generation reddi, WebSocket/HTTP geçişi ve kayıtlı varlığın yeniden başlatmadan kurtarılması.
- Yavaş HTTP yüklemesi sırasında oyun komutlarının beklememesi ve 5 saniyelik gövde sınırı.
- Eski oylamanın gecikmiş oyunun yeni şüpheliye uygulanmaması; seçilmemiş bağlantısız oyuncunun kurucu tarafından atlatılması.
- İsim/HTML kodlama, bozuk yerel kayıt, ayar geçişi ve geçmişte tek kayıt.

## Tarayıcı kontrolü

Geliştirme sunucusuyla masaüstü tarayıcıda öğretici, oda oluşturma, ayar kaydı, hazır aşaması, soru seçimi, soru ortasında yenileme, suçlama, sonuç ve sonuç ekranında yenileme kontrol edilir.

Yerel test için iki sahte katılımcı:
```sh
node tests/browser-fixture.mjs ABC-DEF
```
Bu yardımcı yalnızca 127.0.0.1 adresine bağlanır. Üretim odasına bağlanmaz.

## Fiziksel telefon kabul listesi

Henüz otomatik testler tarafından doğrulanmayan manuel kontrol:
- Android Chrome ve iPhone Safari.
- 15 gerçek telefonla en az üç tur.
- Ekran kilidi ve Instagram'a geçiş sonrası dönüş.
- Wi-Fi/mobil veri değişimi.
- Hazır aşamasında, soruda ve oylamada sayfa yenileme.
- Kurucu çıkışı, otomatik yönetim devri ve manuel sıra atlatma.
- Zayıf ağda yeniden katılınca ikinci oyuncu oluşmaması.
- Önceki konumun sonraki turda açık kalması.
- 13–15 kişi ve üçte iki onay düzeninin eğlence/denge değerlendirmesi.

## Yayın doğrulaması

Yerel testler Cloudflare/Vercel üretim hesabının ayarlarını doğrulamaz. Canlı kabul için önce Worker oturumu, Worker Free planı, ALLOWED_ORIGINS, Vercel proje kökü ve VITE_BACKEND_URL kontrol edilmelidir.

Rastgele ve yalnızca test üyeleri içeren canlı odalarla iki bağlantı yolu ayrıca denenebilir:

```sh
node tests/deployed-smoke.mjs https://spyhaz-game.blox-trade-radar-baran.workers.dev
node tests/deployed-http-smoke.mjs https://spyhaz.vercel.app
```

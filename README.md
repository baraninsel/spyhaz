# Spyhaz 2

Arkadaşlarla yüz yüze oynanan, herkesin kendi telefonundan katıldığı Spyfall uyarlaması. Arayüz Vercel'de, kalıcı oyun sunucusu Cloudflare Workers Free üzerinde çalışır.

## Neler değişti?

- 3–15 kişi; 13–15 kişi deneysel. Yeni oda tek casusla başlar; 7+ kişide iki casus seçilebilir.
- Meslekler kapalı başlar; kurucu sonraki tur için açabilir.
- Önceki konumu engelleme kaldırıldı. Seçili tüm konumlar her tur yeniden adaydır.
- Her soru döngüsünde herkese bir cevap; ilk döngü tamamlanınca suçlama.
- Bir şüpheliye gizli evet/hayır; üçte iki onay gerekir. Oylamalar 30 saniyede kapanır.
- Casus başına tek konum tahmini. İki casusta birinin yakalanması turu bitirir.
- Süre bitince son aday ve onay oylaması; doğrudan casus galibiyeti yok.
- Yenileme, uygulama değiştirme ve bağlantı kesilmesinde aynı oyuncu ve turla dönüş.
- Kurucu araçları: sıra atlatma, yönetimi devretme, hazır beklemesini aşma, puansız iptal.
- Hareketli örnek tur öğreticisi; sohbet, özel notlar, geçmiş ve ayar dosyaları.

## Bilgisayarda çalıştırma

Node.js 24 LTS ve npm kullanın. Komutları bu dosyanın bulunduğu proje kökünde çalıştırın:

```sh
npm ci
npm run dev
```

Tarayıcı: **http://localhost:5173**

Sunucu http://127.0.0.1:8787 adresinde çalışır. Vite /api isteklerini otomatik yönlendirir; yerelde ek ortam değişkeni gerekmez. Windows'ta uzun dosya yolları SQLite'ı etkileyebildiği için geliştirme verisi kısa, projeye özel geçici dizinde tutulur. Konumunu değiştirmek için SPYHAZ_STATE_DIR ortam değişkenini kullanabilirsiniz. Geliştirme verisini silmek, yerel test odalarını siler.

## Otomatik kontroller

```sh
npm run check
npm test
npm run test:integration
npm run build
npm audit
```

Entegrasyon testleri gerçek workerd/SQLite ve WebSocket kullanır; Cloudflare hesabı veya ücretli hizmet gerektirmez. Her test ayrı geçici kayıt dizini kullanır.

## Tamamen ücretsiz yayın

### 1. Cloudflare oyun sunucusu

Cloudflare hesabında **Workers Free** planını kullanın. Workers Paid, ücretli veritabanı, Redis veya ücretli alan adı gerekmez.

Önce kimlik doğrulama:

```sh
cd server
node ../scripts/wrangler.mjs login
node ../scripts/wrangler.mjs whoami
cd ..
```

Sonra proje kökünden:

```sh
npm run deploy:server
```

İlk yayında SQLite destekli SpyhazRoom sınıfı v1 migration ile oluşturulur. Komutun verdiği https://spyhaz-game.<hesap>.workers.dev adresini kaydedin. Yeni sürümlerde sınıf veya binding adını değiştirmeyin; mevcut odalar bu kimliklerle saklanır.

server/wrangler.jsonc içindeki ALLOWED_ORIGINS listesine arayüzün gerçek adresini yazın. Varsayılan https://spyhaz.vercel.app adresi hazırdır. Vercel önizlemesi ayrı bir adres kullanıyorsa onu da açıkça ekleyip sunucuyu yeniden yayınlayın; joker alan adı kullanılmaz.

### 2. Mevcut Vercel projesi

Mevcut projeyi ve spyhaz.vercel.app adresini koruyun:

- Root Directory: depo kökü; client seçiliyse temizleyin.
- Install Command: npm ci
- Build Command: npm run build -w client
- Output Directory: client/dist
- Node.js: 24
- Environment Variable: VITE_BACKEND_URL = Cloudflare Worker'ın HTTPS adresi.
- Bu değişkeni Production ve kullanılacak Preview ortamlarına ekleyin; sonra yeniden derleyin.

Kök vercel.json, çıktı dizinini ve güvenlik başlıklarını içerir. Bu değişken bir erişim anahtarı değildir; oyun sunucusunun genel adresidir.

### 3. Geçiş kontrolü

1. Önce yeni Worker ve Vercel önizlemesinde bir test odası açın.
2. En az üç cihazla oynayın; yenileme ve uygulamadan dönmeyi deneyin.
3. Kontroller geçince, devam eden eski oyun olmadığı sırada Vercel üretim yayınına geçin.
4. Eski Render sunucusunu ancak yeni sürüm doğrulandıktan sonra kapatın.

Eski Render odaları bellekte tutulduğu için taşınamaz. Eski oturum yeni sunucuda farklı oyuncu olarak taklit edilmez; ilk geçişte yeni oda açılır. Eski kişisel notlar, geçmiş ve geçerli ayar dosyaları korunur. Eski çoklu tahmin ayarı bilinçli olarak yok sayılır.

## Bağlantı davranışı

- İnternet gidince süre devam eder. Dönüşte güncel ekran sunucudan yüklenir.
- Tek oyuncu kimliği aynı odada bir etkin sekmeye aittir. İkinci sekme açılırsa ilk sekmeye bilgi verilir; sekmeler otomatik olarak birbirini ele geçirmeye çalışmaz.
- Bağlantısız kurucu için 30 saniye sonra yönetim en eski bağlı oyuncuya geçer.
- Tüm oyuncular ayrılırsa oda 24 saat saklanır. Yeniden bağlanıldığında bu süre iptal edilir.
- Arka planda telefonun bağlantıyı açık tutacağı garanti edilmez; odanın ve kimliğin korunması hedeflenir.
- Depolamanın engellendiği gizli tarayıcılarda açık sayfa çalışır, fakat tarayıcı tamamen kapanırsa otomatik dönüş mümkün olmayabilir.

## Gerçek telefonlarla kabul denemesi

Aynı Wi-Fi üzerinden yerel test yapacaksanız Vite'ın gösterdiği ağ adresini açın. Bu adresin origin değerini server/.dev.vars dosyasında ALLOWED_ORIGINS listesine ekleyin. Üretimde HTTPS Vercel adresini kullanın.

Android Chrome ve iPhone Safari ile: ekran kilitleme, Instagram'a geçip dönme, Wi-Fi/mobil veri geçişi, yenileme, iki sekme ve kurucu kopması denenmelidir. Sınıf denemesinde 13–15 kişide tur süresi ve kazanan taraf dağılımı değerlendirilmelidir. Otomatik testler bu fiziksel cihaz denemesinin yerine geçmez.

Ayrıntılar: [protokol](docs/PROTOCOL.md), [kurallar ve denge](docs/RULES.md), [doğrulama](docs/TESTING.md).

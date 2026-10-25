# Uygulama doğrulaması — 25 Ekim 2026

Yerel kaynak dalı: codex/reliable-multiplayer
Kaynak başlangıcı: baraninsel/spyhaz @ 8ae86d620553021a2ca0438f02d50a61e3bd2884

## Geçen kontroller

- 37 oyun motoru / istemci yardımcı testi.
- 3 gerçek workerd / WebSocket / kalıcı SQLite entegrasyon testi.
- TypeScript denetimi.
- Vite üretim derlemesi.
- Cloudflare Worker dry-run derlemesi.
- npm audit: bilinen güvenlik açığı yok.

Entegrasyonda 15 oyuncu bağlandı; çalışma ortamı kapatılıp yeniden açılarak aynı tur, aynı oyuncu kimliği ve gizli kart doğrulandı. Rol gösterimi, seçilmiş soru hedefi, verilmiş oy ve sonuç ekranına dönüş kontrol edildi.

Masaüstü tarayıcıda: yeni öğretici, oda oluşturma, önerilen süreyi uygulama, üç oyuncuyla hazır aşaması, soru seçme, soru devam ederken sayfa yenileme, suçlama, puanlama ve sonuç ekranında yenileme gözlemlendi.

## Canlı yayın doğrulaması

- Arayüz: https://spyhaz.vercel.app/
- Oyun sunucusu: https://spyhaz-game.blox-trade-radar-baran.workers.dev
- Vercel önizlemesi: https://spyhaz-fhe8vpy9n-baraninsel0-4282s-projects.vercel.app
- Cloudflare Workers Free ve Vercel Hobby planları hesaplarda doğrulandı; ücretli plana geçilmedi.
- Cloudflare sürümü: 7112ca84-a74f-4bca-9863-635e4e187238. Kalıcı SQLite oda sınıfı v1 migration ile oluşturuldu.
- Vercel kök dizini depo köküne, derleme komutu npm run build -w client, çıktı client/dist olarak ayarlandı. VITE_BACKEND_URL Production ve Preview ortamlarında yeni Worker'a bağlandı.
- Canlı Worker üzerinde 15 yapay oyuncu / 2 casus ile HTTP/CORS, eşzamanlı WebSocket, gizli kartlar, hazır aşaması, açık soruya dönüş ve sonuç ekranına dönüş geçti. Deneme üyelikleri çıkarıldı.
- Masaüstü tarayıcıda internetteki Vercel önizlemesinden oda oluşturuldu; yenileme sonrası aynı isim, kurucu ve oda kodu korundu.
- Canlı üretim adresi giriş gerektirmeden HTTP 200 döndürüyor; güncel çevrim içi oyun arayüzü tarayıcıda doğrulandı.

Dağıtılmış sunucu denemesi açıkça şu komutla tekrarlanabilir (rastgele ve yalnızca test oyuncularını içeren bir oda oluşturur):

```sh
node tests/deployed-smoke.mjs https://spyhaz-game.blox-trade-radar-baran.workers.dev
```

## Kalan kabul denemesi

Gerçek Android/iPhone/iPad ve 15 fiziksel cihazla sınıf kabul denemesi henüz yapılmadı. Yapay WebSocket istemcileri gerçek mobil işletim sisteminin arka plan davranışını doğrulamaz. Farklı internetlerde ekran kilidi, uygulama değiştirme, Wi-Fi/mobil veri geçişi ve çok turlu oyun kontrol edilmelidir.

Eski bellek tabanlı odalar yeni sunucuya taşınmaz; güncellenen sürümde yeni oda açılır. Yayın komutları ve proje ayarları README.md içindedir.

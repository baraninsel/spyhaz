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

## Henüz tamamlanmayan dış adımlar

- GitHub hesabında bu dalı gönderme yetkisi mevcut değil; uzak depoya kaynak gönderilmedi.
- Cloudflare CLI oturumu süresi dolmuş; Worker canlıya yayınlanmadı.
- Vercel üretim ayarları ve yeni ortam değişkeni uygulanmadı.
- Gerçek Android/iPhone ve 15 fiziksel cihazla sınıf kabul denemesi yapılmadı.

Yerel testler bu adımların tamamlandığı anlamına gelmez. Yayın komutları ve proje ayarları README.md içindedir.

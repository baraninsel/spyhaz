# Protokol v2

## HTTP

POST /api/rooms: {code, name, playerId, token, settings}

POST /api/rooms/:code/players: {name, playerId, token}

Kimlik tarayıcıda CSPRNG ile oluşturulur: UUID oyuncu kimliği ve 32 rastgele bayttan base64url token. Sunucu yalnızca SHA-256 token özetini saklar. Kod 6 karakterdir; biçimi ABC-DEF. Kimlikler URL'ye veya loglara yazılmaz.

Aynı kimlik ve token ile yinelenen oluşturma/katılma isteği yeni oyuncu oluşturmaz. İstemci başarısız istek taslağını sessionStorage'da tutar; zaman aşımından sonra aynı düğme güvenle tekrar kullanılabilir.

GET /api/rooms/:code/socket WebSocket'e yükseltilir. İlk mesaj:

```json
{"v":2,"type":"session:resume","playerId":"uuid","token":"base64url-secret"}
```

Kimlik doğrulanmadan oda verisi gönderilmez. Hatalı kimlik kesin oturum hatasıdır; geçici sunucu/ağ hatası oturum kaydını silmez.

## Komutlar

```json
{"v":2,"id":"unique-command-id","type":"question:select","contextId":"round-or-lobby-id","turnId":"question-id","payload":{"targetId":"player-uuid"}}
```

Komut yanıtı: {type:"ack",id,ok,revision?,error?}.

Bağlam kimliği her tur ve lobi geçişinde değişir. Soru işlemleri ve kurucu sıra atlatma komutu turnId ile korunur. Son 512 başarılı komutun yanıtı oyuncu/işlem kimliğiyle saklanır; eski bağlamdaki yeni işlemler reddedilir. Puanlar tur başına tek kez hesaplanır.

Oda, skorlar, komut makbuzu ve sonraki alarm aynı depolama işleminde kaydedilir; sonra yanıt ve kişiye özel snapshot gönderilir. Başarısız kayıt bellekte tamamlanmış bir işlem olarak sunulmaz.

Komutlar:
- room:settings, room:leave, chat:send, session:sync
- game:start, game:ready, game:lobby
- question:select, question:done
- vote:accuse, vote:cast
- spy:guess, timer:toggle
- host:skip, host:forceReady, host:transfer, host:kick, host:abort

## Aşamalar

LOBBY → ROLE_REVEAL → PLAYING

PLAYING → ACCUSATION → PLAYING veya RESULT

PLAYING → SPY_GUESS → RESULT

PLAYING → FINAL_NOMINATION → FINAL_ACCUSATION → RESULT

RESULT → LOBBY

Kurucu aktif turu RESULT/CANCELLED ile puansız kapatabilir. Sıra atlatma sahte cevap üretmez. Tur başladığında bağlı olmayan lobi üyeleri o turun gizli kartını alamaz; izleyici olarak dönüp sonraki tura katılabilir.

## Snapshot ve gizlilik

Snapshot; bağlantıdan bağımsız oyuncu kimliğini, güncel ekranı, oyuncu listesini, ayarları, skorları, açık soruyu, hazır bilgisini, kalan süreyi ve yalnızca alıcının gizli kartını içerir.

Casus için canlı konum null'dır. Diğer casusların kimliği ve tahminleri gizlidir. Meslekler açıkken normal oyuncu yalnızca kendi mesleğini alır. Oylama sırasında yalnızca kimlerin oy verdiği ve alıcının kendi oyu gönderilir. Koşan evet sayısı ve başkalarının oyları gönderilmez.

SPY_GUESS aşamasında casuslar kimliklerini açıklar; tahmin doğruluğu ikisi tamamlayana veya süre dolana kadar açıklanmaz. RESULT bütün kartları ve puanları gösterir.

## Süre ve bağlantı

Sunucu kalıcı bitiş zamanlarını ve tek sonraki alarmı saklar; saniyelik sunucu döngüsü yoktur. İstemci serverNow ile saat farkını hesaplayıp ekran sayacını yerelde çizer. Hibernation API ping/pong cevaplarını oda kodunu çalıştırmadan verebilir.

İstemci görünürken 25 saniyede ping gönderir; yanıt alamazsa yeniden bağlanır. Sunucu 75 saniye etkinlik alamadığı bağlantıyı kopmuş kabul eder. Kopuş doğrulandıktan sonra kurucu için 30 saniyelik yönetim devri süresi başlar.

Her başarılı bağlantı yeni generation üretir. Eski generation'ın kapanması veya komutları yeni oturumu etkileyemez. İkinci etkin sekme ilkine SESSION_REPLACED bildirir; otomatik sekme savaşı oluşmaz.

8 KiB HTTP/mesaj sınırı, oda başına 15 üye/45 soket sınırı ve soket başına 5 saniyede 30 mesaj sınırı uygulanır. Yetkiler her komutta sunucuda doğrulanır.

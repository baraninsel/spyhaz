import { showModal } from './modal.js';
const steps = [
  { title: 'Herkes aynı yerde. Bir kişi bilmiyor.', text: 'Örneğin konum Hastane. Normal oyuncular Hastane yazısını görür; casus yalnızca casus olduğunu bilir. Kartını arkadaşlarına gösterme.', scene: 'cards' },
  { title: 'Konumu söylemeden soru sor.', text: 'Ali: “Burada insanlar neden bekliyor?” Ayşe: “Sıraları gelmediği için.” Cevap konumu bilenlere anlamlı, casusa ise biraz belirsiz olmalı.', scene: 'conversation' },
  { title: 'Cevap veren, sonraki soruyu sorar.', text: 'Ayşe şimdi başka birine sorar. Aynı soru döngüsünde herkes bir kez cevap verir. İlk döngü tamamlandığında suçlama açılır.', scene: 'chain' },
  { title: 'Bir şüpheli seç. Birlikte karar verin.', text: '“Can casus mu?” Şüpheli dışındaki herkes gizlice evet/hayır der. Ekranda gereken evet sayısı yazar. Üçte iki onay gelirse kimlik açılır; gelmezse oyun sürer. Yanlış kişi suçlanırsa casus kazanır.', scene: 'vote' },
  { title: 'Casusun da kazanma yolu var.', text: 'Casus konumu çözünce kimliğini açıklayıp tek tahmin yapar. Doğruysa kazanır, yanlışsa diğer oyuncular kazanır. İki casus seçilmişse birbirlerini tanımazlar; birini yakalamak turu bitirir.', scene: 'guess' },
  { title: 'Süre dolunca son bir şans.', text: 'Önce herkes son şüphelisini seçer; tek başına en çok aday oyunu alan kişi için son onay oylaması açılır. Yeterli onay yoksa veya adaylık berabereyse casus kazanır. Sonra aynı odada yeni tur oynayabilirsiniz.', scene: 'finish' },
];
function scene(type) {
  if (type === 'cards') return '<div class="demo-cards"><div class="demo-card">🏥<strong>Hastane</strong><small>Ali ve Ayşe</small></div><div class="demo-card demo-secret">🕵️<strong>Casus</strong><small>Can konumu bilmiyor</small></div></div>';
  if (type === 'conversation') return '<div class="demo-bubble">Ali: Burada insanlar neden bekliyor?</div><div class="demo-bubble answer">Ayşe: Sıraları gelmediği için.</div>';
  if (type === 'chain') return '<div class="demo-chain"><span>Ali</span><b>→</b><span>Ayşe</span><b>→</b><span>Can</span><b>→</b><span>Ali</span></div><p>Herkese bir cevap hakkı.</p>';
  if (type === 'vote') return '<div class="demo-ballot"><strong>Can casus mu?</strong><span>Ali ✓ &nbsp; Ayşe ✓</span><b>3 kişilik oyunda 2 evet gerekiyor</b></div>';
  if (type === 'guess') return '<div class="demo-map"><span>🏫 Okul</span><span class="correct">🏥 Hastane?</span><span>🏦 Banka</span></div><p>Tek tahmin. Büyük risk, büyük ödül.</p>';
  return '<div class="demo-finish">⏳ → 🗳️ → 🏆</div><p>Aynı oda. Yeni konum. Yeni casus.</p>';
}
export function showTutorial() {
  let index = 0, autoplay = null;
  const stop = () => { if (autoplay) clearInterval(autoplay); autoplay = null; };
  showModal('NASIL OYNANIR?', '<div id="tutorial-stage" aria-live="polite"></div><div class="tutorial-controls"><button class="btn btn-ghost" id="tut-prev">← Geri</button><span id="tut-page"></span><button class="btn btn-primary" id="tut-next">İleri →</button></div><button class="btn btn-ghost btn-block" id="tut-play">▶ Örnek turu oynat</button><p class="v2-muted">Meslekler isteğe bağlıdır. İyi soru: konumu bilen anlar, casus hemen çözemez.</p>', {
    onClose: stop,
    onMount(overlay) {
      const paint = () => {
        overlay.querySelector('#tutorial-stage').innerHTML = '<div class="tutorial-scene">' + scene(steps[index].scene) + '</div><h3>' + steps[index].title + '</h3><p class="tutorial-copy">' + steps[index].text + '</p>';
        overlay.querySelector('#tut-page').textContent = (index + 1) + ' / ' + steps.length;
        overlay.querySelector('#tut-prev').disabled = index === 0;
        overlay.querySelector('#tut-next').disabled = index === steps.length - 1;
      };
      overlay.querySelector('#tut-prev').onclick = () => { stop(); overlay.querySelector('#tut-play').textContent = '▶ Örnek turu oynat'; index--; paint(); };
      overlay.querySelector('#tut-next').onclick = () => { stop(); overlay.querySelector('#tut-play').textContent = '▶ Örnek turu oynat'; index++; paint(); };
      overlay.querySelector('#tut-play').onclick = () => {
        if (autoplay) { stop(); overlay.querySelector('#tut-play').textContent = '▶ Örnek turu oynat'; return; }
        index = 0; paint();
        overlay.querySelector('#tut-play').textContent = '⏸ Oynatmayı durdur';
        autoplay = setInterval(() => {
          if (!overlay.isConnected || index === steps.length - 1) { stop(); overlay.querySelector('#tut-play').textContent = '▶ Yeniden oynat'; return; }
          index++; paint();
        }, 6500);
      };
      paint();
    },
  });
}

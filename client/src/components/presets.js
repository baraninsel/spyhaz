import { getPresets, loadPreset, savePreset, importPresetFromText, exportPresetText } from '../utils/presetManager.js';
import { escapeHtml as e } from '../utils/dom.js';
import { showModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

export function openPresets({ getSettings, applySettings }) {
  const options = () => '<option value="">Bir hazır ayar seç…</option>' + getPresets().map(p => '<option value="' + e(p.id) + '">' + e(p.name) + '</option>').join('');
  showModal('HAZIR AYARLAR', `
    <form id="preset-apply-form" class="preset-form">
      <label class="input-label" for="preset-list">Odaya yüklenecek ayar</label>
      <select class="input" id="preset-list" required>${options()}</select>
      <div id="preset-preview" class="preset-preview" aria-live="polite">Bir ayar seç; konum ve süreyi kontrol edip uygula.</div>
      <button class="btn btn-primary btn-block" id="preset-apply" type="submit" disabled>SEÇİLİ AYARI UYGULA</button>
    </form>
    <p id="preset-error" class="form-error" role="alert"></p>
    <details class="preset-save-section"><summary>Odadaki ayarı yeni adla kaydet</summary>
      <form id="preset-save-form" class="preset-form">
        <label class="input-label" for="preset-name">Yeni ayarın adı</label>
        <input class="input" id="preset-name" maxlength="20" required placeholder="Örn. Sınıf oyunu">
        <button class="btn btn-ghost btn-block" id="preset-save" type="submit">ODADAKİ AYARI KAYDET</button>
      </form>
      <p class="recovery-hint">Bu bölüm şu anda odada etkin olan ayarı bu tarayıcıya kaydeder.</p>
    </details>
    <details class="preset-save-section"><summary>Ayarı dışa / içe aktar</summary>
      <form id="preset-import-form" class="preset-form"><label class="input-label" for="preset-text">Ayar metni</label>
        <textarea class="input" id="preset-text" rows="4">${e(exportPresetText(getSettings()))}</textarea>
        <button class="btn btn-ghost btn-block" id="preset-import" type="submit">METİNDEKİ AYARI UYGULA</button>
      </form>
    </details>`, { onMount(overlay) {
      const select = overlay.querySelector('#preset-list'), error = overlay.querySelector('#preset-error');
      let busy = false;
      function preview() {
        const p = loadPreset(select.value);
        overlay.querySelector('#preset-apply').disabled = busy || !p;
        overlay.querySelector('#preset-preview').textContent = p ? p.enabledLocationIds.length + ' konum · ' + p.duration / 60 + ' dakika · ' + p.spyCount + ' casus · Meslekler ' + (p.professions ? 'açık' : 'kapalı') : 'Bir ayar seç; konum ve süreyi kontrol edip uygula.';
      }
      async function apply(settings) {
        if (busy) return;
        busy = true; error.textContent = '';
        overlay.querySelectorAll('button,input,select,textarea').forEach(input => { input.disabled = true; });
        try {
          await applySettings(settings);
          if (overlay.isConnected) closeModal();
          showToast(settings.enabledLocationIds.length + ' konum · ' + settings.duration / 60 + ' dakika · ' + settings.spyCount + ' casus uygulandı.', 'success');
        } catch (err) { error.textContent = err.message || 'Ayar uygulanamadı. Tekrar dene.'; }
        finally { busy = false; overlay.querySelectorAll('button,input,select,textarea').forEach(input => { input.disabled = false; }); preview(); }
      }
      select.onchange = preview;
      overlay.querySelector('#preset-apply-form').onsubmit = event => {
        event.preventDefault(); const selected = loadPreset(select.value);
        if (selected) void apply(selected);
      };
      overlay.querySelector('#preset-save-form').onsubmit = event => {
        event.preventDefault();
        if (busy || !event.currentTarget.reportValidity()) return;
        try {
          const preset = savePreset(overlay.querySelector('#preset-name').value, getSettings());
          select.innerHTML = options(); select.value = preset.id; preview();
          error.textContent = ''; showToast('Odadaki ayar bu tarayıcıya kaydedildi.', 'success');
        } catch (err) { error.textContent = err.message; }
      };
      overlay.querySelector('#preset-import-form').onsubmit = event => {
        event.preventDefault(); const value = importPresetFromText(overlay.querySelector('#preset-text').value);
        if (value.error) error.textContent = value.error; else void apply(value);
      };
    } });
}

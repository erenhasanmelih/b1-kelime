/* B1 Kelime Kartları — tek dosyalık uygulama mantığı.
   Veri: words.json → [kelime, tür, emoji, Türkçe, örnek cümle]; sıra numarası = dizideki yer + 1.
   İlerleme telefonda (localStorage) tutulur; "İlerleme" sekmesinden kodla yedeklenir/taşınır. */
(() => {
'use strict';
const VERSION = '2.0.0';
const REPO = 'erenhasanmelih/b1-kelime';
const APK_URL = `https://github.com/${REPO}/releases/latest/download/B1-Kelime.apk`;
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const nativeTTS = isNative && window.capacitorExports ? window.capacitorExports.registerPlugin('TextToSpeech') : null;
let update = null; // {version}
const KEY = 'b1-kelime-v2';
let W = [];

// ---------- kalıcı durum ----------
const S = { s: {}, t: {}, goal: 35, batches: [], mine: [], rate: 'normal', dir: 'en' };
// ---------- ekran durumu ----------
const U = { tab: 'today', bi: null, idx: 0, shown: false, revTab: 1, study: null, studyIdx: 0, q: '', filter: 'all', limit: 60 };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = () => $('#main');

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j && typeof j === 'object') Object.assign(S, j);
  } catch (e) {}
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Kaydedilemedi: tarayıcı depolaması kapalı'); } }

function toast(msg, ms = 1800) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- tarih / günlük paket ----------
const pad = n => String(n).padStart(2, '0');
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDate(s) {
  if (!s) return 'Önceki çalışma';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}
function nextStart() { const b = S.batches[S.batches.length - 1]; return b ? b.a + b.n : 0; }
// Günü kaçırırsan kelime kaybolmaz: her yeni günün paketi, en son paketin bittiği yerden başlar.
function ensureToday() {
  const d = todayStr(), last = S.batches[S.batches.length - 1];
  if (last && last.d === d) return;
  const a = nextStart();
  if (a >= W.length) return;
  S.batches.push({ d, a, n: Math.min(S.goal, W.length - a) });
  save();
}
const batchIds = b => b ? Array.from({ length: b.n }, (_, k) => b.a + k) : [];

// ---------- kelimeler ----------
const POS = { n: 'isim', v: 'fiil', adj: 'sıfat', adv: 'zarf', prep: 'edat', pron: 'zamir', conj: 'bağlaç', det: 'belirteç', exclam: 'ünlem',
  mv: 'yardımcı fiil (modal)', av: 'yardımcı fiil', 'phr v': 'öbek fiil', 'prep phr': 'edat öbeği', 'n pl': 'isim (çoğul)', phr: 'kalıp' };
function posTr(p) {
  if (!p) return '';
  const parts = p.split(/\s*(?:,|&)\s*/).filter(Boolean);
  const out = parts.map(x => POS[x.trim()] || x.trim());
  return out.join(' · ');
}
const isMine = id => typeof id === 'string';
function item(id) {
  if (isMine(id)) {
    const m = S.mine.find(x => x.id === id); if (!m) return null;
    return { id, en: m.en, pos: m.pos || '', emo: m.emoji || '', tr: m.tr || '', ex: m.ex || '', st: m.status || 0, no: 'Kendi kelimem' };
  }
  const w = W[id]; if (!w) return null;
  return { id, en: w[0], pos: w[1], emo: w[2], tr: w[3], ex: w[4], st: S.s[id] || 0, no: '#' + (id + 1) };
}
function setStatus(id, v) {
  if (isMine(id)) { const m = S.mine.find(x => x.id === id); if (m) { m.status = v; m.t = Date.now(); } }
  else { if (v) { S.s[id] = v; S.t[id] = Date.now(); } else { delete S.s[id]; delete S.t[id]; } }
  save();
}
function idsWithStatus(v) {
  const a = Object.keys(S.s).filter(k => S.s[k] === v).map(Number);
  const m = S.mine.filter(x => (x.status || 0) === v).map(x => x.id);
  const t = id => isMine(id) ? (S.mine.find(x => x.id === id)?.t || 0) : (S.t[id] || 0);
  return [...m, ...a].sort((x, y) => t(y) - t(x));
}

// ---------- telaffuz (sadece dokununca) ----------
let voice = null;
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => /en[-_]GB/i.test(v.lang) && /google/i.test(v.name)) || vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
  } catch (e) {}
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
const forSpeech = w => w.replace(/\s*\([^)]*\)/g, '').replace(/\//g, ', ').trim();
async function speakNative(text, btn) {
  document.querySelectorAll('.say.on').forEach(b => b.classList.remove('on'));
  const slow = S.rate === 'slow';
  const rate = text.includes(' ') ? (slow ? 0.7 : 0.95) : (slow ? 0.6 : 0.85);
  try { await nativeTTS.stop(); } catch (e) {}
  if (btn) btn.classList.add('on');
  try { await nativeTTS.speak({ text, lang: 'en-GB', rate, pitch: 1.0, volume: 1.0, category: 'playback' }); }
  catch (e) { toast('Ses çalınamadı. Telefonda Google metin okuma ve İngilizce ses paketi kurulu olmalı.', 3500); }
  if (btn) btn.classList.remove('on');
}
function speak(text, btn) {
  if (nativeTTS) { speakNative(text, btn); return; }
  if (!('speechSynthesis' in window)) { toast('Bu cihazda sesli okuma yok'); return; }
  try {
    speechSynthesis.cancel();
    document.querySelectorAll('.say.on').forEach(b => b.classList.remove('on'));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'en-GB'; if (voice) u.voice = voice;
    const slow = S.rate === 'slow';
    u.rate = text.includes(' ') ? (slow ? 0.7 : 0.92) : (slow ? 0.6 : 0.85);
    if (btn) { btn.classList.add('on'); u.onend = u.onerror = () => btn.classList.remove('on'); }
    speechSynthesis.speak(u);
  } catch (e) { toast('Ses çalınamadı'); }
}

// ---------- ortak kart ----------
const imgUrl = w => 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(forSpeech(w).split(',')[0]);
function cardHTML(it, meta) {
  const en = S.dir === 'en';
  const sayWord = `<button class="say" data-say="${esc(forSpeech(it.en))}" aria-label="${esc(it.en)} telaffuzunu dinle">🔊</button>`;
  const front = en
    ? `<div class="wrow"><h2 class="word">${esc(it.en)}</h2>${sayWord}</div><div class="pos">${esc(posTr(it.pos))}</div>`
    : `<div class="wrow"><h2 class="word tr">${esc(it.tr)}</h2></div><div class="pos">${esc(posTr(it.pos))}</div>`;
  const back = en
    ? `<div class="mean">${esc(it.tr)}</div>`
    : `<div class="wrow"><span class="word">${esc(it.en)}</span>${sayWord}</div>`;
  const ex = it.ex ? `<div class="ex"><span>“${esc(it.ex)}”</span><button class="say sm" data-say="${esc(it.ex)}" aria-label="Örnek cümleyi dinle">🔊</button></div>` : '';
  return `<article class="card in" id="card">
    <div class="meta"><span>${meta}</span><span>${esc(it.no)}</span></div>
    <div class="emo${it.emo ? '' : ' none'}" aria-hidden="true">${it.emo ? esc(it.emo) : 'Aa'}</div>
    ${front}
    ${U.shown ? `<div class="answer">${back}${ex}<a href="${imgUrl(it.en)}" target="_blank" rel="noopener">🔍 Gerçek fotoğraflara bak</a></div>`
              : `<button class="reveal" id="reveal">Anlamı göster</button>`}
  </article>
  <div class="acts">
    <button class="btn l1" data-set="1" aria-pressed="${it.st === 1}">🤔 Öğreniyorum</button>
    <button class="btn l2" data-set="2" aria-pressed="${it.st === 2}">✅ Öğrendim</button>
  </div>`;
}
const dirSeg = () => `<div class="seg" role="group" aria-label="Yön"><button data-dir="en" aria-pressed="${S.dir === 'en'}">İngilizce → Türkçe</button><button data-dir="tr" aria-pressed="${S.dir === 'tr'}">Türkçe → İngilizce</button></div>`;

// ---------- Bugün ----------
function renderToday() {
  ensureToday();
  const B = S.batches; const today = todayStr();
  if (!B.length) { bar('Bugün', ''); main().innerHTML = `<div class="empty"><b>Liste bitti 🎉</b>3.113 kelimenin hepsini gördün.</div>`; return; }
  if (U.bi === null || U.bi >= B.length) U.bi = B.length - 1;
  const b = B[U.bi], ids = batchIds(b);
  if (U.idx >= ids.length) U.idx = 0;
  const learned = ids.filter(i => S.s[i] === 2).length, learning = ids.filter(i => S.s[i] === 1).length;
  const isToday = b.d === today;
  bar(isToday ? 'Bugün' : 'Gün ' + (U.bi + 1), `Gün ${U.bi + 1} · ${fmtDate(b.d)}`,
    `<button class="iconbtn" id="prevDay" aria-label="Önceki gün" ${U.bi <= 0 ? 'disabled' : ''}>‹</button><button class="iconbtn" id="nextDay" aria-label="Sonraki gün" ${U.bi >= B.length - 1 ? 'disabled' : ''}>›</button>`);
  let h = `<div class="prog" role="img" aria-label="${learned} öğrenildi, ${learning} öğreniliyor, toplam ${ids.length}"><i class="l2" style="width:${learned / ids.length * 100}%"></i><i class="l1" style="width:${learning / ids.length * 100}%"></i></div>`;
  h += dirSeg();
  h += cardHTML(item(ids[U.idx]), `Kart ${U.idx + 1}/${ids.length} · ✅ ${learned}`);
  h += `<div class="navrow"><button class="btn tonal" id="prev">‹ Önceki</button>${!isToday ? `<button class="btn tonal" id="toToday">Bugüne dön</button>` : `<span class="count">${ids.length - learned} kaldı</span>`}<button class="btn primary" id="next">Sonraki ›</button></div>`;
  main().innerHTML = h;
}

// ---------- Tekrar ----------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function renderReview() {
  if (U.study) return renderStudy();
  const l1 = idsWithStatus(1), l2 = idsWithStatus(2);
  const list = U.revTab === 1 ? l1 : l2;
  bar('Tekrar', 'Bir liste seç, kartlarla çalış');
  let h = `<div class="seg" role="group" aria-label="Tekrar listesi"><button data-rev="1" aria-pressed="${U.revTab === 1}">🤔 Öğreniyorum<em>${l1.length}</em></button><button data-rev="2" aria-pressed="${U.revTab === 2}">✅ Öğrendim<em>${l2.length}</em></button></div>`;
  if (!list.length) {
    h += U.revTab === 1
      ? `<div class="empty"><b>Öğrenilecek kelime yok</b>Bir kartta “Öğreniyorum” dediğinde burada görünür.</div>`
      : `<div class="empty"><b>Henüz öğrendiğin kelime yok</b>Bir kartta “Öğrendim” dediğinde burada görünür.</div>`;
    main().innerHTML = h; return;
  }
  h += `<button class="btn primary" id="startStudy">Bu ${list.length} kelimeyle kart çalış</button>`;
  h += `<div class="rows">${list.slice(0, U.limit).map(rowHTML).join('')}</div>`;
  if (list.length > U.limit) h += `<button class="btn tonal" id="more">Daha fazla göster</button>`;
  main().innerHTML = h;
}
function renderStudy() {
  const Q = U.study;
  if (!Q.length) { U.study = null; return renderReview(); }
  if (U.studyIdx >= Q.length) U.studyIdx = 0;
  const it = item(Q[U.studyIdx]);
  if (!it) { Q.splice(U.studyIdx, 1); return renderStudy(); }
  bar('Tekrar', U.revTab === 1 ? 'Öğreniyorum listesi' : 'Öğrendim listesi', `<button class="iconbtn" id="endStudy" aria-label="Kart çalışmayı bitir">✕</button>`);
  let h = dirSeg() + cardHTML(it, `Tekrar ${U.studyIdx + 1}/${Q.length}`);
  h += `<div class="navrow"><button class="btn tonal" id="prev">‹ Önceki</button><button class="btn tonal" id="reshuffle" aria-label="Karıştır">🔀</button><button class="btn primary" id="next">Sonraki ›</button></div>`;
  main().innerHTML = h;
}

// ---------- Liste ----------
const NAMES = ['Yeni', 'Öğreniyorum', 'Öğrendim'];
function rowHTML(id) {
  const x = item(id); if (!x) return '';
  return `<div class="row"><div class="e" aria-hidden="true">${esc(x.emo)}</div>
    <div><b>${esc(x.en)}</b><small>${esc(x.tr)}</small></div>
    <button class="say sm" data-say="${esc(forSpeech(x.en))}" aria-label="${esc(x.en)} dinle">🔊</button>
    <button class="pill s${x.st}" data-cycle="${esc(String(id))}" aria-label="Durum: ${NAMES[x.st]}. Değiştirmek için dokun">${NAMES[x.st]}</button></div>`;
}
const norm = s => String(s || '').toLocaleLowerCase('tr');
function renderList(keepFocus) {
  bar('Liste', `${W.length.toLocaleString('tr-TR')} kelime + ${S.mine.length} kendi kelimen`);
  const q = norm(U.q), f = U.filter;
  let ids = [];
  if (f === 'mine') ids = S.mine.map(m => m.id);
  else for (let i = 0; i < W.length; i++) { if (f !== 'all' && String(S.s[i] || 0) !== f) continue; ids.push(i); }
  if (f === 'all') ids = [...S.mine.map(m => m.id), ...ids];
  if (q) ids = ids.filter(id => { const x = item(id); return x && (norm(x.en).includes(q) || norm(x.tr).includes(q)); });
  const labels = { all: 'Hepsi', '0': 'Yeni', '1': 'Öğreniyorum', '2': 'Öğrendim', mine: 'Kendi kelimelerim' };
  let h = `<input class="search" id="q" type="search" placeholder="İngilizce veya Türkçe ara" value="${esc(U.q)}" autocomplete="off" enterkeyhint="search">
    <div class="chips">${Object.keys(labels).map(k => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${labels[k]}</button>`).join('')}</div>
    <p class="note">${ids.length.toLocaleString('tr-TR')} kelime · durumu değiştirmek için sağdaki etikete dokun</p>
    <div class="rows">${ids.slice(0, U.limit).map(rowHTML).join('')}</div>`;
  if (ids.length > U.limit) h += `<button class="btn tonal" id="more">Daha fazla göster</button>`;
  main().innerHTML = h;
  if (keepFocus) { const el = $('#q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

// ---------- İlerleme + ayarlar ----------
let installEvt = null;
function renderMe() {
  const c = [0, 0, 0]; for (let i = 0; i < W.length; i++) c[S.s[i] || 0]++;
  const pct = n => (n / W.length * 100);
  const left = W.length - nextStart();
  bar('İlerleme', `Günde ${S.goal} yeni kelime`);
  main().innerHTML = `
  ${update ? `<div class="install"><p><b>Yeni sürüm var: ${esc(update.version)}</b><br>İndirip yükle; ilerlemen silinmez.</p><button class="btn primary" id="getUpdate">İndir</button></div>` : ''}
  ${installEvt ? `<div class="install"><p><b>Uygulamayı telefona yükle</b><br>Ana ekrana simgesiyle eklenir, internetsiz çalışır.</p><button class="btn primary" id="install">Yükle</button></div>` : ''}
  <div class="stats"><div class="stat"><b>${c[2]}</b><span>Öğrendim</span></div><div class="stat"><b>${c[1]}</b><span>Öğreniyorum</span></div><div class="stat"><b>${c[0]}</b><span>Yeni</span></div></div>
  <div class="prog" role="img" aria-label="Yüzde ${pct(c[2]).toFixed(1)} öğrenildi"><i class="l2" style="width:${pct(c[2])}%"></i><i class="l1" style="width:${pct(c[1])}%"></i></div>
  <p class="note">%${pct(c[2]).toFixed(1).replace('.', ',')} öğrenildi · ${S.batches.length} gün çalışıldı · görülmemiş ${left.toLocaleString('tr-TR')} kelime kaldı (yaklaşık ${Math.ceil(left / S.goal)} gün).</p>

  <section class="box"><h2>Ayarlar</h2>
    <form class="form" id="setForm">
      <div class="two"><label>Günlük yeni kelime<input id="sGoal" type="number" inputmode="numeric" min="5" max="80" value="${S.goal}"></label>
      <label>Konuşma hızı<select id="sRate" class="search" style="border-radius:14px;padding:11px 12px"><option value="normal" ${S.rate === 'normal' ? 'selected' : ''}>Normal</option><option value="slow" ${S.rate === 'slow' ? 'selected' : ''}>Yavaş</option></select></label></div>
      <button class="btn tonal" type="submit">Kaydet</button>
    </form>
    <p class="note">Yeni hedef yarından itibaren geçerli olur. Bir günü kaçırırsan kelimeler kaybolmaz; ertesi gün kaldığın yerden devam eder.</p>
  </section>

  <section class="box"><h2>Kendi kelimeni ekle</h2>
    <form class="form" id="addForm">
      <div class="two"><label>İngilizce<input id="nEn" required autocomplete="off" autocapitalize="off"></label><label>Türkçe<input id="nTr" required autocomplete="off"></label></div>
      <div class="two"><label>Emoji (isteğe bağlı)<input id="nEm" maxlength="8" autocomplete="off"></label><label>Tür (isteğe bağlı)<input id="nPos" placeholder="n, v, adj…" autocomplete="off" autocapitalize="off"></label></div>
      <label>Örnek cümle (isteğe bağlı)<input id="nEx" autocomplete="off"></label>
      <button class="btn primary" type="submit">Ekle</button>
    </form>
    <p class="note">${S.mine.length} kendi kelimen var. “Öğreniyorum” listesine eklenir.</p>
  </section>

  <section class="box"><h2>Yedekle / taşı</h2>
    <p class="note">İlerlemen sadece bu telefonda durur. Telefonu değiştirirken veya eski uygulamadan geçerken kodu kopyalayıp diğer tarafa yapıştır.</p>
    <button class="btn tonal" id="copyCode">İlerleme kodunu kopyala</button>
    <form class="form" id="importForm"><label>Kodu buraya yapıştır<textarea id="code" autocomplete="off" spellcheck="false" placeholder="B1K2.… veya eski uygulamanın B1K1.… kodu"></textarea></label>
      <button class="btn tonal" type="submit">İçe aktar</button></form>
  </section>
  <p class="note" style="text-align:center">Sürüm ${VERSION} · ${isNative ? 'Yeni sürüm çıkınca burada ve açılışta haber verir.' : 'Uygulama internete bağlıyken kendini günceller.'}</p>`;
}

// ---------- kod ile yedek ----------
function b64eLong(s) { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(bin); }
function b64d(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
function exportCode() { return 'B1K2.' + b64eLong(JSON.stringify(S)); }
function importCode(raw) {
  const code = raw.replace(/\s+/g, '');
  const m = code.match(/^B1K([12])\.(.+)$/); if (!m) throw new Error('format');
  const d = JSON.parse(b64d(m[2]));
  if (m[1] === '2') { Object.assign(S, { s: {}, t: {}, batches: [], mine: [] }, d); }
  else { // eski uygulama: {s, goal, start, mine}
    const s = {}, t = {}; const now = Date.now(); let max = -1;
    Object.entries(d.s || {}).forEach(([k, v]) => { const i = Number(k); if (v === 1 || v === 2) { s[i] = v; t[i] = now; if (i > max) max = i; } });
    const mine = (d.mine || []).map((x, k) => ({ id: 'm' + (now + k), en: x.en, tr: x.tr, emoji: x.emoji || '', pos: x.pos || '', ex: x.ex || '', status: x.status || 1, t: now }));
    const g = d.goal || 10, batches = []; for (let a = 0; a <= max; a += g) batches.push({ d: '', a, n: Math.min(g, W.length - a) });
    Object.assign(S, { s, t, mine, batches });
  }
  U.bi = null; U.idx = 0; save();
}

// ---------- çerçeve ----------
function bar(title, sub, right = '') { $('#bar').innerHTML = `<div><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div><div class="right">${right}</div>`; }
function render(keepFocus) {
  document.querySelectorAll('.tabs button').forEach(b => { if (b.dataset.tab === U.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ({ today: renderToday, review: renderReview, list: renderList, me: renderMe })[U.tab](keepFocus);
}
function current() {
  if (U.tab === 'today') { const b = S.batches[U.bi]; return b ? b.a + U.idx : null; }
  if (U.tab === 'review' && U.study) return U.study[U.studyIdx];
  return null;
}
function step(n) {
  U.shown = false;
  if (U.tab === 'today') { const L = S.batches[U.bi].n; U.idx = (U.idx + n + L) % L; }
  else if (U.study) { const L = U.study.length; U.studyIdx = (U.studyIdx + n + L) % L; }
  render();
}

document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.say) { speak(t.dataset.say, t); return; }
  if (t.dataset.tab) { U.tab = t.dataset.tab; U.shown = false; U.study = null; U.limit = 60; if (t.dataset.tab === 'today') { U.bi = null; } render(); main().scrollTop = 0; return; }
  if (t.id === 'reveal') { U.shown = true; render(); return; }
  if (t.dataset.dir) { S.dir = t.dataset.dir; save(); U.shown = false; render(); return; }
  if (t.dataset.set) {
    const id = current(); if (id === null || id === undefined) return;
    const v = Number(t.dataset.set), it = item(id), nv = it.st === v ? 0 : v;
    setStatus(id, nv);
    if (nv) { toast(nv === 2 ? 'Öğrendim ✓' : 'Öğreniyorum listesine eklendi'); setTimeout(() => step(1), 300); } else render();
    return;
  }
  if (t.id === 'next') return step(1);
  if (t.id === 'prev') return step(-1);
  if (t.id === 'prevDay') { U.bi--; U.idx = 0; U.shown = false; render(); return; }
  if (t.id === 'nextDay') { U.bi++; U.idx = 0; U.shown = false; render(); return; }
  if (t.id === 'toToday') { U.bi = null; U.idx = 0; U.shown = false; render(); return; }
  if (t.dataset.rev) { U.revTab = Number(t.dataset.rev); U.limit = 60; render(); return; }
  if (t.id === 'startStudy') { U.study = shuffle(idsWithStatus(U.revTab)); U.studyIdx = 0; U.shown = false; render(); return; }
  if (t.id === 'endStudy') { U.study = null; render(); return; }
  if (t.id === 'reshuffle') { shuffle(U.study); U.studyIdx = 0; U.shown = false; render(); return; }
  if (t.dataset.f) { U.filter = t.dataset.f; U.limit = 60; render(); return; }
  if (t.id === 'more') { U.limit += 100; render(); return; }
  if (t.dataset.cycle !== undefined) {
    const raw = t.dataset.cycle, id = /^\d+$/.test(raw) ? Number(raw) : raw, it = item(id);
    setStatus(id, (it.st + 1) % 3); render(); return;
  }
  if (t.id === 'copyCode') {
    const code = exportCode();
    try { await navigator.clipboard.writeText(code); toast('Kod kopyalandı'); }
    catch (err) { const ta = $('#code'); ta.value = code; ta.select(); toast('Kod kutuya yazıldı, seçip kopyala'); }
    return;
  }
  if (t.id === 'getUpdate') { openExternal(APK_URL); return; }
  if (t.id === 'install' && installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (err) {} installEvt = null; render(); return; }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { U.q = e.target.value; U.limit = 60; clearTimeout(document.qt); document.qt = setTimeout(() => renderList(true), 150); }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'setForm') {
    S.goal = Math.min(80, Math.max(5, parseInt($('#sGoal').value, 10) || 35));
    S.rate = $('#sRate').value === 'slow' ? 'slow' : 'normal';
    save(); toast('Ayarlar kaydedildi'); render();
  }
  if (e.target.id === 'addForm') {
    const w = { id: 'm' + Date.now(), en: $('#nEn').value.trim(), tr: $('#nTr').value.trim(), emoji: $('#nEm').value.trim(), pos: $('#nPos').value.trim(), ex: $('#nEx').value.trim(), status: 1, t: Date.now() };
    if (!w.en || !w.tr) return;
    S.mine.unshift(w); save(); toast('Eklendi: ' + w.en); render();
  }
  if (e.target.id === 'importForm') {
    const v = $('#code').value.trim(); if (!v) { toast('Önce kodu yapıştır'); return; }
    try { importCode(v); toast('İlerleme aktarıldı ✓', 2400); render(); }
    catch (err) { toast('Kod okunamadı. Kodun tamamını kopyaladığından emin ol.', 3200); }
  }
});

// kartı sağa/sola kaydırarak sonraki/önceki karta geç
let sx = null, sy = null;
document.addEventListener('touchstart', e => { if (e.target.closest('#card')) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (sx === null) return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
}, { passive: true });

// yeni gün başladıysa (uygulama arka planda açık kaldıysa) bugünü yenile
document.addEventListener('visibilitychange', () => { if (!document.hidden && U.tab === 'today' && W.length) { const last = S.batches[S.batches.length - 1]; if (!last || last.d !== todayStr()) { U.bi = null; U.idx = 0; render(); } } });

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (U.tab === 'me') render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Uygulama yüklendi ✓'); });

// ---------- service worker: internetsiz çalışma + otomatik güncelleme ----------
function openExternal(url) { if (isNative) location.href = url; else window.open(url, '_blank', 'noopener'); }
document.addEventListener('click', e => {
  const a = e.target.closest('a[target="_blank"]');
  if (a && isNative) { e.preventDefault(); openExternal(a.href); }
});
// Android uygulaması: GitHub'daki son sürümü kontrol et
const vnum = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
function newer(a, b) { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
async function checkUpdate() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (j.tag_name && newer(j.tag_name, VERSION)) {
      update = { version: j.tag_name };
      toast(`Yeni sürüm var (${j.tag_name}). İlerleme sekmesinden indir.`, 4000);
      if (U.tab === 'me') render();
    }
  } catch (e) {}
}
if (isNative) { checkUpdate(); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); }); }
if (!isNative && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('Uygulama güncellendi ✓', 2400); hadController = true; });
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

// ---------- başlat ----------
load();
fetch('words.json').then(r => r.json()).then(d => { W = d; render(); })
  .catch(() => { main().innerHTML = '<div class="empty"><b>Kelimeler yüklenemedi</b>İnternet bağlantını kontrol edip uygulamayı yeniden aç.</div>'; });
})();

// app.js
'use strict';

(() => {
  // === 기본값 ===
  const DEFAULTS = {
    model: 'gemini-2.5-flash',
    temperature: 0.2,
    topP: 0.95,
    maxTokens: 2048,
    tone: 'neutral',   // neutral | formal | casual
    variety: 'auto',   // auto | us | uk
    preserve: true
  };

  // === 셀렉터 ===
  const $ = (s) => document.querySelector(s);
  const el = {
    apiKey: $('#apiKey'), keyMsg: $('#keyMsg'), saveKey: $('#saveKey'), toggleKey: $('#toggleKey'), testKey: $('#testKey'),
    src: $('#srcLang'), tgt: $('#tgtLang'), note: $('#noteInput'), send: $('#sendBtn'),
    origList: $('#origList'), tranList: $('#tranList'), exportBtn: $('#exportBtn'), clearBtn: $('#clearBtn'), modelBadge: $('#modelBadge'),
    gSrc: $('#gSrc'), gTgt: $('#gTgt'), gWhole: $('#gWhole'), gAdd: $('#gAdd'), gClear: $('#gClear'), gList: $('#gList'), gCount: $('#glossCount'),
    installBtn: $('#installBtn'), openSettings: $('#openSettings'), overlay: $('#settingsOverlay'),
    stModel: $('#stModel'), stTone: $('#stTone'), stVariety: $('#stVariety'), stPreserve: $('#stPreserve'),
    stTemp: $('#stTemp'), stTopP: $('#stTopP'), stMaxTok: $('#stMaxTok'),
    stTempVal: $('#stTempVal'), stTopPVal: $('#stTopPVal'),
    btnSaveSettings: $('#btnSaveSettings'), btnCloseSettings: $('#btnCloseSettings'),
    layoutMode: $('#layoutMode'),
    resSplit: $('#resSplit'),
    resPair: $('#resPair'),
    pairList: $('#pairList'),
  };

  // === localStorage 래퍼 ===
  const LS = {
    get k(){ return localStorage.getItem('gemini_key') || ''; },
    set k(v){ localStorage.setItem('gemini_key', v || ''); },
    get src(){ return localStorage.getItem('src') || 'auto'; },
    set src(v){ localStorage.setItem('src', v); },
    get tgt(){ return localStorage.getItem('tgt') || 'ko'; },
    set tgt(v){ localStorage.setItem('tgt', v); },
    get lines(){ try { return JSON.parse(localStorage.getItem('lines') || '[]'); } catch { return []; } },
    set lines(v){ localStorage.setItem('lines', JSON.stringify(v || [])); },
    get glossary(){ try { return JSON.parse(localStorage.getItem('glossary') || '[]'); } catch { return []; } },
    set glossary(v){ localStorage.setItem('glossary', JSON.stringify(v || [])); },
    get settings(){ try { return JSON.parse(localStorage.getItem('settings') || 'null') || DEFAULTS; } catch { return DEFAULTS; } },
    set settings(v){ localStorage.setItem('settings', JSON.stringify(v || DEFAULTS)); },
    get layout(){ return localStorage.getItem('layout') || 'split'; },
    set layout(v){ localStorage.setItem('layout', v); },
  };

  // === 초기 렌더 ===
  if (el.apiKey) el.apiKey.value = LS.k;
  if (el.src) el.src.value = LS.src;
  if (el.tgt) el.tgt.value = LS.tgt;
  renderLines(LS.lines);
  renderGlossary();
  loadSettingsToUI();

  if (el.layoutMode) el.layoutMode.value = LS.layout;
  applyLayout();


  // === PWA 설치 & SW ===
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (el.installBtn) el.installBtn.style.display = '';
  });
  if (el.installBtn) {
    el.installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // === 이벤트 ===
  if (el.toggleKey) el.toggleKey.addEventListener('click', () => {
    el.apiKey.type = (el.apiKey.type === 'password') ? 'text' : 'password';
    el.toggleKey.textContent = (el.apiKey.type === 'password') ? '표시' : '숨김';
  });
  if (el.saveKey) el.saveKey.addEventListener('click', () => { LS.k = (el.apiKey.value || '').trim(); keyMsg('저장됨'); });
  if (el.testKey) el.testKey.addEventListener('click', async () => { const ok = await testKey(); keyMsg(ok ? '키 정상' : '키 오류', ok ? '' : 'error'); });
  if (el.src) el.src.addEventListener('change', () => { LS.src = el.src.value; });
  if (el.tgt) el.tgt.addEventListener('change', () => { LS.tgt = el.tgt.value; });

  if (el.note) el.note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }});
  if (el.send) el.send.addEventListener('click', send);

  if (el.exportBtn) el.exportBtn.addEventListener('click', exportCSV);
  if (el.clearBtn) el.clearBtn.addEventListener('click', () => { LS.lines = []; renderLines([]); });

  if (el.gAdd) el.gAdd.addEventListener('click', () => {
    const s = (el.gSrc.value || '').trim();
    const t = (el.gTgt.value || '').trim();
    if (!s || !t) return;
    const entry = { src: s, tgt: t, whole: !!(el.gWhole && el.gWhole.checked) };
    LS.glossary = LS.glossary.concat([entry]);
    el.gSrc.value = ''; el.gTgt.value = '';
    renderGlossary();
  });
  if (el.gClear) el.gClear.addEventListener('click', () => { LS.glossary = []; renderGlossary(); });

  if (el.openSettings) el.openSettings.addEventListener('click', () => { el.overlay.classList.add('show'); });
  if (el.btnCloseSettings) el.btnCloseSettings.addEventListener('click', () => { el.overlay.classList.remove('show'); loadSettingsToUI(); });
  if (el.overlay) el.overlay.addEventListener('click', (e) => { if (e.target === el.overlay) el.overlay.classList.remove('show'); });

  if (el.stTemp) el.stTemp.addEventListener('input', () => { el.stTempVal.textContent = String(el.stTemp.value); });
  if (el.stTopP) el.stTopP.addEventListener('input', () => { el.stTopPVal.textContent = String(el.stTopP.value); });
  if (el.btnSaveSettings) el.btnSaveSettings.addEventListener('click', () => { saveSettingsFromUI(); el.overlay.classList.remove('show'); });
  if (el.layoutMode) el.layoutMode.addEventListener('change', () => {
    LS.layout = el.layoutMode.value;
    applyLayout();
  });


  // === 함수들 ===
  function keyMsg(msg, cls) {
    if (!el.keyMsg) return;
    el.keyMsg.textContent = msg;
    el.keyMsg.className = 'hint ' + (cls || '');
    if (msg) setTimeout(() => { el.keyMsg.textContent = ''; }, 3000);
  }

  function renderLines(lines){
    // 좌우 2열
    if (el.origList && el.tranList){
        el.origList.innerHTML = '';
        el.tranList.innerHTML = '';
        lines.forEach((l,i)=>{
        el.origList.appendChild(lineEl(l.orig, i, false));
        el.tranList.appendChild(lineEl(l.tran, i, true));
        });
    }
    // 세로(원문→번역)
    if (el.pairList){
        el.pairList.innerHTML = '';
        lines.forEach((l,i)=>{
        el.pairList.appendChild(pairItemEl(l, i));
        });
    }
  }

  function pairItemEl(l, idx){
    const wrap = document.createElement('div');
    wrap.className = 'item';

    const id = document.createElement('div');
    id.className = 'idx';
    id.textContent = idx + 1;

    const text = document.createElement('div');
    text.className = 'text';

    const o = document.createElement('div');
    o.className = 'orig';
    o.textContent = String(l.orig);

    const t = document.createElement('div');
    t.className = 'tran';
    t.textContent = String(l.tran);

    text.appendChild(o); text.appendChild(t);
    wrap.appendChild(id); wrap.appendChild(text);
    return wrap;
  }

  function lineEl(text, idx, isTran) {
    const div = document.createElement('div'); div.className = 'line';
    const num = document.createElement('div'); num.textContent = (idx + 1); num.className = 'badge';
    const body = document.createElement('div'); body.className = isTran ? 'tran' : 'orig'; body.textContent = String(text);
    const btns = document.createElement('div'); btns.className = 'toolbar';
    const copy = document.createElement('button'); copy.textContent = '복사';
    copy.addEventListener('click', () => { navigator.clipboard.writeText(String(text)); });
    btns.appendChild(copy);
    div.appendChild(num); div.appendChild(body); div.appendChild(btns);
    return div;
  }

  function exportCSV() {
    const rows = [['original','translation','src','tgt']].concat(
      LS.lines.map(l => [l.orig, l.tran, l.src, l.tgt])
    );
    const csv = rows
      .map(r => r.map(s => '"' + String(s).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'translations.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderGlossary() {
    if (!el.gList || !el.gCount) return;
    const list = LS.glossary;
    el.gList.innerHTML = ''; el.gCount.textContent = '(' + list.length + '개)';
    list.forEach((g, idx) => {
      const row = document.createElement('div'); row.className = 'row';
      const chip = document.createElement('span'); chip.className = 'pill';
      chip.innerHTML = '<b>' + escapeHTML(g.src) + '</b> → ' + escapeHTML(g.tgt) + (g.whole ? ' (word)' : '');
      const del = document.createElement('button'); del.textContent = '삭제';
      del.addEventListener('click', () => {
        const arr = LS.glossary; arr.splice(idx, 1); LS.glossary = arr; renderGlossary();
      });
      row.appendChild(chip); row.appendChild(del); el.gList.appendChild(row);
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  }

  function loadSettingsToUI() {
  // 1) st를 먼저 준비
  const st = LS.settings;

  // 2) 모델 드롭다운: 저장된 값이 옵션에 없으면 동적 추가 후 선택
  if (el.stModel) {
    const v = st.model || DEFAULTS.model;
    const optValues = Array.from(el.stModel.options).map(o => o.value);
    if (!optValues.includes(v)) {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      el.stModel.appendChild(opt);
    }
    el.stModel.value = v; // 여기서 딱 한 번만 세팅
  }

  // 3) 나머지 설정 UI 반영
  if (el.stTone)     el.stTone.value = st.tone || DEFAULTS.tone;
  if (el.stVariety)  el.stVariety.value = st.variety || DEFAULTS.variety;
  if (el.stPreserve) el.stPreserve.checked = ('preserve' in st ? !!st.preserve : DEFAULTS.preserve);

  if (el.stTemp) {
    el.stTemp.value = String(st.temperature ?? DEFAULTS.temperature);
    if (el.stTempVal) el.stTempVal.textContent = String(el.stTemp.value);
  }
  if (el.stTopP) {
    el.stTopP.value = String(st.topP ?? DEFAULTS.topP);
    if (el.stTopPVal) el.stTopPVal.textContent = String(el.stTopP.value);
  }
  if (el.stMaxTok) el.stMaxTok.value = String(st.maxTokens ?? DEFAULTS.maxTokens);

  if (el.modelBadge) el.modelBadge.textContent = 'model: ' + (st.model || DEFAULTS.model);
}


  function saveSettingsFromUI() {
    const st = LS.settings;
    const next = {
      model: (el.stModel && el.stModel.value ? el.stModel.value.trim() : st.model || DEFAULTS.model),
      tone: el.stTone ? el.stTone.value : st.tone,
      variety: el.stVariety ? el.stVariety.value : st.variety,
      preserve: el.stPreserve ? !!el.stPreserve.checked : st.preserve,
      temperature: el.stTemp ? Number(el.stTemp.value) : st.temperature,
      topP: el.stTopP ? Number(el.stTopP.value) : st.topP,
      maxTokens: el.stMaxTok ? Number(el.stMaxTok.value) : st.maxTokens
    };
    LS.settings = next; loadSettingsToUI();
  }

  function styleDirectives(tgt) {
    const st = LS.settings;
    const lines = [];
    if (st.tone === 'formal') lines.push('Use a formal tone appropriate for professional documents.');
    if (st.tone === 'casual') lines.push('Use a natural conversational tone.');
    if ((tgt === 'en' || tgt === 'en-US' || tgt === 'en-GB') && st.variety === 'us') lines.push('Use American English conventions.');
    if ((tgt === 'en' || tgt === 'en-US' || tgt === 'en-GB') && st.variety === 'uk') lines.push('Use British English conventions.');
    if (st.preserve) lines.push('Preserve inline markup (Markdown, placeholders) exactly as given.');
    return lines.join(' ');
  }

  function buildPrompt(text, src, tgt) {
    const from = (src === 'auto') ? 'auto-detect' : src;
    const gl = LS.glossary || [];
    let glossLines = '';
    if (gl.length) {
      const lines = gl.map(g => '- "' + g.src + '" -> "' + g.tgt + '"' + (g.whole ? ' (whole word)' : ''));
      glossLines = '\n\nGlossary (terms to enforce):\n' + lines.join('\n');
    }
    return 'You are a professional translation engine. ' +
      'Translate the following text from ' + from + ' to ' + tgt + '. ' +
      styleDirectives(tgt) + glossLines +
      '\n\nReturn only the translation with no quotes or extra commentary.' +
      '\n\nText:\n' + text;
  }

  function applyDeterministicGlossary(out, glossary) {
    if (!glossary || !glossary.length) return out;
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let t = String(out);
    glossary.forEach((item) => {
      const escSrc = esc(item.src);
      const re = item.whole
        ? new RegExp('(^|\\b)' + escSrc + '(?=\\b|$)', 'g')
        : new RegExp(escSrc, 'g');
      t = t.replace(re, (m, p1) => (item.whole && p1 ? p1 : '') + String(item.tgt));
    });
    return t;
  }

  function applyLayout(){
    if (!el.resSplit || !el.resPair) return;
    const mode = LS.layout;
    if (el.layoutMode) el.layoutMode.value = mode;
    if (mode === 'pair'){
        el.resSplit.hidden = true;
        el.resPair.hidden = false;
    } else {
        el.resSplit.hidden = false;
        el.resPair.hidden = true;
    }
  }


  async function translateOnce(apiKey, text, src, tgt) {
    const st = LS.settings;
    const body = {
      systemInstruction: {
        role: 'system',
        parts: [{ text: 'You translate text. Output ONLY the translation. If a glossary is supplied, obey it strictly.' }]
      },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(text, src, tgt) }] }],
      generationConfig: {
        temperature: Number(st.temperature || 0),
        topP: Number(st.topP || 1),
        maxOutputTokens: Number(st.maxTokens || 2048)
      }
    };
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
                encodeURIComponent(st.model || DEFAULTS.model) +
                ':generateContent';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text());
    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (data?.promptFeedback?.blockReason) throw new Error('Blocked by safety: ' + data.promptFeedback.blockReason);
    return out;
  }

  async function testKey() {
    try { return !!(await translateOnce((el.apiKey.value || '').trim(), 'ping', 'en', 'ko')); }
    catch { return false; }
  }

  async function send() {
    const apiKey = (el.apiKey.value || '').trim();
    const text = (el.note.value || '').trim();
    if (!apiKey) { keyMsg('API 키를 먼저 저장하세요', 'error'); return; }
    if (!text) return;
    if (el.send) { el.send.disabled = true; el.send.textContent = '번역 중…'; }
    try {
      const raw = await translateOnce(apiKey, text, (el.src ? el.src.value : 'auto'), (el.tgt ? el.tgt.value : 'ko'));
      const final = applyDeterministicGlossary(raw, LS.glossary);
      const lines = LS.lines.concat([{ orig: text, tran: final, src: (el.src ? el.src.value : 'auto'), tgt: (el.tgt ? el.tgt.value : 'ko') }]);
      LS.lines = lines; renderLines(lines);
      el.note.value = '';
    } catch (err) {
      alert('번역 실패: ' + (err?.message || String(err)));
    } finally {
      if (el.send) { el.send.disabled = false; el.send.textContent = '번역'; }
    }
  }
})();

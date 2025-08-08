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

  const selected = new Set(); // 체크된 라인 인덱스 보관

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
    layoutMode: $('#layoutMode'),
    resSplit: $('#resSplit'),
    resPair: $('#resPair'),
    pairList: $('#pairList'),
    copyMode: $('#copyMode'),
    btnCopySel: $('#btnCopySel'),
    selToggle: $('#selToggle'),
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

    // 선택 복사 & 전체선택
    if (el.btnCopySel) el.btnCopySel.addEventListener('click', copySelected);
    if (el.selToggle) el.selToggle.addEventListener('change', (e) => {
        const on = e.target.checked;
        document.querySelectorAll('input.sel[data-idx]').forEach(cb => {
            cb.checked = on;
            const i = Number(cb.dataset.idx);
            if (on) selected.add(i); else selected.delete(i);
        });
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
        el.origList.appendChild(lineEl(l, i, false)); // 원문 라인
        el.tranList.appendChild(lineEl(l, i, true));  // 번역 라인
        });
    }
    // 세로(원문→번역)
    if (el.pairList){
        el.pairList.innerHTML = '';
        lines.forEach((l,i)=>{
        el.pairList.appendChild(pairItemEl(l, i));
        });
    }
    // 렌더 후 현재 레이아웃만 보이도록 한 번 더 보정
    applyLayout();
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
    o.className = 'orig editable'; o.contentEditable = 'true';
    o.textContent = String(l.orig);
    o.addEventListener('blur', () => {
        const lines = LS.lines; lines[idx].orig = o.textContent || ''; LS.lines = lines;
    });

    const t = document.createElement('div');
    t.className = 'tran editable'; t.contentEditable = 'true';
    t.textContent = String(l.tran);
    t.addEventListener('blur', () => {
        const lines = LS.lines; lines[idx].tran = t.textContent || ''; LS.lines = lines;
    });

    // 툴바 (체크/복사/재번역)
    const tools = document.createElement('div');
    tools.className = 'toolbar';
    const cb = document.createElement('input');
    cb.type='checkbox'; cb.className='sel'; cb.dataset.idx = idx;
    cb.checked = selected.has(idx);
    cb.addEventListener('change', () => {
        if (cb.checked) selected.add(idx); else selected.delete(idx);
    });
    const copy = document.createElement('button'); copy.textContent='복사';
    copy.addEventListener('click', ()=> {
        const mode = el.copyMode?.value || 'both';
        const txt = (mode==='orig') ? o.textContent :
                    (mode==='tran') ? t.textContent :
                    (o.textContent + '\n' + t.textContent);
        navigator.clipboard.writeText(txt || '');
    });
    const rerun = document.createElement('button'); rerun.textContent='재번역';
    rerun.addEventListener('click', async ()=> {
        const apiKey = (el.apiKey?.value || '').trim();
        if (!apiKey) { alert('API 키를 먼저 저장하세요'); return; }
        try{
        const raw = await translateOnce(apiKey, (LS.lines[idx].orig || ''), (el.src?el.src.value:'auto'), (el.tgt?el.tgt.value:'ko'));
        const final = applyDeterministicGlossary(raw, LS.glossary);
        const lines = LS.lines; lines[idx].tran = final; LS.lines = lines; renderLines(lines);
        }catch(err){ alert('재번역 실패: ' + (err?.message || String(err))); }
    });
    tools.appendChild(cb); tools.appendChild(copy); tools.appendChild(rerun);

    text.appendChild(o); text.appendChild(t); text.appendChild(tools);
    wrap.appendChild(id); wrap.appendChild(text);
    return wrap;
  }

  function lineEl(line, idx, isTran){
    const text = isTran ? line.tran : line.orig;

    const div = document.createElement('div');
    div.className = 'line';

    const num = document.createElement('div');
    num.textContent = idx + 1;
    num.className = 'badge';

    const body = document.createElement('div');
    body.className = isTran ? 'tran editable' : 'orig editable';
    body.contentEditable = 'true';
    body.textContent = String(text);

    // 편집 → 저장
    body.addEventListener('blur', () => {
        const val = body.textContent || '';
        const lines = LS.lines;
        if (isTran) lines[idx].tran = val;
        else        lines[idx].orig = val;
        LS.lines = lines;
        // 원문 수정 후 즉시 재번역이 필요한 경우는 버튼 눌러서 수행 (아래)
    });

    const btns = document.createElement('div');
    btns.className = 'toolbar';

    // 체크박스
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'sel'; cb.dataset.idx = idx;
    cb.checked = selected.has(idx);
    cb.addEventListener('change', () => {
        if (cb.checked) selected.add(idx); else selected.delete(idx);
    });
    btns.appendChild(cb);

    // 복사
    const copy = document.createElement('button');
    copy.textContent = '복사';
    copy.addEventListener('click', () => navigator.clipboard.writeText(body.textContent || ''));
    btns.appendChild(copy);

    // 재번역 (원문 쪽에만)
    if (!isTran){
        const rerun = document.createElement('button');
        rerun.textContent = '재번역';
        rerun.addEventListener('click', async () => {
        const apiKey = (el.apiKey?.value || '').trim();
        if (!apiKey) { alert('API 키를 먼저 저장하세요'); return; }
        // 최신 원문으로 재번역
        try{
            const raw = await translateOnce(apiKey, (LS.lines[idx].orig || ''), (el.src?el.src.value:'auto'), (el.tgt?el.tgt.value:'ko'));
            const final = applyDeterministicGlossary(raw, LS.glossary);
            const lines = LS.lines;
            lines[idx].tran = final; LS.lines = lines;
            renderLines(lines);
        }catch(err){ alert('재번역 실패: ' + (err?.message || String(err))); }
        });
        btns.appendChild(rerun);
    }

    div.appendChild(num);
    div.appendChild(body);
    div.appendChild(btns);
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
    el.resSplit.hidden = (mode === 'pair');
    el.resPair.hidden  = (mode !== 'pair');
  }

  function copySelected(){
    const mode = el.copyMode?.value || 'both';
    const lines = LS.lines;
    const idxs = Array.from(selected).sort((a,b)=>a-b).filter(i => i>=0 && i<lines.length);
    if (!idxs.length){ alert('선택된 항목이 없습니다.'); return; }
    const parts = idxs.map(i => {
        const L = lines[i];
        if (mode==='orig') return L.orig || '';
        if (mode==='tran') return L.tran || '';
        return (L.orig || '') + '\n' + (L.tran || '');
    });
    const text = parts.join('\n'); // 줄바꿈으로 연결
    navigator.clipboard.writeText(text);
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


// ── Google Sheets Config ─────────────────────────────────
const GS_URL = 'https://script.google.com/macros/s/AKfycbz1QYm6bJ6mPvi6460lWSQeIk8lWx86s2kHr_cJkSwgdIjSmUQ_KV7-ciVV3UYdin8l/exec';

// ── 科目清單（從 Google 試算表動態載入）─────────────────────
// 試算表需有「科目清單」工作表，A欄=帳戶標籤、B欄=科目名稱
// 帳戶標籤對應：零用金（採購）/ 農會儲簿 / 台企儲簿 / 基金會
let SUBJ_OPTIONS = {
  lingyon: ['水電燃氣費','郵電費','玄天上帝聖誕','玉皇上帝萬壽','契子過限','祭祀費','祭典活動費','廟務公務費','手續費'],
  nonghu:  ['利息收入','信徒捐款收入','活動收入','補助款收','廟務借款'],
  taiqiye: ['利息收入','信徒捐款收入','活動收入','補助款收','廟務借款'],
  jijin:   ['利息收入','信徒捐款收入','活動收入','補助款收','廟務借款'],
};

// ── 科目 → 收入/支出 對照表（從科目清單 C 欄載入）──────────
// 格式：SUBJ_TYPE_MAP[acctKey][科目名稱] = 'income' | 'expense'
let SUBJ_TYPE_MAP = { lingyon: {}, nonghu: {}, taiqiye: {}, jijin: {} };

async function loadSubjects() {
  try {
    const res = await gsReq({ action: 'getSubjects' });
    if (res.error || !res.subjects) return;
    const map = res.subjects;
    const keyMap = {
      '零用金（採購）': 'lingyon',
      '農會儲簿':       'nonghu',
      '台企儲簿':       'taiqiye',
      '基金會':         'jijin',
    };
    Object.entries(keyMap).forEach(([label, key]) => {
      if (map[label] && map[label].length > 0) {
        if (typeof map[label][0] === 'object') {
          // 新格式：GAS 回傳 {name, type}
          SUBJ_OPTIONS[key] = map[label].map(o => o.name);
          SUBJ_TYPE_MAP[key] = {};
          map[label].forEach(o => {
            SUBJ_TYPE_MAP[key][o.name] = o.type === '收入' ? 'income' : 'expense';
          });
        } else {
          // 舊格式：字串陣列，維持向下相容
          SUBJ_OPTIONS[key] = map[label];
        }
      }
    });
    refreshAllSubjSelects();
  } catch(e) {
    console.warn('科目清單載入失敗，使用預設值:', e.message);
  }
}

// 選科目後自動更新 badge 與 hidden type
function onSubjChange(acct) {
  const subjEl = document.getElementById(acct + '-subj');
  if (!subjEl) return;
  const subj = subjEl.value;
  const type = (SUBJ_TYPE_MAP[acct] || {})[subj];
  const hidden = document.getElementById(acct + '-type');
  if (hidden && type !== undefined) hidden.value = type;
  const badge = document.getElementById(acct + '-type-badge');
  if (badge) {
    if (type === 'income') {
      badge.className = 'type-badge income';
      badge.textContent = '收入';
    } else if (type === 'expense') {
      badge.className = 'type-badge expense';
      badge.textContent = '支出';
    } else {
      badge.className = 'type-badge unknown';
      badge.textContent = '—';
    }
  }
}

function buildSubjSelect(acct) {
  const opts = (SUBJ_OPTIONS[acct] || []).map(o => `<option value="${o}">${o}</option>`).join('');
  return `<select id="${acct}-subj" data-subj-acct="${acct}"
    onchange="onSubjChange('${acct}')"
    style="height:34px;padding:0 8px;border:1px solid var(--paper-dark);border-radius:var(--radius);background:var(--paper);color:var(--ink);font-size:13px;font-family:var(--sans);width:100%;">${opts}</select>`;
}

function refreshAllSubjSelects() {
  document.querySelectorAll('select[data-subj-acct]').forEach(sel => {
    const acct = sel.getAttribute('data-subj-acct');
    const cur = sel.value;
    const opts = (SUBJ_OPTIONS[acct] || []).map(o =>
      `<option value="${o}"${o === cur ? ' selected' : ''}>${o}</option>`
    ).join('');
    sel.innerHTML = opts;
    onSubjChange(acct); // 同步更新 badge
  });
}
var p = null; // 👈 【大補帖】直接在全域宣告 p
// ─── 【魔王終結者】強行宣告 syncDate，防止系統崩潰中斷 ───
if (typeof syncDate !== 'function') {
  function syncDate(arg1, arg2) {
    // 讓它安全空轉，不干擾原本的邏輯，或者是直接回傳傳進來的東西
    return arg1; 
  }
}
async function gsReq(params){
  // 自動附上目前登入的使用者帳號，供 GAS log 記錄使用
  const operator = localStorage.getItem('beiji_logged_user') || '';
  const paramsWithUser = operator ? { ...params, operator } : params;
  const qs = new URLSearchParams(paramsWithUser).toString();
  const res = await fetch(GS_URL + '?' + qs, {
    method: 'GET',
    redirect: 'follow'
  });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('回應格式錯誤: ' + text.slice(0,100)); }
}

// ── Constants ─────────────────────────────────────────────
const ACCT_META = {
  nonghu:  { label:'農會儲簿',       incLabel:'收入',      expLabel:'支出' },
  taiqiye: { label:'台企儲簿',       incLabel:'收入',      expLabel:'支出' },
  lingyon: { label:'零用金（採購）',  incLabel:'收入／借入', expLabel:'支出／採購' },
  jijin:   { label:'基金會',         incLabel:'收入',      expLabel:'支出' },
};
const ACCT_KEYS = ['nonghu','taiqiye','lingyon','jijin'];
const LABEL_TO_KEY = {};
Object.entries(ACCT_META).forEach(([k,v])=>{ LABEL_TO_KEY[v.label]=k; });
const FIXED_LABELS = {B:'台企定期（B）',C:'農會定期（C）',D:'金龜現金（D）',E:'信徒借款（E）'};
const TYPE_MAP  = { income:'收入', expense:'支出', prev:'上期結存' };
const TYPE_MAP_R = { '收入':'income','支出':'expense','上期結存':'prev' };

let db = { nonghu:[], taiqiye:[], lingyon:[], jijin:[], fixed:[] };
// 💡 全域追加：用來記錄各個分頁在當前瀏覽器視窗中「剛剛新增」的項目，剛進去時是空的
let currentAddedEntries = { nonghu: [], taiqiye: [], lingyon: [], jijin: [] };

// ── 日期格式統一工具 ─────────────────────────────────────
// 儲存格式（寫入 Google Sheet）：西元 YYYY/MM/DD，例如 2026/06/10
// 顯示格式（畫面呈現）       ：民國 YYY/MM/DD ，例如 115/06/10

// input[type=date] 的值 (YYYY-MM-DD) → 儲存格式 (YYYY/MM/DD)
function adInputToStorage(adStr){
  if(!adStr) return '';
  const [y,m,d] = adStr.split('-');
  if(!y||!m||!d) return '';
  return `${y}/${m.padStart(2,'0')}/${d.padStart(2,'0')}`;
}

// 任意舊格式（民國.分隔、西元-分隔、西元/分隔等）→ 正規化為儲存格式 YYYY/MM/DD（西元）
function normalizeToStorage(dateStr){
  const d = String(dateStr || '').trim();
  if(!d) return '';
  const parts = d.split(/[-.\/]/).map(s => s.trim());
  if(parts.length < 3) return d; // 無法解析就原樣回傳，避免資料遺失
  let [y, m, day] = parts;
  let yNum = parseInt(y, 10);
  if (isNaN(yNum)) return d;
  // 民國年（小於1911）→ 轉西元
  if (yNum < 200) yNum += 1911;
  m = String(parseInt(m,10)).padStart(2,'0');
  day = String(parseInt(day,10)).padStart(2,'0');
  return `${yNum}/${m}/${day}`;
}

// 儲存格式 (西元 YYYY/MM/DD 或相容舊格式) → 顯示格式 (民國 YYY/MM/DD)
function storageToDisplay(dateStr){
  const d = normalizeToStorage(dateStr);
  if(!d) return '';
  const parts = d.split('/');
  if(parts.length < 3) return d;
  const rocYear = parseInt(parts[0],10) - 1911;
  return `${rocYear}/${parts[1]}/${parts[2]}`;
}

// 儲存格式 (YYYY/MM/DD) → input[type=date] 用的 YYYY-MM-DD
function storageToInputAD(dateStr){
  const d = normalizeToStorage(dateStr);
  if(!d) return '';
  const parts = d.split('/');
  if(parts.length < 3) return '';
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

function buildRocDatePicker(idPrefix){
  const today = new Date().toISOString().slice(0,10);
  return `<div style="position:relative;display:inline-block;">
    <input type="date" id="${idPrefix}-date-native"
      value="${today}"
      style="height:34px;padding:0 9px;border:1px solid var(--paper-dark);border-radius:var(--radius);
             background:var(--paper);color:var(--ink);font-size:13px;font-family:var(--sans);
             outline:none;width:160px;cursor:pointer;"
      onfocus="this.style.borderColor='var(--gold)';this.style.boxShadow='0 0 0 3px rgba(184,151,42,.15)'"
      onblur="this.style.borderColor='var(--paper-dark)';this.style.boxShadow='none'"
    />
  </div>`;
}
// 取得新增表單中選擇的日期 → 儲存格式 (西元 YYYY/MM/DD)，供 addEntry 寫入 GAS 使用
function getDateVal(pfx){
  const native = document.getElementById(pfx+'-date-native');
  if(!native||!native.value) return '';
  return adInputToStorage(native.value);
}
function updateDays(pfx){
  // no-op: native date picker handles this
  const y = 0, m = 0;

  // native date picker auto-handles days
}

// ── Status ────────────────────────────────────────────────
function setStatus(state, msg){
  const el=document.getElementById('sync-status');
  el.className='sync-status '+state;
  el.innerHTML=`<i class="ti ti-cloud${state==='loading'?' spin':''}"></i>${msg}`;
}

// ── Load from Google Sheets ──────────────────────────────
async function loadFromGS(){
  setStatus('loading','連線 Google Sheets…');
  try {
    const res = await gsReq({action:'getAll'});
    if(res.error) throw new Error(res.error);
    db={nonghu:[],taiqiye:[],lingyon:[],jijin:[],fixed:[]};
    (res.rows||[]).forEach(row=>{
      // 💡 定存／特殊科目：acct 為「定存特殊」，分流進 db.fixed
      if (row.acct === '定存特殊') {
        db.fixed.push({
          id: String(row.id),
          month: row.date || '',
          key: row.subj || '',
          amount: parseFloat(row.amount) || 0,
          note: row.note || ''
        });
        return;
      }
      const key=LABEL_TO_KEY[row.acct];
      if(!key||!db[key]) return;
      db[key].push({
        id: String(row.id),
        date: normalizeToStorage(row.date)||'',
        subj: row.subj||'',
        note: row.note||'',
        type: TYPE_MAP_R[row.type]||row.type||'income',
        amount: parseFloat(row.amount)||0,
        acct: row.acct||''
      });
    });
    db.fixed.sort((a,b)=>String(a.month||'').localeCompare(String(b.month||''))||String(a.key||'').localeCompare(String(b.key||'')));
    ACCT_KEYS.forEach(a=>sortEntries(db[a]));
    setStatus('ok','✓ 已同步');
    return true;
  } catch(err){
    console.error('Google Sheets 連線失敗:', err.message, err.stack);
    setStatus('err','同步失敗－請重試');
    return false;
  }
}

// ── CRUD ──────────────────────────────────────────────────
function sortEntries(arr){
  arr.sort((a,b)=>{
    if(a.type==='prev'&&b.type!=='prev') return -1;
    if(b.type==='prev'&&a.type!=='prev') return 1;
    return (a.date||'').localeCompare(b.date||'');
  });
}
function fmtMoney(n){
  if(n===null||n===undefined||n==='') return '—';
  return '$'+Math.round(n).toLocaleString('zh-TW');
}

async function addEntry(acct){
  const date   = getDateVal(acct);
  const subj   = document.getElementById(acct+'-subj').value.trim();
  const note   = document.getElementById(acct+'-note').value.trim();
  // 從隱藏欄位取類型（由 onSubjChange 根據科目清單 C 欄自動寫入）
  const typeEl = document.getElementById(acct+'-type');
  const type   = typeEl ? typeEl.value : 'expense';
  const amount = parseFloat(document.getElementById(acct+'-amount').value);
  if(!date||!subj||isNaN(amount)||amount<0){ alert('請填寫科目／商家與金額'); return; }
  const btn=document.getElementById(acct+'-add-btn');
  btn.disabled=true; btn.innerHTML='<i class="ti ti-loader spin"></i>儲存中…';
  try {
    const entry={date,subj,note,type,amount};
    const res=await gsReq({action:'add', date, subj, note:note||'', type:TYPE_MAP[type]||type, amount:String(amount), acct:ACCT_META[acct].label});
    if(res.error) throw new Error(res.error);
    
    entry.id=String(res.id);
    
    // 同步塞入全域歷史大倉庫
    db[acct].push(entry);
    sortEntries(db[acct]);
    
    // 💡【核心同步】同時推進當下新增的清單，讓它在下方顯示出來
    if(!currentAddedEntries[acct]) currentAddedEntries[acct] = [];
    currentAddedEntries[acct].push(entry);
    
    renderAcct(acct);
    
    document.getElementById(acct+'-subj').value='';
    document.getElementById(acct+'-note').value='';
    document.getElementById(acct+'-amount').value='';
    setStatus('ok','已儲存');
  } catch(e){ alert('儲存失敗：'+e.message); setStatus('err','儲存失敗'); }
  btn.disabled=false; btn.innerHTML='<i class="ti ti-plus"></i>新增';
}

async function removeEntry(acct,id){
  if(!confirm('確定刪除這筆資料？')) return;
  try {
    const res=await gsReq({action:'delete', id:String(id)});
    if(res.error) throw new Error(res.error);
    db[acct]=db[acct].filter(e=>e.id!==id);
    renderAcct(acct);
    setStatus('ok','已刪除');
  } catch(e){ alert('刪除失敗：'+e.message); }
}

  // ─── 💡【全新追加：行內編輯啟動器】 ───
function editRowInline(acct, id, btn) {
  const tr = document.getElementById(`row-${acct}-${id}`);
  if (!tr || tr.classList.contains('is-editing')) return;
  
  tr.classList.add('is-editing');
  
  // 先從 currentAddedEntries 找（本次新增），找不到再從 db（歷史資料）找
  const item = currentAddedEntries[acct].find(e => e.id === id)
            || db[acct].find(e => e.id === id);
  if (!item) return;

  const dateTd = tr.querySelector('.cell-date');
  const subjTd = tr.querySelector('.cell-subj');
  const noteTd = tr.querySelector('.cell-note');
  const incTd = tr.querySelector('.cell-inc');
  const expTd = tr.querySelector('.cell-exp');
  const actionTd = btn.parentElement;

  // 1. 基本字串變身輸入框
  dateTd.innerHTML = `<input type="text" class="edit-input-date" value="${storageToDisplay(item.date)}" placeholder="115/06/10" style="width:85px; padding:2px;">`;
  subjTd.innerHTML = `<input type="text" class="edit-input-subj" value="${item.subj}" style="width:100px; padding:2px;">`;
  noteTd.innerHTML = `<input type="text" class="edit-input-note" value="${item.note}" style="width:120px; padding:2px;">`;

  // 2. 💡【核心金額解鎖】根據原本是收入或支出，將金額轉為輸入框
  if (item.type === 'income') {
    incTd.innerHTML = `<input type="number" class="edit-input-amount" value="${item.amount}" inputmode="numeric" pattern="[0-9]*" style="width:80px; padding:2px; color:#28a745; font-weight:bold;">`;
    expTd.innerHTML = '<span class="mu">—</span>';
  } else {
    incTd.innerHTML = '<span class="mu">—</span>';
    expTd.innerHTML = `<input type="number" class="edit-input-amount" value="${item.amount}" inputmode="numeric" pattern="[0-9]*" style="width:80px; padding:2px; color:#dc3545; font-weight:bold;">`;
  }

  // 3. 按鈕變身
  actionTd.innerHTML = `
    <button class="btn success" style="padding:4px 8px; font-size:12px; background-color:#28a745; color:white; margin-right:4px;" onclick="saveRowInline('${acct}','${id}',this)"><i class="ti ti-check"></i> 儲存</button>
    <button class="btn" style="padding:4px 8px; font-size:12px; background-color:#6c757d; color:white;" onclick="renderAcct('${acct}')"><i class="ti ti-x"></i> 取消</button>
  `;
}

// ─── 💡【全新追加：行內編輯雲端儲存】 ───
async function saveRowInline(acct, id, btn) {
  const tr = document.getElementById(`row-${acct}-${id}`);
  if (!tr) return;

  const newDate = normalizeToStorage(tr.querySelector('.edit-input-date').value.trim());
  const newSubj = tr.querySelector('.edit-input-subj').value.trim();
  const newNote = tr.querySelector('.edit-input-note').value.trim();
  const newAmount = parseFloat(tr.querySelector('.edit-input-amount').value);

  if(!newDate || !newSubj) { alert('日期與科目不能留空！'); return; }
  if(isNaN(newAmount) || newAmount < 0) { alert('請輸入正確的金額！'); return; }

  btn.disabled = true; btn.innerHTML = '…';
  setStatus('loading', '雲端資料原地修改中...');

  try {
    const oldItem = currentAddedEntries[acct].find(e => e.id === id)
                 || db[acct].find(e => e.id === id);
    if (!oldItem) throw new Error("找不到原始資料");

    // 💡【正統調用】直接發送 edit 指令給後端，把所有新資料與原本的 ID 扔過去
    const res = await gsReq({
      action: 'edit', 
      id: String(id), // 帶入相同的 ID
      date: newDate, 
      subj: newSubj, 
      note: newNote || '', 
      type: TYPE_MAP[oldItem.type] || oldItem.type, 
      amount: String(newAmount), 
      acct: ACCT_META[acct].label
    });
    
    if(res.error) throw new Error(res.error);

    // 成功後，原地直接更新大倉庫 db 的內容，ID 完全不需要變更！
    [db[acct], currentAddedEntries[acct]].forEach(list => {
      const target = list.find(e => e.id === id);
      if (target) {
        target.date = newDate;
        target.subj = newSubj;
        target.note = newNote;
        target.amount = newAmount;
      }
    });

    // 重新排序並整理畫面
    sortEntries(db[acct]);
    renderAcct(acct);
    setStatus('ok', '資料修改成功！');
  } catch(e) {
    alert('修改失敗：' + e.message);
    setStatus('err', '修改失敗');
    renderAcct(acct);
  }
}
  
// ── Fixed (localStorage) ──────────────────────────────────
async function addFixed(){
  const month=document.getElementById('fx-month').value.trim();
  const key=document.getElementById('fx-key').value;
  const amount=parseFloat(document.getElementById('fx-amount').value);
  const note=document.getElementById('fx-note').value.trim();
  if(!month||isNaN(amount)){ alert('請填寫年月與金額'); return; }

  const btn = document.getElementById('fx-add-btn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader spin"></i>儲存中…';
  try {
    // 💡 寫入 Google Sheet：acct 固定為「定存特殊」，date=年月、subj=科目代碼(B/C/D/E)、type=收入(佔位)
    const res = await gsReq({
      action: 'add',
      date: month,
      subj: key,
      note: note || '',
      type: '收入',
      amount: String(amount),
      acct: '定存特殊'
    });
    if(res.error) throw new Error(res.error);

    db.fixed.push({ id: String(res.id), month, key, amount, note });
    db.fixed.sort((a,b)=>String(a.month||'').localeCompare(String(b.month||''))||String(a.key||'').localeCompare(String(b.key||'')));
    renderFixed();
    document.getElementById('fx-amount').value='';
    document.getElementById('fx-note').value='';
    setStatus('ok','已儲存');
  } catch(e){
    alert('儲存失敗：'+e.message);
    setStatus('err','儲存失敗');
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-plus"></i>新增';
}

async function removeFixed(id){
  const role = localStorage.getItem('beiji_user_role') || '一般';
  
  if (role === '會計') {
    // 會計：不能真正刪除，改為新增一筆負值沖銷記錄，並要求填寫原因
    const reason = prompt('請輸入沖銷原因（必填）：');
    if (reason === null) return; // 取消
    if (!reason.trim()) { alert('沖銷原因不能空白！'); return; }
    
    const target = db.fixed.find(e => e.id === id);
    if (!target) return;
    
    try {
      const res = await gsReq({
        action: 'add',
        date: target.month,
        subj: target.key,
        note: `【沖銷】${reason}`,
        type: '收入',
        amount: String(-target.amount),  // 負值沖銷
        acct: '定存特殊'
      });
      if(res.error) throw new Error(res.error);
      db.fixed.push({ id: String(res.id), month: target.month, key: target.key, amount: -target.amount, note: `【沖銷】${reason}` });
      db.fixed.sort((a,b)=>String(a.month||'').localeCompare(String(b.month||''))||String(a.key||'').localeCompare(String(b.key||'')));
      renderFixed();
      setStatus('ok','已新增沖銷記錄');
    } catch(e){
      alert('沖銷失敗：'+e.message);
      setStatus('err','沖銷失敗');
    }
    return;
  }
  
  // 管理員：可真正刪除
  if(!confirm('確定刪除？此動作無法復原。')) return;
  try {
    const res = await gsReq({ action: 'delete', id: String(id) });
    if(res.error) throw new Error(res.error);
    db.fixed = db.fixed.filter(e=>e.id!==id);
    renderFixed();
    setStatus('ok','已刪除');
  } catch(e){
    alert('刪除失敗：'+e.message);
    setStatus('err','刪除失敗');
  }
}

// ── Build account tab HTML ────────────────────────────────
function buildAcctTab(acct){
  const m=ACCT_META[acct];
  return `
    <div class="summary-row" id="${acct}-stats"></div>
    <div class="panel">
      <div class="panel-hdr">
        <span class="panel-title"><i class="ti ti-plus"></i>新增明細</span>
      </div>
      <div class="panel-body">
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));">
          <div class="fg" style="min-width:170px"><label>日期</label>${buildRocDatePicker(acct)}</div>
          <div class="fg" style="min-width:120px"><label>科目</label>${buildSubjSelect(acct)}</div>
          <div class="fg" style="min-width:120px"><label>摘要</label><input type="text" id="${acct}-note" placeholder="詳細說明" onkeydown="if(event.key==='Enter') addEntry('${acct}')"/></div>
          <div class="fg" style="min-width:60px">
            <label>類型</label>
            <div style="display:flex;align-items:center;height:34px;">
              <span id="${acct}-type-badge" class="type-badge unknown">—</span>
            </div>
            <input type="hidden" id="${acct}-type" value="expense"/>
          </div>
          <div class="fg"><label>金額</label><input type="number" id="${acct}-amount" placeholder="0" min="0" inputmode="numeric" pattern="[0-9]*" onkeydown="if(event.key==='Enter') addEntry('${acct}')"/></div>
          <div class="fg"><label>&nbsp;</label><button class="btn primary" id="${acct}-add-btn" onclick="addEntry('${acct}')"><i class="ti ti-plus"></i>新增</button></div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-hdr"><span class="panel-title"><i class="ti ti-list"></i>${m.label}明細</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:85px">日期</th>
            <th style="width:110px">科目</th>
            <th>摘要</th>
            <th style="width:105px">${m.incLabel}</th>
            <th style="width:105px">${m.expLabel}</th>
            <th style="width:110px">餘額</th>
            <th style="width:44px"></th>
          </tr></thead>
          <tbody id="${acct}-tbody"></tbody>
        </table>
      </div>
    </div>`;
}

ACCT_KEYS.forEach(a=>{
  document.getElementById('tab-'+a).innerHTML=buildAcctTab(a);
  setTimeout(() => onSubjChange(a), 0); // 渲染後立即初始化 badge
});

// ── Tabs ──────────────────────────────────────────────────
function switchTab(name){
  document.querySelectorAll('.tab-pane').forEach(p=>p.style.display='none');
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).style.display='';
  document.querySelector('[data-tab="'+name+'"]').classList.add('active');
  
  if(name==='report') {
    renderReport();
  } else if(ACCT_KEYS.includes(name)) {
    // 💡 修正：切換到記帳分頁時，先初始化當下新增陣列，並直接將畫面表格清空，等使用者記帳
    if (!currentAddedEntries[name]) currentAddedEntries[name] = [];
    renderAcct(name); 
  } else if(name==='fixed') {
    renderFixed();
  }
}

// ── Render Account ────────────────────────────────────────
function getMonths(acct){
  const s=new Set();
  db[acct].forEach(e=>{ const m=(e.date||'').slice(0,6); if(m) s.add(m); });
  return Array.from(s).sort();
}
function updateFilter(acct){
  const sel=document.getElementById(acct+'-filter');
  if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">全部月份</option>';
  getMonths(acct).forEach(m=>{
    const o=document.createElement('option');
    o.value=m; o.textContent=m; if(m===cur) o.selected=true;
    sel.appendChild(o);
  });
}
function renderAcct(acct){
  updateFilter(acct);
  
  // 1. 這是從 Google 試算表同步回來的「歷史現存明細大倉庫」
  const historyEntries = db[acct] || [];
  
  // 2. 這是使用者剛剛在網頁表單「畫面上新填寫、尚未儲存」的暫存項目
  const newAddedRows = currentAddedEntries[acct] || [];
  
  // ── 👑 核心手術 1：把「歷史現存」與「網頁新填」兩股資料合流 ──
  // 排除掉重複的 prev（期初）項目，確保只保留一份最源頭的期初
  const allEntriesToCalculate = [...historyEntries];
  newAddedRows.forEach(newRow => {
    // 避免重複加入
    if (!allEntriesToCalculate.some(h => h.id === newRow.id)) {
      allEntriesToCalculate.push(newRow);
    }
  });

  // ── 👑 核心手術 2：從頭到尾滾算流水帳 ──
  let running = 0;      // 流水動態結存
  let totalIn = 0;       // 本期(當月)收入
  let totalOut = 0;      // 本期(當月)支出
  let prevBal = 0;       // 上期結存（截至上個月底的累積結存）

  // 取得「本期」= 系統當前年月。db 中的 date 已統一為西元 YYYY/MM/DD
  const now = new Date();
  const curYearAD  = now.getFullYear();
  const curMonth   = now.getMonth() + 1; // 1~12
  function isCurrentMonth(dateStr) {
    const d = (dateStr || '').trim();
    const parts = d.split('/').map(s => parseInt(s, 10));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return false;
    return parts[1] === curMonth && parts[0] === curYearAD;
  }

  // 先把合併後的資料依照日期、ID排序，確保滾帳順序正確
  allEntriesToCalculate.sort((a, b) => {
    if (a.type === 'prev') return -1;
    if (b.type === 'prev') return 1;
    return (a.date || '').localeCompare(b.date || '');
  });

  // 開始撥算盤：running 為全歷史滾算結存（供明細表逐筆顯示用）
  // prevBal 則停在「進入本期之前」的最後結存值
  const finalDisplayRows = allEntriesToCalculate.map(e => {
    const enteringCurrentMonth = isCurrentMonth(e.date);
    if (e.type === 'prev') {
      running = e.amount;
      prevBal = e.amount;
    } else if (e.type === 'income') {
      if (!enteringCurrentMonth) {
        running += e.amount;
        prevBal = running; // 仍在本期之前 → 持續推進上期結存
      } else {
        running += e.amount;
        totalIn += e.amount; // 本期收入加總
      }
    } else if (e.type === 'expense') {
      if (!enteringCurrentMonth) {
        running -= e.amount;
        prevBal = running;
      } else {
        running -= e.amount;
        totalOut += e.amount; // 本期支出加總
      }
    }
    
    return {
      ...e,
      computedBalance: running // 記下這一筆結束時的精準結存
    };
  });

  // 本期結存 = 上期結存 + 本期收入 − 本期支出
  const currentBal = prevBal + totalIn - totalOut;

  // 3. 渲染上方四大統計卡片
  document.getElementById(acct+'-stats').innerHTML = `
    <div class="sum-card"><div class="sum-label"><i class="ti ti-arrow-bar-to-up"></i>上期結存</div><div class="sum-value b">${fmtMoney(prevBal)}</div></div>
    <div class="sum-card"><div class="sum-label"><i class="ti ti-trending-up"></i>本期收入</div><div class="sum-value g">${fmtMoney(totalIn)}</div></div>
    <div class="sum-card"><div class="sum-label"><i class="ti ti-trending-down"></i>本期支出</div><div class="sum-value r">${fmtMoney(totalOut)}</div></div>
    <div class="sum-card hl"><div class="sum-label"><i class="ti ti-wallet"></i>本期結存</div><div class="sum-value">${fmtMoney(currentBal)}</div></div>`;

  // 4. 下方明細表格渲染：只顯示「當月」資料（不含 prev 期初列）
  const currentMonthRows = finalDisplayRows.filter(e => e.type !== 'prev' && isCurrentMonth(e.date));
  const tbody = document.getElementById(acct+'-tbody');
  
  // 如果當月完全沒資料
  if (currentMonthRows.length === 0){
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ti ti-inbox"></i><p>本月尚無帳務明細資料</p></div></td></tr>`;
    return;
  }
  
  const role = localStorage.getItem('beiji_user_role') || window.userRole || '一般';

  // 5. 開始畫明細表格（只含當月，含即時滾算結存）
  tbody.innerHTML = currentMonthRows.map(r => {
    const isPrev = r.type === 'prev';
    const isIn = r.type === 'income';
    
    // 收入欄位顯示控制
    const inc = isPrev ? `<span class="mu" style="font-size:12px">結存</span>` : isIn ? `<span class="ni">${fmtMoney(r.amount)}</span>` : '<span class="mu">—</span>';
    // 支出欄位顯示控制
    const exp = (!isPrev && !isIn) ? `<span class="no">${fmtMoney(r.amount)}</span>` : '<span class="mu">—</span>';
    
    let actionButtons = '';
    if (role === '管理員') {
      actionButtons = `<button class="btn primary" style="padding:4px 8px;font-size:12px;margin-right:4px;" onclick="editRowInline('${acct}','${r.id}',this)"><i class="ti ti-edit"></i> 編輯</button><button style="padding:4px 8px;font-size:12px;background:#C0392B;color:#fff;border:1px solid #C0392B;border-radius:4px;cursor:pointer;" onclick="removeEntry('${acct}','${r.id}')"><i class="ti ti-trash"></i> 刪除</button>`;
    } else if (role === '會計') {
      actionButtons = `<button class="btn primary" style="padding:4px 8px;font-size:12px;" onclick="editRowInline('${acct}','${r.id}',this)"><i class="ti ti-edit"></i> 編輯</button>`;
    }

    // 💡 為了讓表格更好看，管家特別把精算出來的「即時結存(r.computedBalance)」顯示在金額後面，或者保持您原本的乾淨結構
    return `<tr class="${isPrev ? 'pr' : 'dr'}" id="row-${acct}-${r.id}">
      <td class="cell-date">${storageToDisplay(r.date) || ''}</td>
      <td class="cell-subj">${r.subj || ''}</td>
      <td class="cell-note mu">${r.note || '—'}</td>
      <td class="cell-inc">${inc}</td>
      <td class="cell-exp">${exp}</td>
      <td style="white-space: nowrap; text-align: right;">${actionButtons}</td>
    </tr>`;
  }).join('');
}

// ── Fixed ─────────────────────────────────────────────────
function renderFixed(){
  // 💡 同科目加總（而非後蓋前），確保多筆同科目記錄正確累計
  const totals={B:0,C:0,D:0,E:0};
  db.fixed.forEach(f=>{ if(totals[f.key]!==undefined) totals[f.key]+=f.amount; });
  const total=Object.values(totals).reduce((s,v)=>s+v,0);
  document.getElementById('fixed-stats').innerHTML=
    Object.keys(totals).map(k=>`<div class="sum-card"><div class="sum-label">${FIXED_LABELS[k]}</div><div class="sum-value b">${fmtMoney(totals[k])}</div></div>`).join('')+
    `<div class="sum-card hl"><div class="sum-label"><i class="ti ti-sigma"></i>小計</div><div class="sum-value">${fmtMoney(total)}</div></div>`;
  const tbody=document.getElementById('fx-tbody');
  if(db.fixed.length===0){tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><i class="ti ti-inbox"></i><p>尚無資料</p></div></td></tr>`;return;}
  tbody.innerHTML=db.fixed.map(f=>`
    <tr class="dr">
      <td>${f.month}</td><td>${FIXED_LABELS[f.key]||f.key}</td>
      <td><span class="np">${fmtMoney(f.amount)}</span></td>
      <td class="mu">${f.note||'—'}</td>
      <td><button class="btn danger" onclick="removeFixed('${f.id}')"><i class="ti ti-trash"></i></button></td>
    </tr>`).join('');
}

// ── Report ────────────────────────────────────────────────
function getAcctBal(acct){
  let r=0;
  db[acct].forEach(e=>{ if(e.type==='prev') r=e.amount; else if(e.type==='income') r+=e.amount; else r-=e.amount; });
  return r;
}
function getFixedLatest(){
  // 💡 同科目加總，避免多筆記錄被後蓋前
  const l={B:0,C:0,D:0,E:0};
  db.fixed.forEach(f=>{ if(l[f.key]!==undefined) l[f.key]+=f.amount; });
  return l;
}
// ── 補全 Report 渲染邏輯 ────────────────────────────────
// ─── 補全並優化月報總表 (覆蓋原本被截斷的地方) ─────────────────────────
function renderReport() {
  const RA = ['nonghu', 'taiqiye', 'lingyon'];
  const bals = {}; RA.forEach(a => { bals[a] = getAcctBal(a); });
  const A = Object.values(bals).reduce((s, v) => s + v, 0);
  const fixed = getFixedLatest(); 
  const { B, C, D, E } = fixed; 
  const grand = A + B + C + D + E;

  let html = `
    <div class="summary-row">
      <div class="sum-card hl"><div class="sum-label">總資產 (A+B+C+D+E)</div><div class="sum-value" style="font-size:22px">${fmtMoney(grand)}</div></div>
      <div class="sum-card"><div class="sum-label">流動現金 A（農會＋台企＋零用金）</div><div class="sum-value b">${fmtMoney(A)}</div></div>
    </div>
    <div class="report-grid">
      <div class="rcard">
        <div class="rcard-title">資產分佈明細</div>
        <div class="rrow"><span class="rl">農會儲簿</span><span class="rv">${fmtMoney(bals.nonghu)}</span></div>
        <div class="rrow"><span class="rl">台企儲簿</span><span class="rv">${fmtMoney(bals.taiqiye)}</span></div>
        <div class="rrow"><span class="rl">零用金</span><span class="rv">${fmtMoney(bals.lingyon)}</span></div>
        <div class="rrow" style="font-weight:700;border-top:1px solid var(--paper-dark);margin-top:4px;padding-top:4px;"><span class="rl">A 合計</span><span class="rv">${fmtMoney(A)}</span></div>
        <div class="divider"></div>
        <div class="rrow"><span class="rl">台企定期(B)</span><span class="rv">${fmtMoney(B)}</span></div>
        <div class="rrow"><span class="rl">農會定期(C)</span><span class="rv">${fmtMoney(C)}</span></div>
        <div class="rrow"><span class="rl">金龜現金(D)</span><span class="rv">${fmtMoney(D)}</span></div>
        <div class="rrow"><span class="rl">信徒借款(E)</span><span class="rv">${fmtMoney(E)}</span></div>
      </div>`;

  const stats = {}; RA.forEach(a => { stats[a] = monthStats(a); });
  const allMonths = [...new Set(RA.flatMap(a => Object.keys(stats[a])))].filter(Boolean).sort().reverse();

  html += allMonths.map(m => {
    const ns = stats.nonghu[m] || { in: 0, out: 0 };
    const ts = stats.taiqiye[m] || { in: 0, out: 0 };
    const ls = stats.lingyon[m] || { in: 0, out: 0 };
    return `
      <div class="rcard">
        <div class="rcard-title">${m} 月收支統計</div>
        <div class="rrow"><span class="rl">總收入</span><span class="rv ni">${fmtMoney(ns.in + ts.in + ls.in)}</span></div>
        <div class="rrow"><span class="rl">總支出</span><span class="rv no">${fmtMoney(ns.out + ts.out + ls.out)}</span></div>
        <div class="divider"></div>
        <div style="font-size:11px; color:var(--ink-soft)">分項：農會(+${Math.round(ns.in)}/-${Math.round(ns.out)}) | 台企(+${Math.round(ts.in)}/-${Math.round(ts.out)})</div>
      </div>`;
  }).join('') + `</div>`;

  document.getElementById('report-content').innerHTML = html;
}

function monthStats(acct) {
  const ms = {};
  db[acct].forEach(e => {
    const parts = (e.date || '').split('/');
    if (parts.length < 2) return;
    const rocYear = parseInt(parts[0], 10) - 1911;
    const m = `${rocYear}.${parts[1]}`; // 民國年.月，供畫面顯示用
    if (!ms[m]) ms[m] = { in: 0, out: 0 };
    if (e.type === 'income') ms[m].in += e.amount;
    else if (e.type === 'expense') ms[m].out += e.amount;
  });
  return ms;
}


// ── Query ─────────────────────────────────────────────────
// ─── 修正後的查詢函式：預設自動鎖定當月資料 ───
function runQuery(){
  let dateFromEl = document.getElementById('q-date-from');
  let dateToEl = document.getElementById('q-date-to');
  
  if (dateFromEl && dateToEl && !dateFromEl.value && !dateToEl.value) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const today = String(now.getDate()).padStart(2, '0');      
    
    dateFromEl.value = `${year}-${month}-01`;
    dateToEl.value = `${year}-${month}-${today}`;
  }

  const acctFilter = document.getElementById('q-acct').value;
  const typeFilter = document.getElementById('q-type').value;
  
  // 篩選用的起訖日期：input[type=date] 為 YYYY-MM-DD，轉成 YYYY/MM/DD 以對齊儲存格式
  const dateFrom = dateFromEl.value.trim().replace(/-/g, '/');
  const dateTo   = dateToEl.value.trim().replace(/-/g, '/');
  const keyword  = document.getElementById('q-keyword').value.trim().toLowerCase();
  
  let results = [];
  if (typeof ACCT_KEYS !== 'undefined' && typeof db !== 'undefined') {
    ACCT_KEYS.forEach(acct => {
      if (!db[acct]) return; 
      db[acct].forEach(e => {
        const acctLabel = ACCT_META[acct].label;
        if (acctFilter && acctLabel !== acctFilter) return;
        if (typeFilter && TYPE_MAP[e.type] !== typeFilter) return;
        
        // e.date 已統一為儲存格式 YYYY/MM/DD（西元），可直接字串比對
        const rawDate = normalizeToStorage(e.date);
        
        if (dateFrom && rawDate < dateFrom) return;
        if (dateTo && rawDate > dateTo) return;
        
        if (keyword) { 
          const h = ((e.subj || '') + (e.note || '')).toLowerCase(); 
          if (!h.includes(keyword)) return; 
        }
        
        // 💡 這裡把物件的 acct 英文代碼（如 lingyon）順便傳下去，等一下編輯按鈕需要用到
        results.push({ ...e, date: rawDate, acctLabel, acctKey: acct });
      });
    });
  }
  
  // 依日期排序
  results.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  
  const totalIn  = results.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const totalOut = results.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

  // 產生篩選條件說明文字
  const dateFromDisp = document.getElementById('q-date-from').value;
  const dateToDisp   = document.getElementById('q-date-to').value;
  const keywordDisp  = document.getElementById('q-keyword').value.trim();
  const acctFilter2  = document.getElementById('q-acct').value;
  let filterDesc = '';
  if (dateFromDisp || dateToDisp) filterDesc += `${dateFromDisp||'?'} ～ ${dateToDisp||'?'}`;
  if (acctFilter2) filterDesc += (filterDesc ? '　' : '') + acctFilter2;
  if (keywordDisp) filterDesc += (filterDesc ? '　' : '') + `「${keywordDisp}」`;
  const labelSuffix = filterDesc ? `<span style="font-size:10px;color:var(--ink-soft);font-weight:400;display:block;margin-top:2px;">${filterDesc}</span>` : '';

  document.getElementById('query-count').textContent = `共 ${results.length} 筆`;
  const statsEl = document.getElementById('query-stats');
  if (statsEl) {
    if (results.length > 0) {
      statsEl.style.display = 'grid';
      statsEl.innerHTML = `
        <div class="sum-card"><div class="sum-label"><i class="ti ti-trending-up"></i>收入合計${labelSuffix}</div><div class="sum-value g">${fmtMoney(totalIn)}</div></div>
        <div class="sum-card"><div class="sum-label"><i class="ti ti-trending-down"></i>支出合計${labelSuffix}</div><div class="sum-value r">${fmtMoney(totalOut)}</div></div>
        <div class="sum-card hl"><div class="sum-label"><i class="ti ti-calculator"></i>收支差額${labelSuffix}</div><div class="sum-value">${fmtMoney(totalIn - totalOut)}</div></div>`;
    } else { 
      statsEl.style.display = 'none'; 
    }
  }
  
  const tbody = document.getElementById('query-tbody');
  if (tbody) {
    if (results.length === 0) { 
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-search"></i><p>查無符合資料</p></div></td></tr>`; 
      return; 
    }
    
    // 💡 取得當前登入使用者的職稱權限
    const role = localStorage.getItem('beiji_user_role') || window.userRole || '一般';

    const typeTag = t => t === 'income' ? '<span class="tag in">收入</span>' : t === 'expense' ? '<span class="tag out">支出</span>' : '<span class="tag prev">結存</span>';
    
    tbody.innerHTML = results.map(r => {
      let actionButtons = '';
      if (role === '管理員') {
        actionButtons = `<button class="btn primary" style="padding:4px 8px;font-size:12px;margin-right:4px;" onclick="editRowInlineQuery('${r.acctKey}','${r.id}',this)"><i class="ti ti-edit"></i> 編輯</button><button style="padding:4px 8px;font-size:12px;background:#C0392B;color:#fff;border:1px solid #C0392B;border-radius:4px;cursor:pointer;" onclick="removeEntryFromQuery('${r.acctKey}','${r.id}')"><i class="ti ti-trash"></i> 刪除</button>`;
      } else if (role === '會計') {
        actionButtons = `<button class="btn primary" style="padding:4px 8px;font-size:12px;" onclick="editRowInlineQuery('${r.acctKey}','${r.id}',this)"><i class="ti ti-edit"></i> 編輯</button>`;
      } else {
        actionButtons = `<span class="mu">—</span>`;
      }

      // 💡 幫 <tr> 加上動態 ID (qrow-帳戶-明細ID)，並幫各個要編輯的欄位加上專屬 class
      return `
        <tr class="dr" id="qrow-${r.acctKey}-${r.id}">
          <td class="qcell-date" style="white-space:nowrap;">${storageToDisplay(r.date)}</td>
          <td class="mu" style="white-space:nowrap;">${r.acctLabel}</td>
          <td class="qcell-subj" style="white-space:nowrap;">${r.subj || ''}</td>
          <td class="qcell-note mu" style="white-space:nowrap;">${r.note || '—'}</td>
          <td style="white-space:nowrap;">${typeTag(r.type)}</td>
          <td class="qcell-amount" style="text-align: right; white-space:nowrap;"><span class="${r.type === 'income' ? 'ni' : r.type === 'expense' ? 'no' : 'mu'}">${fmtMoney(r.amount)}</span></td>
          <td style="white-space: nowrap; text-align: center;">${actionButtons}</td>
        </tr>`;
    }).join('');
  }
}


// ── 一鍵列印與匯出 PDF（終極優化版：黑白會計風、等寬簽名、自動跨頁重複標頭） ─────────────
function exportPDF() {
  const ACCT_LABELS = {nonghu:'農會儲簿', taiqiye:'台企儲簿', lingyon:'零用金（採購）', jijin:'基金會'};
  const RA = ['nonghu', 'taiqiye', 'lingyon'];
  const PAIR_LEFT = ['nonghu', 'taiqiye']; // 農會 + 台企 整合一頁

  // 1. 讀取目前查詢分頁選取的帳戶與日期區間
  const qAcctSelect = document.getElementById('q-acct') ? document.getElementById('q-acct').value : '';
  const qDateFromEl = document.getElementById('q-date-from');
  const qDateToEl   = document.getElementById('q-date-to');
  const dateFrom = qDateFromEl && qDateFromEl.value ? qDateFromEl.value.trim().replace(/-/g, '/') : '';
  const dateTo   = qDateToEl && qDateToEl.value ? qDateToEl.value.trim().replace(/-/g, '/') : '';

  const A = RA.reduce((s,a)=>s+getAcctBal(a),0);
  const fixed = getFixedLatest();
  const grand = A + Object.values(fixed).reduce((s,v)=>s+v,0);

  // 期間顯示：優先使用查詢分頁選擇的日期區間（與查詢同步）
  function toRocYMD(d){
    const parts = normalizeToStorage(d).split('/');
    if(parts.length<3) return d;
    return `${parseInt(parts[0],10)-1911}/${parts[1]}/${parts[2]}`;
  }
  let periodStr = '';
  if (dateFrom || dateTo) {
    periodStr = `${dateFrom ? toRocYMD(dateFrom) : '?'} ～ ${dateTo ? toRocYMD(dateTo) : '?'}`;
  } else {
    // 沒有指定區間時，回退顯示全部資料的最早～最晚月份
    let allDates=[];
    ACCT_KEYS.forEach(a=>{ db[a].forEach(e=>{ if(e.date) allDates.push(normalizeToStorage(e.date)); }); });
    allDates.sort();
    function toRocYM(d){
      const parts = d.split('/');
      if(parts.length<2) return d;
      return `${parseInt(parts[0],10)-1911}.${parts[1]}`;
    }
    periodStr = allDates.length
      ? (toRocYM(allDates[0]) + (toRocYM(allDates[0])!==toRocYM(allDates[allDates.length-1]) ? ' ～ '+toRocYM(allDates[allDates.length-1]) : ''))
      : '';
  }

  // 依日期區間篩選明細（與查詢分頁同步）
  function filterEntries(acct){
    return (db[acct] || []).filter(e => {
      const d = normalizeToStorage(e.date);
      if (e.type === 'prev') return true; // 上期結存列永遠保留
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }

  // 決定要輸出哪些帳戶
  let acctsToPrint = [];
  if (qAcctSelect === 'jijin' || qAcctSelect === '基金會') {
    acctsToPrint = ['jijin'];
  } else if (qAcctSelect && LABEL_TO_KEY[qAcctSelect]) {
    acctsToPrint = [LABEL_TO_KEY[qAcctSelect]];
  } else {
    acctsToPrint = ['nonghu','taiqiye','lingyon']; // 預設不含基金會
  }
  // 過濾掉沒有資料的帳戶
  acctsToPrint = acctsToPrint.filter(a => filterEntries(a).length > 0);

  // 2. 開始動態建構專門用來列印的 HTML 內容與精細 CSS 樣式
  let printContent = `
    <html>
    <head>
      <title>北極殿 帳務明細報表</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 15mm 12mm;
        }
        body {
          font-family: "Microsoft JhengHei", "Segoe UI", sans-serif;
          color: #000000;
          background: #ffffff;
          margin: 0;
          padding: 0;
          font-size: 11pt;
        }
        .report-page {
          page-break-after: always;
        }
        .report-page:last-child {
          page-break-after: avoid;
        }

        .title-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5px;
        }
        .main-title {
          font-size: 18pt;
          font-weight: bold;
          text-align: center;
          padding-bottom: 8px;
        }
        .subtitle-row td {
          font-size: 10.5pt;
          color: #333333;
          padding-bottom: 12px;
        }
        .acct-block-title {
          font-size: 12pt;
          font-weight: bold;
          margin: 10px 0 4px;
          border-bottom: 2px solid #000;
          padding-bottom: 3px;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        thead {
          display: table-header-group;
        }
        .data-table th {
          border-top: 2px solid #000000;
          border-bottom: 2px solid #000000;
          border-left: 1px solid #000000;
          border-right: 1px solid #000000;
          padding: 8px 4px;
          font-size: 10.5pt;
          font-weight: bold;
          background-color: #ffffff;
        }
        .data-table td {
          border: 1px solid #000000;
          padding: 7px 6px;
          font-size: 10pt;
          vertical-align: middle;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }

        .total-row td {
          font-weight: bold;
          border-top: 1px solid #000000;
          border-bottom: 4px double #000000;
        }

        .fixed-section {
          width: 100%;
          margin-bottom: 25px;
          font-size: 10.5pt;
        }
        .fixed-table {
          width: 60%;
          border-collapse: collapse;
          margin-top: 5px;
        }
        .fixed-table td {
          padding: 5px;
          border: none;
        }
        .grand-total {
          font-size: 11pt;
          font-weight: bold;
          margin-top: 10px;
          padding: 8px 0;
        }

        .sign-container {
          width: 100%;
          border-collapse: collapse;
          margin-top: 30px;
          page-break-inside: avoid;
        }
        .sign-box {
          width: 25%;
          border: 1px solid #000000;
          text-align: center;
          vertical-align: top;
          padding: 0;
        }
        .sign-title {
          font-size: 11pt;
          font-weight: bold;
          padding: 6px 0;
          border-bottom: 1px solid #000000;
        }
        .sign-space {
          height: 55px;
        }
        .footer-note {
          font-size: 9pt;
          font-style: italic;
          margin-top: 12px;
        }
      </style>
    </head>
    <body>
  `;

  // 渲染單一帳戶的「資料表格」（不含標題、簽名）
  function renderAcctTable(acct){
    const entries = filterEntries(acct);
    let html = `
       <table class="data-table">
          <thead>
            <tr>
              <th style="width: 12%;">日期</th>
              <th style="width: 18%;">科目</th>
              <th style="width: 38%;">摘要說明</th>
              <th style="width: 12%;">收入金額</th>
              <th style="width: 12%;">支出金額</th>
              <th style="width: 14%;">結存餘額</th>
            </tr>
          </thead>
          <tbody>
    `;
    let running = 0;
    entries.forEach(e => {
      let inc = '', exp = '';
      if (e.type === 'prev') { running = e.amount; inc = e.amount; }
      else if (e.type === 'income') { running += e.amount; inc = e.amount; }
      else { running -= e.amount; exp = e.amount; }

      html += `
        <tr>
          <td class="text-center">${storageToDisplay(e.date) || ''}</td>
          <td>${e.subj || ''}</td>
          <td>${e.note || ''}</td>
          <td class="text-right">${inc !== '' ? inc.toLocaleString('zh-TW') : ''}</td>
          <td class="text-right">${exp !== '' ? exp.toLocaleString('zh-TW') : ''}</td>
          <td class="text-right">${running.toLocaleString('zh-TW')}</td>
        </tr>
      `;
    });

    const totalIn  = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const totalOut = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

    html += `
          <tr class="total-row">
            <td colspan="3" class="text-right">本期合計 單位小計：</td>
            <td class="text-right">${totalIn > 0 ? totalIn.toLocaleString('zh-TW') : ''}</td>
            <td class="text-right">${totalOut > 0 ? totalOut.toLocaleString('zh-TW') : ''}</td>
            <td class="text-right">${running.toLocaleString('zh-TW')}</td>
          </tr>
        </tbody>
      </table>
    `;
    return html;
  }

  function renderHeader(acctLabel){
    return `
        <table class="title-table">
          <tr><td class="main-title">北極殿 帳務明細報表</td></tr>
          <tr class="subtitle-row">
            <td>
              <table style="width:100%;">
                <tr>
                  <td style="width:30%;"><b>帳戶：</b>${acctLabel}</td>
                  <td style="width:40%; text-align:center;"><b>期間：</b>${periodStr}</td>
                  <td style="width:30%; text-align:right;"><b>製表日：</b>${new Date().toLocaleDateString('zh-TW')}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
    `;
  }

  // 定存／特殊科目區塊（只會輸出一次）
  function renderFixedSection(){
    const noteMap = {};
    db.fixed.forEach(f => {
      if (!noteMap[f.key]) noteMap[f.key] = '';
      noteMap[f.key] += (noteMap[f.key] ? '、' : '') + f.note;
    });
    // A 值 = 農會 + 台企 + 零用金
    const aVal = RA.reduce((s,a) => s + getAcctBal(a), 0);
    const bVal = fixed['B']||0;
    const cVal = fixed['C']||0;
    const dVal = fixed['D']||0;
    const eVal = fixed['E']||0;
    return `
        <div class="fixed-section">
          <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
            <tr>
              <td style="width:50%; vertical-align:top;">
                <div style="font-weight:bold; border-bottom:1px solid #000; padding-bottom:3px; margin-bottom:6px;">■ 流動資金（A）</div>
                <table style="width:100%; border-collapse:collapse;">
                  <tr><td>農會儲簿</td><td style="text-align:right;">${getAcctBal('nonghu').toLocaleString('zh-TW')}</td></tr>
                  <tr><td>台企儲簿</td><td style="text-align:right;">${getAcctBal('taiqiye').toLocaleString('zh-TW')}</td></tr>
                  <tr><td>零用金（採購）</td><td style="text-align:right;">${getAcctBal('lingyon').toLocaleString('zh-TW')}</td></tr>
                  <tr style="font-weight:bold; border-top:1px solid #000;"><td>A 合計</td><td style="text-align:right;">${aVal.toLocaleString('zh-TW')}</td></tr>
                </table>
              </td>
              <td style="width:4%;"></td>
              <td style="width:46%; vertical-align:top;">
                <div style="font-weight:bold; border-bottom:1px solid #000; padding-bottom:3px; margin-bottom:6px;">■ 定期存款與特殊科目</div>
                <table style="width:100%; border-collapse:collapse;">
                  <tr><td>台企定期（B）</td><td>${noteMap['B'] || ''}</td><td style="text-align:right;">${bVal.toLocaleString('zh-TW')}</td></tr>
                  <tr><td>農會定期（C）</td><td>${noteMap['C'] || ''}</td><td style="text-align:right;">${cVal.toLocaleString('zh-TW')}</td></tr>
                  <tr><td>金龜現金（D）</td><td>${noteMap['D'] || ''}</td><td style="text-align:right;">${dVal.toLocaleString('zh-TW')}</td></tr>
                  <tr><td>信徒借款（E）</td><td>${noteMap['E'] || ''}</td><td style="text-align:right;">${eVal.toLocaleString('zh-TW')}</td></tr>
                </table>
              </td>
            </tr>
          </table>
          <div class="grand-total" style="border-top:2px solid #000; padding-top:6px;">
            A（${aVal.toLocaleString('zh-TW')}）＋ B（${bVal.toLocaleString('zh-TW')}）＋ C（${cVal.toLocaleString('zh-TW')}）＋ D（${dVal.toLocaleString('zh-TW')}）＋ E（${eVal.toLocaleString('zh-TW')}）＝ ${grand.toLocaleString('zh-TW')} 元
          </div>
        </div>
    `;
  }

  // 簽名欄區塊（只會輸出一次）
  function renderSignSection(isJijin){
    let t1 = isJijin ? '基金會董事長' : '主 委 ';
    let t2 = isJijin ? '基金會監事' : '監 委 ';
    let t3 = isJijin ? '基金會出納' : '出 納 ';
    let t4 = isJijin ? '基金會會計' : '會 計 ';
    return `
        <table class="sign-container">
          <tr>
            <td class="sign-box"><div class="sign-title">${t1}</div><div class="sign-space"></div></td>
            <td class="sign-box"><div class="sign-title">${t2}</div><div class="sign-space"></div></td>
            <td class="sign-box"><div class="sign-title">${t3}</div><div class="sign-space"></div></td>
            <td class="sign-box"><div class="sign-title">${t4}</div><div class="sign-space"></div></td>
          </tr>
        </table>
    `;
  }

  // 3. 開始分頁產出
  const isJijinOnly = acctsToPrint.length === 1 && acctsToPrint[0] === 'jijin';

  if (isJijinOnly) {
    // 基金會：獨立一頁，含定存區與專屬簽名
    printContent += `
      <div class="report-page">
        ${renderHeader('基金會')}
        ${renderAcctTable('jijin')}
        ${renderSignSection(true)}
      </div>
    `;
  } else {
    // 一般帳戶：依序輸出，最後一頁附上定存區與簽名（只出現一次）
    const pages = [];

    // 第一頁：農會 + 台企 整合
    const pairAccts = PAIR_LEFT.filter(a => acctsToPrint.includes(a));
    if (pairAccts.length > 0) {
      let pageHtml = renderHeader(pairAccts.map(a=>ACCT_LABELS[a]).join('、'));
      pairAccts.forEach(a => {
        pageHtml += `<div class="acct-block-title">${ACCT_LABELS[a]}</div>`;
        pageHtml += renderAcctTable(a);
      });
      pages.push(pageHtml);
    }

    // 其餘帳戶（如零用金）各自一頁
    acctsToPrint.filter(a => !PAIR_LEFT.includes(a)).forEach(a => {
      let pageHtml = renderHeader(ACCT_LABELS[a]);
      pageHtml += renderAcctTable(a);
      pages.push(pageHtml);
    });

    if (pages.length === 0) {
      pages.push(renderHeader('（無資料）') + '<p style="text-align:center;color:#999;">查詢區間內無資料</p>');
    }

    // 將定存區與簽名欄附加在最後一頁
    pages[pages.length - 1] += renderFixedSection() + renderSignSection(false);

    pages.forEach(p => {
      printContent += `<div class="report-page">${p}</div>`;
    });
  }

  printContent += `</body></html>`;

  // 4. 啟動瀏覽器原生印表機視窗（直接另存為 PDF）
  const printWindow = window.open('', '_blank');
  printWindow.document.write(printContent);
  printWindow.document.close();

  printWindow.setTimeout(function() {
    printWindow.print();
    printWindow.close();
  }, 350);
}

  async function submitLogin() {
  const user = document.getElementById('login-user').value;
  const pwd = document.getElementById('login-pwd').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-err');

  if (!user || !pwd) {
    err.innerText = "請輸入帳號與密碼";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2 animate-spin"></i> 驗證中...';
  err.innerText = "";

  try {
    // 呼叫後端 GAS
    const res = await gsReq({ action: 'login', username: user, password: pwd });

    if (res.success) {
      // 1. 驗證成功，移除登入遮罩，讓後方主畫面露出來
      document.getElementById('login-overlay').style.display = 'none';
      
      // 2. 改用 localStorage：重新整理或關閉分頁後仍維持登入狀態
      window.userRole = res.role;
      localStorage.setItem('beiji_logged_in', 'true');
      localStorage.setItem('beiji_logged_user', user);   // ← 儲存帳號
      localStorage.setItem('beiji_user_role', res.role);
      localStorage.setItem('userRole', res.role);
      
      console.log("登入成功，角色為:", res.role);

      // 3. 強制通知系統「立刻重新檢查並套用權限」
      if (typeof applyRolePermissions === 'function') {
        applyRolePermissions();
      }
      
      // 4. 如果系統有需要重新載入或初始化的動作，就在這裡順便執行
      if (typeof initializeSystem === 'function') {
        initializeSystem();
      }
    } else {
      err.innerText = res.message || "帳號或密碼錯誤";
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-login"></i> 安全登入';
    }
  } catch (e) {
    console.error(e);
    err.innerText = "連線異常，請確認 GAS 是否已發布";
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i> 安全登入';
  }
}

// ─── 修改後的權限套用函式 ─────────────────────────────────────
function applyRolePermissions() {
  const role = localStorage.getItem('beiji_user_role') || window.userRole || '一般';
  console.log("正在套用權限，當前角色為:", role);
  
  // 1. 還原所有分頁按鈕顯示狀態
  const allTabs = document.querySelectorAll('.tabs-bar .tab-btn');
  allTabs.forEach(btn => btn.style.display = '');

  // 2. 還原網頁中所有可能被禁用的輸入框與按鈕（每次切換權限時先重設）
  document.querySelectorAll('.btn-save, .btn-add, #btn-add, button[type="submit"]').forEach(el => el.removeAttribute('disabled'));
  
  // 清除上一次的強制隱藏樣式
  injectTemplateStyles('');

  // ═══ 情況 A：一般訪客（最高機密防線：只能查，絕不能動） ═════════════════════════════
  if (role === '一般') {
    // 🔒 防線 1：只准保留 'query' (查詢) 分頁，其他分頁一律消失
    allTabs.forEach(btn => {
      const tab = btn.getAttribute('data-tab') || '';
      if (tab !== 'query') btn.style.display = 'none';
    });

    // 🔒 防線 2：強制用 CSS 徹底蒸發所有「新增區、表單、儲存按鈕」
    // 💡 請根據您實際網頁的 class/id 調整，管家把最常見的通通寫進去雙重鎖死！
    const guestForbiddenStyles = `
      /* 隱藏任何新增記錄、帳務輸入、明細填寫的區塊 */
      .input-panel, .form-panel, #input-section, .panel-body,
      /* 隱藏任何主畫面的「新增」、「儲存」按鈕 */
      .btn-add, .btn-save, #btn-add, button[type="submit"],
      /* 隱藏查詢列表裡可能出現的「修改」與「刪除」小圖示按鈕 */
      .btn-edit, .btn-delete, .action-btns, td .ti-pencil, td .ti-trash 
      { display: none !important; }
    `;
    injectTemplateStyles(guestForbiddenStyles);

    // 🔒 防線 3：JavaScript 實體鎖死（防止懂網頁的人改 CSS 偷按）
    // 找到畫面上所有的新增與儲存按鈕，直接將它們從功能上 disabled 禁用！
    setTimeout(() => {
      document.querySelectorAll('.btn-save, .btn-add, #btn-add, button[type="submit"]').forEach(el => {
        el.setAttribute('disabled', 'true');
      });
    }, 100);

  // ═══ 情況 B：會計人員（唯獨「不能刪除」） ══════════════════════════════════════
  } else if (role === '會計') {
    // 🔒 防線：能進所有分頁，但全面隱藏並禁用所有「刪除」按鈕（防止誤刪歷史大帳）
    const accForbiddenStyles = `
      .btn-delete, #btn-delete, td .ti-trash { display: none !important; }
    `;
    injectTemplateStyles(accForbiddenStyles);

    setTimeout(() => {
      document.querySelectorAll('.btn-delete, #btn-delete').forEach(el => {
        el.setAttribute('disabled', 'true');
      });
    }, 100);

  // ═══ 情況 C：管理員（全功能至高無上） ═════════════════════════════════════════
  } else if (role === '管理員') {
    // 什麼都不用鎖，全功能暢通無阻
    injectTemplateStyles('');
  }
}

// 輔助函式：確保樣式注入不會蓋掉主畫面
function injectTemplateStyles(cssText) {
  let styleEl = document.getElementById('role-style-override');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'role-style-override';
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = cssText;
}

// ─── 修正後的系統初始化函式 (強迫等待雲端同步完成，再開放查詢) ───
async function initializeSystem() {
  // 1. 先確認並套用最高權限
  applyRolePermissions(); 

  // 2. 載入定存快取 (如果原本系統有這個函式)
  if (typeof loadFixed === 'function') loadFixed(); 
  
  // 3. 同步雲端帳簿明細 + 科目清單（各自獨立，互不影響）
  if (typeof loadFromGS === 'function') {
    setStatus('loading', '雲端資料同步中...');

    // 兩者並行，但各自的成敗互不干擾
    const success = await loadFromGS();
    loadSubjects(); // 科目清單失敗只是用預設值，不阻斷流程，不用 await

    if (success) {
      setStatus('ok', '同步完成');
      // 問題2：查詢分頁移到最後，預設開啟零用金分頁
      const role = localStorage.getItem('beiji_user_role') || '一般';
      const defaultTab = role === '一般' ? 'query' : 'lingyon';
      switchTab(defaultTab);
      if (defaultTab === 'query' && typeof runQuery === 'function') {
        runQuery();
      }
    } else {
      setStatus('err', '雲端同步失敗');
      alert('同步雲端資料失敗，請確認網路或重新整理網頁。');
    }
  }
}

// ─── 修改：具有權限檢查功能的 Tab 切換 ─────────────────────────
function switchTab(name) {
  const role = localStorage.getItem('beiji_user_role') || '一般';
  if (role === '一般' && name !== 'query' && name !== 'report') {
    alert('您的權限層級無法存取記帳功能。');
    return;
  }
  document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  
  const targetPane = document.getElementById('tab-' + name);
  const targetBtn = document.querySelector(`[data-tab="${name}"]`);
  if (targetPane) targetPane.style.display = '';
  if (targetBtn) targetBtn.classList.add('active');
  
  if (name === 'report') renderReport();
  else if (ACCT_KEYS.includes(name)) renderAcct(name);
  else if (name === 'fixed') renderFixed();
}

  // ─── 💡【全新追加：查詢分頁行內編輯啟動】 ───
function editRowInlineQuery(acctKey, id, btn) {
  const tr = document.getElementById(`qrow-${acctKey}-${id}`);
  if (!tr || tr.classList.contains('is-editing')) return;
  
  tr.classList.add('is-editing');
  
  // 從 db 全域大倉庫撈出歷史原始資料
  const item = db[acctKey].find(e => e.id === id);
  if (!item) return;

  const dateTd = tr.querySelector('.qcell-date');
  const subjTd = tr.querySelector('.qcell-subj');
  const noteTd = tr.querySelector('.qcell-note');
  const amountTd = tr.querySelector('.qcell-amount');
  const actionTd = btn.parentElement;

  // 歷史資料所有欄位解鎖變輸入框
  dateTd.innerHTML = `<input type="text" class="qedit-input-date" value="${storageToDisplay(item.date)}" placeholder="115/06/10" style="width:85px; padding:2px;">`;
  subjTd.innerHTML = `<input type="text" class="qedit-input-subj" value="${item.subj}" style="width:100px; padding:2px;">`;
  noteTd.innerHTML = `<input type="text" class="qedit-input-note" value="${item.note}" style="width:120px; padding:2px;">`;
  amountTd.innerHTML = `<input type="number" class="qedit-input-amount" value="${item.amount}" inputmode="numeric" pattern="[0-9]*" style="width:80px; padding:2px; text-align:right;">`;

  actionTd.innerHTML = `
    <button class="btn success" style="padding:4px 8px; font-size:12px; background-color:#28a745; color:white; margin-right:4px;" onclick="saveRowInlineQuery('${acctKey}','${id}',this)"><i class="ti ti-check"></i> 儲存</button>
    <button class="btn" style="padding:4px 8px; font-size:12px; background-color:#6c757d; color:white;" onclick="if(typeof runQuery === 'function') runQuery();"><i class="ti ti-x"></i> 取消</button>
  `;
}

// ─── 💡【全新追加：查詢分頁同步雲端儲存】 ───
async function saveRowInlineQuery(acctKey, id, btn) {
  const tr = document.getElementById(`qrow-${acctKey}-${id}`);
  if (!tr) return;

  const newDate = normalizeToStorage(tr.querySelector('.qedit-input-date').value.trim());
  const newSubj = tr.querySelector('.qedit-input-subj').value.trim();
  const newNote = tr.querySelector('.qedit-input-note').value.trim();
  const newAmount = parseFloat(tr.querySelector('.qedit-input-amount').value);

  if(!newDate || !newSubj) { alert('日期與科目不能留空！'); return; }
  if(isNaN(newAmount) || newAmount < 0) { alert('請輸入正確的金額！'); return; }

  btn.disabled = true; btn.innerHTML = '…';
  setStatus('loading', '雲端歷史資料修改中...');

  try {
    const oldItem = db[acctKey].find(e => e.id === id);
    if (!oldItem) throw new Error("找不到原始資料");

    // 直接發送 edit 指令給我們最新的後端 GAS，原地修改
    const res = await gsReq({
      action: 'edit', 
      id: String(id),
      date: newDate, 
      subj: newSubj, 
      note: newNote || '', 
      type: TYPE_MAP[oldItem.type] || oldItem.type, 
      amount: String(newAmount), 
      acct: ACCT_META[acctKey].label
    });
    
    if(res.error) throw new Error(res.error);

    // 成功後，更新前端 db 大資料庫中的歷史資料
    if (oldItem) {
      oldItem.date = newDate;
      oldItem.subj = newSubj;
      oldItem.note = newNote;
      oldItem.amount = newAmount;
    }
    
    // 重新排序大倉庫
    sortEntries(db[acctKey]);

    // 💡 關鍵：重新觸發一次查詢，讓畫面上的表格和統計數字即時刷新！
    if (typeof runQuery === 'function') runQuery();
    
    setStatus('ok', '歷史資料修改成功！');
  } catch(e) {
    alert('歷史修改失敗：' + e.message);
    setStatus('err', '修改失敗');
    if (typeof runQuery === 'function') runQuery();
  }
}
  
// ─── 查詢分頁專用刪除函式（管理員專屬）────────────────────────────────
async function removeEntryFromQuery(acctKey, id) {
  if (!confirm('確定要刪除這筆資料？此動作無法復原。')) return;
  setStatus('loading', '刪除中…');
  try {
    const res = await gsReq({ action: 'delete', id: String(id) });
    if (res.error) throw new Error(res.error);
    db[acctKey] = db[acctKey].filter(e => e.id !== id);
    if (currentAddedEntries[acctKey]) {
      currentAddedEntries[acctKey] = currentAddedEntries[acctKey].filter(e => e.id !== id);
    }
    setStatus('ok', '已刪除');
    if (typeof runQuery === 'function') runQuery();
  } catch(e) {
    alert('刪除失敗：' + e.message);
    setStatus('err', '刪除失敗');
  }
}

// ─── 修正：網頁初始化守衛 (解決網頁重新整理資料遺失的問題) ──────────────
// ─── 登出：清除登入狀態，重整後回到登入畫面 ──────────────────────────
function logoutUser() {
  if (!confirm('確定要登出嗎？')) return;
  localStorage.removeItem('beiji_logged_in');
  localStorage.removeItem('beiji_logged_user');
  localStorage.removeItem('beiji_user_role');
  localStorage.removeItem('userRole');
  window.location.reload();
}

window.onload = async function() {
  const isAuthed = localStorage.getItem('beiji_logged_in');
  if (isAuthed === 'true') {
    document.getElementById('login-overlay').style.display = 'none';
    await initializeSystem();
  } else {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('login-user').focus();
  }
};

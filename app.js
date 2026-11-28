'use strict';
/* ================= أدوات عامة ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const curMonth = () => today().slice(0, 7);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const num = v => { const n = parseFloat(String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); return isNaN(n) ? 0 : n; };
const money = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US') + ' ج.م';
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const monthName = m => { const [y, mm] = m.split('-'); return ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'][+mm - 1] + ' ' + y; };
function toast(msg, er) { const t = $('#toast'), d = document.createElement('div'); d.textContent = msg; if (er) d.className = 'er'; t.appendChild(d); setTimeout(() => d.remove(), er ? 3500 : 2200); }
function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function intlPhone(phone) { let p = String(phone || '').replace(/\D/g, ''); if (!p) return ''; if (p.startsWith('00')) p = p.slice(2); else if (p.startsWith('0')) p = '20' + p.slice(1); else if (p.length === 10 && p[0] === '1') p = '20' + p; return p; }
function waLink(phone, text) { const p = intlPhone(phone); if (!p) return ''; return 'https://wa.me/' + p + (text ? '?text=' + encodeURIComponent(text) : ''); }
const mins = h => { const [a, b] = String(h || '').split(':').map(Number); return isNaN(a) ? null : a * 60 + (b || 0); };
function fill(tpl, o) { return String(tpl || '').replace(/\[\[(\w+)\]\]/g, (_, k) => o[k] ?? ''); }
const libs = {};
function loadLib(url) { return libs[url] || (libs[url] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = () => rej(new Error('lib')); document.head.appendChild(s); })); }

/* ================= قاعدة البيانات المحلية (IndexedDB) ================= */
const SYNC = ['years', 'groups', 'students', 'attendance', 'exams', 'scores', 'payments', 'expenses', 'settings', 'closings', 'courses', 'enrolls', 'outbox'];
const TABLES = [...SYNC, 'snapshots', 'legacy', 'kv', 'pq'];
const mem = {};
let idb, dirty = false;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('edu-center', 3);
    r.onupgradeneeded = () => TABLES.forEach(t => { if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t, { keyPath: 'id' }); });
    r.onsuccess = () => { idb = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
function loadAll() {
  return Promise.all(TABLES.map(t => new Promise(res => {
    const q = idb.transaction(t).objectStore(t).getAll();
    q.onsuccess = () => { mem[t] = new Map(q.result.map(x => [x.id, x])); res(); };
  })));
}
/* ---- المراحل: فلتر شامل (لكل تبويب متصفح مرحلته) ---- */
let STAGE = ''; try { const u = new URLSearchParams(location.search).get('stage'); if (u !== null) sessionStorage.setItem('stage', u); STAGE = sessionStorage.getItem('stage') || ''; } catch (e) { }
const allRaw = t => [...mem[t].values()].filter(r => !r.deleted);
const stOf = id => mem.students.get(id)?.yearId;
const STAGE_F = {
  students: r => r.yearId === STAGE, groups: r => r.yearId === STAGE, expenses: r => r.yearId === STAGE, courses: r => r.yearId === STAGE,
  exams: r => r.yearId ? r.yearId === STAGE : (r.groupId ? mem.groups.get(r.groupId)?.yearId === STAGE : false),
  attendance: r => stOf(r.studentId) === STAGE, payments: r => stOf(r.studentId) === STAGE, scores: r => stOf(r.studentId) === STAGE,
  enrolls: r => mem.courses.get(r.courseId)?.yearId === STAGE || stOf(r.studentId) === STAGE, closings: r => !r.yearId || r.yearId === STAGE
};
const all = t => { const l = allRaw(t); return STAGE && STAGE_F[t] ? l.filter(STAGE_F[t]) : l; };
const get = (t, id) => { const r = mem[t].get(id); return r && !r.deleted ? r : null; };
function save(t, rec, o = {}) {
  if (!o.keep) rec.updatedAt = Date.now();
  if (STAGE && !rec.yearId && !mem[t].has(rec.id) && ['students', 'groups', 'expenses', 'exams', 'courses', 'closings'].includes(t)) rec.yearId = STAGE;
  mem[t].set(rec.id, rec);
  idb.transaction(t, 'readwrite').objectStore(t).put(rec);
  if (SYNC.includes(t)) { dirty = true; if (!o.noSync) cloud.push(t, rec); }
  return rec;
}
function remove(t, id) { if (!canDelete(t)) return deniedMsg(); const r = mem[t].get(id); if (r) { r.deleted = true; save(t, r); } }
function bulkSave(t, recs, o = {}) {
  const tx = idb.transaction(t, 'readwrite'), st = tx.objectStore(t), now = Date.now();
  recs.forEach(r => { if (!o.keep) r.updatedAt = now; mem[t].set(r.id, r); st.put(r); });
  if (SYNC.includes(t)) dirty = true;
  return new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
}
function hardDelete(t, id) { mem[t].delete(id); idb.transaction(t, 'readwrite').objectStore(t).delete(id); }

/* ================= الإعدادات ================= */
const DEF = {
  id: 'main', center: 'اسم السنتر', teacher: '', fee: 0, share: 0, speak: false,
  tplPresent: 'تم تسجيل حضور الطالب [[name]] اليوم [[date]] الساعة [[time]] ✅',
  tplAbsent: 'نفيدكم بغياب الطالب [[name]] عن حصة اليوم [[date]]. برجاء التواصل معنا.',
  tplPay: 'تم استلام مبلغ [[amount]] اشتراك شهر [[month]] للطالب [[name]]. شكرًا لكم.',
  tplDue: 'تذكير: اشتراك شهر [[month]] للطالب [[name]] لم يُسدد بعد (المتبقي [[amount]]).'
};
const SECRET_KEYS = ['waSecret', 'platKey'];
const secrets = () => { try { return JSON.parse(localStorage.getItem('secrets') || '{}'); } catch (e) { return {}; } };
const S = () => ({ ...DEF, ...(mem.settings.get('main') || {}), ...secrets() });
const setS = p => {
  const sec = secrets(), pub = {}; Object.entries(p).forEach(([k, v]) => { if (SECRET_KEYS.includes(k)) sec[k] = v; else pub[k] = v; });
  try { localStorage.setItem('secrets', JSON.stringify(sec)); } catch (e) { }
  const cur = { ...(mem.settings.get('main') || {}) }; SECRET_KEYS.forEach(k => delete cur[k]);
  save('settings', { ...DEF, ...cur, ...pub });
};
/* ---- الأدوار: مدرس / مساعد ---- */
let ROLE = 'teacher';
const isTeacher = () => ROLE === 'teacher';
const canDelete = t => ROLE === 'teacher' || (S().asstFix === true && (t === 'attendance' || t === 'scores'));
const DEL_WORDS = /^(حذف|إلغاء الوصل|مسح|استعادة|استيراد|استبدال|إفراغ)/;
const deniedMsg = () => toast('🔒 المسح للمدرس فقط', true);

/* ================= دوال المجال ================= */
const activeStudents = () => all('students').filter(s => s.active !== false);
const yearName = id => get('years', id)?.name || '';
const groupName = id => get('groups', id)?.name || '';
const feeOf = s => { const g = get('groups', s.groupId), yc = (S().yearCfg || {})[s.yearId || g?.yearId] || {}, base = num(g?.fee) || num(yc.fee) || num(S().fee); return Math.round(base * (1 - Math.min(100, num(yc.disc)) / 100) * (1 - Math.min(100, num(s.disc)) / 100)); };
const paidSum = (sid, month) => all('payments').filter(p => p.studentId === sid && p.month === month && p.type !== 'other').reduce((a, p) => a + num(p.amount), 0);
const payState = (s, month) => { const fee = feeOf(s), paid = paidSum(s.id, month); if (fee <= 0) return { k: 'na', t: 'بدون رسوم', fee, paid }; if (paid >= fee) return { k: 'ok', t: 'مدفوع', fee, paid }; if (paid > 0) return { k: 'wa', t: 'جزئي', fee, paid }; return { k: 'er', t: 'غير مدفوع', fee, paid }; };
function nextCode() { let m = 1000; allRaw('students').forEach(s => { const n = parseInt(s.code); if (!isNaN(n) && n > m && n < 1e9) m = n; }); return String(m + 1); }
function nextReceipt() { const s = S(), n = (s.receiptNo || 0) + 1; setS({ receiptNo: n }); return n; }
const optList = (arr, sel, ph) => (ph !== undefined ? `<option value="">${esc(ph)}</option>` : '') + arr.map(o => `<option value="${esc(o.v)}"${o.v === sel ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
const yearOpts = (sel, ph) => optList(all('years').sort((a, b) => (a.order || 0) - (b.order || 0)).map(y => ({ v: y.id, t: y.name })), sel, ph);
const groupOpts = (sel, ph) => optList(all('groups').map(g => ({ v: g.id, t: g.name + (g.yearId ? ' — ' + yearName(g.yearId) : '') })), sel, ph);

/* ================= النوافذ والنماذج ================= */
let modalBtns = [], modalCleanup = null;
function modal(title, body, btns = []) {
  closeModal();
  $('#modal').innerHTML = `<div class="ov"><div class="box"><div class="mh"><b>${title}</b><button class="x" data-act="closeM">✕</button></div><div class="mb">${body}</div>${btns.length ? `<div class="mf">${btns.map((b, i) => (!isTeacher() && DEL_WORDS.test(String(b.t).replace(/<[^>]*>/g, '').trim()) && b.cls === 'er') ? '' : `<button class="btn ${b.cls || ''}" data-mb="${i}">${b.t}</button>`).join('')}</div>` : ''}</div></div>`;
  modalBtns = btns;
  const f = $('#modal input:not([type=hidden]),#modal select'); if (f && !/Mobi/i.test(navigator.userAgent)) f.focus();
}
function closeModal() { if (modalCleanup) { modalCleanup(); modalCleanup = null; } $('#modal').innerHTML = ''; modalBtns = []; }
function formData() { const o = {}; $$('#modal [name]').forEach(e => { o[e.name] = e.type === 'checkbox' ? e.checked : e.value.trim(); }); return o; }
const fld = (label, name, val = '', type = 'text', extra = '') => `<div class="f"><label>${label}</label><input name="${name}" id="${name}" type="${type}" value="${esc(val)}" ${extra}></div>`;
const sel = (label, name, opts) => `<div class="f"><label>${label}</label><select name="${name}">${opts}</select></div>`;
function confirmBox(msg, fn, label = 'تأكيد') { if (!isTeacher() && DEL_WORDS.test(String(msg).replace(/<[^>]*>/g, '').trim()) && !/^(حذف|مسح).*(علامة|درجة)/.test(String(msg).trim())) return deniedMsg(); modal('تأكيد', `<p>${msg}</p>`, [{ t: 'إلغاء', cls: 'ghost', fn: closeModal }, { t: label, cls: 'er', fn: () => { closeModal(); fn(); } }]); }

/* ================= الطباعة ================= */
async function renderCodes(root) {
  const qrs = $$('.qr', root), bcs = $$('.bc', root);
  if (qrs.length) { try { await loadLib('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'); qrs.forEach(el => { el.innerHTML = ''; new QRCode(el, { text: el.dataset.v, width: 84, height: 84 }); }); } catch (e) { qrs.forEach(el => el.textContent = el.dataset.v); } }
  if (bcs.length) { try { await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js'); bcs.forEach(el => JsBarcode(el, el.dataset.v, { format: 'CODE128', height: 40, displayValue: false, margin: 0 })); } catch (e) { } }
}
function printHtml(html, size) {
  $('#print').innerHTML = html;
  $('#pstyle').textContent = `@page{size:${size || 'A4'};margin:${!size || size === 'A4' ? '10mm' : '2mm'}}`;
  renderCodes($('#print')).then(() => setTimeout(() => window.print(), 200));
}
function cardHtml(s) { return `<div class="idcard"><b>${esc(S().center)}</b><div style="font-size:11px">${esc(yearName(s.yearId))}</div><h4>${esc(s.name)}</h4><div class="qr" data-v="${esc(s.code)}"></div>${barcodeSvg(s.code, { h: 9, narrow: 0.3, maxW: 52 })}<div style="font-size:12px">${esc(barVal(s.code))}</div></div>`; }
function receiptHtml(p, a4) {
  const s = get('students', p.studentId) || {};
  return `<div class="rcpt ${a4 ? 'a4' : ''}"><div style="text-align:center"><b style="font-size:16px">${esc(S().center)}</b><div>${esc(S().teacher)}</div>${S().centerPhone ? `<div style="font-size:11px">${esc(S().centerPhone)}</div>` : ''}${S().centerAddr ? `<div style="font-size:11px">${esc(S().centerAddr)}</div>` : ''}</div><hr>
  <div class="l"><span>رقم الوصل</span><b>${esc(p.receiptNo || '')}</b></div><div class="l"><span>التاريخ</span><span>${esc(p.date)}</span></div>
  <div class="l"><span>الطالب</span><b>${esc(s.name || '')}</b></div><div class="l"><span>الكود</span><span>${esc(s.code || '')}</span></div>
  <div class="l"><span>البيان</span><span>${p.type === 'other' ? esc(p.note || 'أخرى') : (p.mode === 'session' ? esc(p.sessions) + ' حصة × ' + money(p.price) + ' — ' : 'اشتراك ') + esc(monthName(p.month))}</span></div><hr>
  <div class="l"><b>المبلغ</b><b style="font-size:16px">${money(p.amount)}</b></div>${S().rcptNote ? `<div style="text-align:center;font-size:11px">${esc(S().rcptNote)}</div>` : ''}<hr><div style="text-align:center;font-size:11px">${esc(S().rcptFooter || 'شكرًا لكم')}</div></div>`;
}
function showReceipt(p) {
  modal('وصل الدفع', receiptHtml(p), [
    { t: '🖨 حراري ' + (S().rcptW || 80) + 'mm', cls: 'ghost', fn: () => printThermal(receiptHtml(p), S().rcptW || 80) },
    { t: '🖨 A4', cls: 'ghost', fn: () => printHtml(receiptHtml(p, true), 'A4') },
    { t: 'إغلاق', fn: closeModal }]);
}

/* ================= السحابة (Firebase اختياري) ================= */
const cloud = {
  db: null, auth: null, status: 'غير مفعّل', remote: {}, first: {}, unsubs: [],
  cfg() { try { return JSON.parse(localStorage.getItem('cloudCfg') || 'null'); } catch (e) { return null; } },
  async init() {
    const c = cloud.cfg(); if (!c || !navigator.onLine) { if (c) cloud.status = 'بدون إنترنت'; return; }
    try {
      const v = '10.12.2', b = 'https://www.gstatic.com/firebasejs/' + v + '/firebase-';
      await loadLib(b + 'app-compat.js'); await loadLib(b + 'auth-compat.js'); await loadLib(b + 'firestore-compat.js');
      if (!firebase.apps.length) firebase.initializeApp(c.config);
      cloud.auth = firebase.auth(); cloud.db = firebase.firestore();
      cloud.auth.onAuthStateChanged(u => { if (u) cloud.start(); else { cloud.stop(); cloud.status = 'سجّل الدخول من الإعدادات'; ui.top(); } });
    } catch (e) { cloud.status = 'تعذر الاتصال'; ui.top(); }
  },
  async login(email, pass) { await cloud.init(); if (!cloud.auth) throw new Error('init'); await cloud.auth.signInWithEmailAndPassword(email, pass); },
  start() {
    cloud.stop(); cloud.status = 'جاري المزامنة...'; ui.top();
    SYNC.forEach(t => {
      cloud.first[t] = true; cloud.remote[t] = new Map();
      cloud.unsubs.push(cloud.db.collection('edu_' + t).onSnapshot(snap => {
        let changed = false;
        snap.docs.forEach(d => { const r = d.data(); cloud.remote[t].set(r.id, r.updatedAt || 0); const l = mem[t].get(r.id); if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) { save(t, r, { keep: true, noSync: true }); changed = true; } });
        if (cloud.first[t]) { cloud.first[t] = false; cloud.reconcile(t); }
        cloud.status = 'متصل ومتزامن ☁️'; dirty = dirty && !changed; ui.top();
        if (changed) ui.soft();
      }, () => { cloud.status = 'خطأ في الصلاحيات أو الشبكة'; ui.top(); }));
    });
  },
  stop() { cloud.unsubs.forEach(u => u()); cloud.unsubs = []; },
  push(t, rec) { if (!cloud.db || !cloud.auth?.currentUser) return; cloud.db.collection('edu_' + t).doc(rec.id).set(JSON.parse(JSON.stringify(rec))).catch(() => { }); },
  async reconcile(t) {
    if (!cloud.db) return; const rem = cloud.remote[t] || new Map(); const todo = [...mem[t].values()].filter(l => (rem.get(l.id) ?? -1) < (l.updatedAt || 0));
    for (let i = 0; i < todo.length; i += 400) { const b = cloud.db.batch(); todo.slice(i, i + 400).forEach(r => b.set(cloud.db.collection('edu_' + t).doc(r.id), JSON.parse(JSON.stringify(r)))); try { await b.commit(); } catch (e) { return; } }
  },
  reconcileAll() { SYNC.forEach(t => cloud.reconcile(t)); }
};

/* ================= النسخ الاحتياطي ================= */
function dump() { const tables = {}; SYNC.forEach(t => tables[t] = allRaw(t)); return { app: 'edu-center', version: 1, at: Date.now(), tables }; }
async function snapshot(kind) {
  if (!idb) return;
  const d = dump(), counts = { students: d.tables.students.length, payments: d.tables.payments.length, attendance: d.tables.attendance.length };
  save('snapshots', { id: 'snap_' + Date.now(), at: Date.now(), kind, counts, data: JSON.stringify(d) }, { keep: true });
  dirty = false;
  const snaps = [...mem.snapshots.values()].sort((a, b) => b.at - a.at); snaps.slice(30).forEach(s => hardDelete('snapshots', s.id));
}
async function restoreData(d, replace) {
  for (const t of SYNC) {
    const incoming = d.tables?.[t]; if (!incoming) continue; const ids = new Set(incoming.map(r => r.id));
    if (replace) { const gone = [...mem[t].values()].filter(r => !ids.has(r.id) && !r.deleted).map(r => ({ ...r, deleted: true })); await bulkSave(t, gone); }
    await bulkSave(t, incoming.map(r => { const x = { ...r }; delete x.deleted; return x; }));
  }
  cloud.reconcileAll();
}
async function mergeData(d) {
  for (const t of SYNC) { const inc = (d.tables?.[t] || []).filter(r => { const l = mem[t].get(r.id); return !l || (r.updatedAt || 0) > (l.updatedAt || 0); }); await bulkSave(t, inc, { keep: true }); }
  cloud.reconcileAll();
}

/* ================= استيراد النظام القديم ================= */
function parseLegacy(text) {
  let t = String(text || '').trim().replace(/^\uFEFF/, '');
  try { return JSON.parse(t); } catch (e) { }
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) {
    const body = t.slice(i, j + 1);
    try { return JSON.parse(body); } catch (e) { }
    try { return (new Function('return (' + body + ')'))(); } catch (e) { }
  }
  try { const w = {}; new Function('window', 'self', 'globalThis', t + '\n;return window;')(w, w, w); if (Object.keys(w).length) return w; } catch (e) { }
  throw new Error('تعذر قراءة الملف');
}
function toArr(v) { if (Array.isArray(v)) return v; if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => (x && typeof x === 'object' ? { _key: k, ...x } : { _key: k, value: x })); return []; }
function pick(o, names) { for (const n of names) { if (o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n]; } return ''; }
function normDate(v) {
  if (!v) return '';
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/))) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function findSections(root) {
  const out = { students: [], groups: [], attendance: [], exams: [], payments: [], expenses: [], years: [] };
  const rules = [['students', /student|طالب|طلاب|طلبة/i], ['groups', /group|مجموع/i], ['attendance', /attend|حضور|غياب|absen/i], ['exams', /exam|امتحان|اختبار/i], ['payments', /payment|receipt|وصل|مدفوع|subscri|اشتراك|treasury|finance|خزن/i], ['expenses', /expens|مصروف|مصاريف/i], ['years', /year|grade|stage|سنة|صف|مرحل/i]];
  const seen = new Set();
  (function walk(o, path, depth) {
    if (!o || typeof o !== 'object' || depth > 3 || seen.has(o)) return; seen.add(o);
    Object.entries(o).forEach(([k, v]) => {
      if (v && typeof v === 'object') {
        const r = rules.find(([, re]) => re.test(k));
        const arr = toArr(v);
        if (r && arr.length && typeof arr[0] === 'object') out[r[0]].push({ path: path + k, rows: arr });
        else walk(v, path + k + '.', depth + 1);
      }
    });
  })(root, '', 0);
  return out;
}
function mapLegacy(root) {
  if (root && root.edu_initial_data) root = root.edu_initial_data;
  if (root && root.__alamin_backup__ && typeof mapAlamin === 'function') return mapAlamin(root);
  const sec = findSections(root), res = { years: [], groups: [], students: [], attendance: [], payments: [], expenses: [], exams: [], scores: [], notes: [] };
  const pickBest = k => (sec[k].sort((a, b) => b.rows.length - a.rows.length)[0] || { rows: [] }).rows;
  const yearMap = new Map(), groupMap = new Map();
  const ensureYear = (idOrName) => { if (!idOrName && idOrName !== 0) return ''; const key = String(idOrName); if (!yearMap.has(key)) { const y = { id: 'y_' + key.replace(/[^\p{L}\p{N}]+/gu, '_'), name: key, order: yearMap.size }; yearMap.set(key, y); res.years.push(y); } return yearMap.get(key).id; };
  pickBest('years').forEach(y => { if (typeof y !== 'object') return; const id = pick(y, ['id', '_key', 'key']), name = pick(y, ['name', 'title', 'label', 'اسم']); if (name) { const yy = { id: 'y_' + String(id || name).replace(/[^\p{L}\p{N}]+/gu, '_'), name: String(name), order: res.years.length }; yearMap.set(String(id || name), yy); yearMap.set(String(name), yy); if (!res.years.includes(yy)) res.years.push(yy); } });
  pickBest('groups').forEach(g => {
    const id = pick(g, ['id', '_key', 'key']), name = pick(g, ['name', 'title', 'groupName', 'اسم']) || String(id), time = pick(g, ['time', 'schedule', 'day', 'days', 'موعد']);
    const gg = { id: 'g_' + String(id || name).replace(/[^\p{L}\p{N}]+/gu, '_'), name: String(name), time: String(time || ''), yearId: ensureYear(pick(g, ['year', 'grade', 'yearId', 'level', 'stage'])), fee: num(pick(g, ['fee', 'price'])) };
    groupMap.set(String(id || name), gg); groupMap.set(String(name), gg); res.groups.push(gg);
  });
  const stuByKey = new Map();
  pickBest('students').forEach(s => {
    if (typeof s !== 'object') return;
    const name = pick(s, ['name', 'fullName', 'studentName', 'full_name', 'اسم']); if (!name) return;
    const code = String(pick(s, ['code', 'studentCode', 'barcode', 'qr', 'id', '_key']) || '');
    const gRaw = pick(s, ['groupId', 'group', 'group_id', 'groupName']), g = groupMap.get(String(gRaw));
    const st = { id: 's_' + (code || uid()).replace(/[^\p{L}\p{N}]+/gu, '_'), name: String(name), code: code || nextCode(), phone: String(pick(s, ['phone', 'mobile', 'tel', 'studentPhone']) || ''), parentPhone: String(pick(s, ['parentPhone', 'guardianPhone', 'parent_phone', 'parent', 'guardian', 'parentMobile']) || ''), groupId: g ? g.id : '', yearId: ensureYear(pick(s, ['year', 'grade', 'yearId', 'level', 'stage'])) || g?.yearId || '', joinDate: normDate(pick(s, ['joinDate', 'createdAt', 'date', 'registeredAt'])), points: num(pick(s, ['points', 'score', 'نقاط'])), active: true };
    res.students.push(st); [code, pick(s, ['id']), pick(s, ['_key']), name].forEach(k => k && stuByKey.set(String(k), st));
  });
  const findStu = r => stuByKey.get(String(pick(r, ['studentId', 'sid', 'student_id', 'studentCode', 'code', 'student', 'studentName', 'name']))) || null;
  pickBest('attendance').forEach(a => {
    if (typeof a !== 'object') return; const st = findStu(a); const d = normDate(pick(a, ['date', 'day', 'timestamp', 'time', 'at'])); if (!st || !d) return;
    const raw = String(pick(a, ['status', 'state', 'حالة']) || 'present'); const absent = /absen|غائب|غياب|^a$/i.test(raw);
    res.attendance.push({ id: d + '_' + st.id, studentId: st.id, date: d, groupId: st.groupId, status: absent ? 'a' : 'p', time: String(pick(a, ['time', 'timeStr']) || '').slice(0, 5) });
  });
  pickBest('payments').forEach(p => {
    if (typeof p !== 'object') return; const st = findStu(p); const amount = num(pick(p, ['amount', 'value', 'total', 'paid', 'price', 'مبلغ'])); if (!st || !amount) return;
    const date = normDate(pick(p, ['date', 'timestamp', 'createdAt', 'at'])) || today();
    res.payments.push({ id: 'p_' + (pick(p, ['id', 'receiptNo', 'receipt', 'code']) || uid()).toString().replace(/[^\p{L}\p{N}]+/gu, '_') + '_' + res.payments.length, studentId: st.id, month: String(pick(p, ['month', 'monthKey', 'period']) || date.slice(0, 7)).slice(0, 7), amount, date, receiptNo: String(pick(p, ['receiptNo', 'receipt', 'id', 'code']) || ''), type: 'fee', note: String(pick(p, ['note', 'desc', 'description', 'title', 'بيان']) || '') });
  });
  pickBest('expenses').forEach(e => { if (typeof e !== 'object') return; const amount = num(pick(e, ['amount', 'value', 'مبلغ'])); if (!amount) return; res.expenses.push({ id: 'e_' + uid() + res.expenses.length, date: normDate(pick(e, ['date', 'timestamp', 'createdAt'])) || today(), category: String(pick(e, ['category', 'type', 'cat', 'فئة']) || 'أخرى'), amount, note: String(pick(e, ['note', 'desc', 'description', 'title']) || '') }); });
  pickBest('exams').forEach(x => {
    if (typeof x !== 'object') return; const name = pick(x, ['name', 'title', 'اسم']); if (!name) return;
    const ex = { id: 'x_' + String(pick(x, ['id', '_key']) || uid()).replace(/[^\p{L}\p{N}]+/gu, '_'), name: String(name), date: normDate(pick(x, ['date'])) || today(), max: num(pick(x, ['max', 'total', 'maxScore', 'fullMark', 'totalScore'])) || 100, groupId: '', yearId: '' };
    res.exams.push(ex);
    const sc = x.scores || x.results || x.grades; toArr(sc).forEach(r => { const st = findStu(r) || stuByKey.get(String(r._key)); const v = pick(r, ['score', 'grade', 'mark', 'value']); if (st && v !== '') res.scores.push({ id: ex.id + '_' + st.id, examId: ex.id, studentId: st.id, score: num(v) }); });
  });
  return res;
}
function legacySummary(m) { return `<p>لقيت في الملف:</p><div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><small>طلاب</small><b>${m.students.length}</b></div><div class="stat"><small>مجموعات</small><b>${m.groups.length}</b></div><div class="stat"><small>سجلات حضور</small><b>${m.attendance.length}</b></div><div class="stat"><small>مدفوعات</small><b>${m.payments.length}</b></div><div class="stat"><small>امتحانات / درجات</small><b>${m.exams.length} / ${m.scores.length}</b></div><div class="stat"><small>مصروفات</small><b>${m.expenses.length}</b></div></div>${(m.notes || []).map(n => `<p style="font-size:13px;color:var(--wa)">• ${esc(n)}</p>`).join('')}<p style="color:var(--mu);font-size:13px">الاستيراد بيضيف على بياناتك الحالية ومش بيمسح حاجة. وبياخد نسخة احتياطية قبلها، والملف الأصلي بيتحفظ كامل جوه النظام كمان.</p>`; }
async function importLegacy(file) {
  const text = await file.text(); let raw; try { raw = parseLegacy(text); } catch (e) { return toast('الملف مش مفهوم. ابعتهولي وأنا أظبط الاستيراد', true); }
  if (raw && raw.app === 'edu-center') { return confirmBox('ده ملف نسخة احتياطية من النظام الجديد. دمج مع البيانات الحالية؟', async () => { await snapshot('before-import'); await mergeData(raw); toast('تم الدمج ✅'); ui.render(); }, 'دمج'); }
  const m = mapLegacy(raw);
  if (!m.students.length && !m.groups.length) return toast('مالقيتش طلاب ولا مجموعات في الملف. ابعتهولي وأنا أظبطها', true);
  modal('استيراد من النظام القديم', legacySummary(m), [{ t: 'إلغاء', cls: 'ghost', fn: closeModal }, {
    t: 'استيراد الآن', fn: async () => {
      closeModal(); await snapshot('before-import');
      const yIds = new Set(all('years').map(y => y.id)); await bulkSave('years', m.years.filter(y => !yIds.has(y.id)));
      for (const t of ['groups', 'students', 'attendance', 'payments', 'expenses', 'exams', 'scores']) await bulkSave(t, m[t].filter(r => !mem[t].has(r.id)));
      save('legacy', { id: 'legacy_' + Date.now(), at: Date.now(), raw: raw && (raw.__alamin_backup__ || raw.edu_initial_data) ? '' : text.slice(0, 5e6) }, { keep: true });
      if (m.settings) setS(m.settings);
      const mx = Math.max(0, ...m.payments.map(p => parseInt(p.receiptNo) || 0)); if (mx > (S().receiptNo || 0)) setS({ receiptNo: mx });
      cloud.reconcileAll(); toast('تم الاستيراد ✅'); location.hash = '#/students'; ui.render();
    }
  }]);
}

/* ================= الواجهة: التنقل ================= */
const routes = {
  dashboard: { t: 'الرئيسية', i: '🏠', g: 'الأساسي' }, attendance: { t: 'الحضور', i: '✅', g: 'الأساسي' }, students: { t: 'الطلاب', i: '👥', g: 'الأساسي' }, groups: { t: 'المجموعات', i: '🗂', g: 'الأساسي' },
  payments: { t: 'المدفوعات', i: '💰', g: 'المالية' }, treasury: { t: 'الخزنة اليومية', i: '🏦', g: 'المالية' }, expenses: { t: 'المصروفات', i: '🧾', g: 'المالية' },
  exams: { t: 'الامتحانات', i: '📝', g: 'المتابعة' }, reports: { t: 'التقارير', i: '📊', g: 'المتابعة' }, cards: { t: 'طباعة الكروت', i: '🪪', g: 'المتابعة' }, codes: { t: 'أكواد الطلاب', i: '🔑', g: 'المتابعة' }, platform: { t: 'المنصة التعليمية', i: '🌐', g: 'المتابعة', teacherOnly: true }, settings: { t: 'الإعدادات والنسخ', i: '⚙️', g: 'النظام', teacherOnly: true }
};
const mainNav = ['dashboard', 'attendance', 'students', 'payments'];
const ui = {
  route() { const p = location.hash.replace(/^#\/?/, '').split('/'); const ok = routes[p[0]] && (isTeacher() || !routes[p[0]].teacherOnly); return { name: ok ? p[0] : 'dashboard', arg: p[1] }; },
  render() { const { name, arg } = ui.route(); ui.side(); ui.top(); ui.banner(); $('#view').innerHTML = V[name](arg); (M[name] || (() => { }))(arg); window.scrollTo(0, 0); },
  soft() { clearTimeout(ui._t); ui._t = setTimeout(() => { if (!$('#modal .ov') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) ui.render(); else ui.top(); }, 400); },
  side() {
    const { name } = ui.route(); let h = `<div class="logo">🎓 ${esc(S().center)}</div>`, last = '';
    Object.entries(routes).filter(([k, r]) => isTeacher() || !r.teacherOnly).forEach(([k, r]) => { if (r.g !== last) { h += `<div class="grp">${r.g}</div>`; last = r.g; } h += `<a href="#/${k}" class="${k === name ? 'on' : ''}"><span>${r.i}</span>${r.t}</a>`; });
    $('#side').innerHTML = h;
    $('#bottom').innerHTML = mainNav.map(k => `<a href="#/${k}" class="${k === name ? 'on' : ''}"><span>${routes[k].i}</span>${routes[k].t}</a>`).join('') + `<a data-act="more" class="${mainNav.includes(name) ? '' : 'on'}"><span>☰</span>المزيد</a>`;
  },
  top() { const { name } = ui.route(), c = cloud.cfg(); $('#top').innerHTML = `<h1>${routes[name].i} ${routes[name].t}</h1>${c ? `<span class="pill ${cloud.status.includes('متصل') ? 'ok' : 'wa'}" title="${esc(cloud.status)}">${cloud.status.includes('متصل') ? '☁️ متزامن' : '☁️ ' + esc(cloud.status)}</span>` : ''}${localStorage.pin ? `<span class="pill ${isTeacher() ? 'ok' : 'wa'}">${isTeacher() ? '👨‍🏫 مدرس' : '👤 مساعد'}</span><button class="ib" data-act="lockNow" title="قفل / تبديل المستخدم">🔒</button>` : ''}<button class="ib" data-act="theme" title="الوضع الليلي">🌓</button>`; },
  banner() {
    const last = S().lastExport || 0, n = all('students').length; let h = '';
    if (n > 0 && !cloud.cfg() && Date.now() - last > 7 * 864e5) h = `<div class="warn"><span>⚠️ آخر نسخة احتياطية محفوظة على جهازك من ${last ? Math.floor((Date.now() - last) / 864e5) + ' يوم' : 'وقت طويل'}. فعّل المزامنة السحابية أو نزّل نسخة.</span><button class="btn sm" data-act="exportNow">نزّل نسخة</button></div>`;
    if (typeof extraBanner === 'function') h = extraBanner() + h;
    $('#banner').innerHTML = h;
  }
};

/* ================= الصفحات ================= */
const V = {}, M = {}, A = {};

/* ---- الرئيسية ---- */
V.dashboard = () => {
  const t = today(), mo = curMonth(), act = activeStudents();
  const present = all('attendance').filter(a => a.date === t && a.status === 'p').length;
  const rev = all('payments').filter(p => p.date?.slice(0, 7) === mo).reduce((a, p) => a + num(p.amount), 0);
  const exp = all('expenses').filter(e => e.date?.slice(0, 7) === mo).reduce((a, e) => a + num(e.amount), 0);
  const unpaid = act.filter(s => { const st = payState(s, mo); return st.k === 'er' || st.k === 'wa'; }).length;
  const days = [...Array(7)].map((_, i) => daysAgo(6 - i)), cnt = days.map(d => all('attendance').filter(a => a.date === d && a.status === 'p').length), mx = Math.max(1, ...cnt);
  const last = all('attendance').filter(a => a.status === 'p').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 8);
  if (!act.length && !all('groups').length) return `<div class="card empty"><div style="font-size:42px">🎓</div><h3>أهلاً بيك!</h3><p>ابدأ بإضافة مجموعة وطلاب، أو انقل بياناتك القديمة من الإعدادات.</p><div class="bar" style="justify-content:center;margin-top:12px"><a class="btn" href="#/groups">+ مجموعة</a><a class="btn ghost" href="#/settings">نقل البيانات القديمة</a></div></div>`;
  return `<div class="stats"><div class="stat"><small>الطلاب النشطين</small><b>${act.length}</b></div><div class="stat"><small>حضور اليوم</small><b>${present}</b></div><div class="stat"><small>إيراد الشهر</small><b>${money(rev)}</b></div><div class="stat"><small>مصروفات الشهر</small><b>${money(exp)}</b></div><div class="stat"><small>لم يسدد هذا الشهر</small><b>${unpaid}</b></div></div>
  <div class="grid2"><div class="card"><h3>الحضور آخر 7 أيام</h3><div class="bars">${cnt.map(c => `<div style="height:${Math.round(c / mx * 100)}%"><i>${c}</i></div>`).join('')}</div><div class="lbls">${days.map(d => `<span>${d.slice(8)}</span>`).join('')}</div></div>
  <div class="card"><h3>آخر الحضور</h3>${last.map(a => `<div class="row"><div class="g"><b>${esc(get('students', a.studentId)?.name || '—')}</b><small>${esc(a.date)} ${esc(a.time || '')}</small></div></div>`).join('') || '<div class="empty">لا يوجد</div>'}</div></div>
  <div class="bar"><a class="btn" href="#/attendance">✅ تسجيل حضور</a><a class="btn ghost" href="#/payments">💰 تسجيل دفع</a><a class="btn ghost" href="#/students">+ طالب</a></div>`;
};

/* ---- الطلاب ---- */
V.students = () => `<div class="bar"><input id="q" placeholder="🔍 بحث بالاسم أو الكود أو الهاتف" autocomplete="off"><select id="fy">${yearOpts('', 'كل الصفوف')}</select><select id="fg">${groupOpts('', 'كل المجموعات')}</select><button class="btn" data-act="addStudent">+ طالب</button></div><div class="card" id="list"></div>`;
M.students = () => {
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), fy = $('#fy').value, fg = $('#fg').value; localStorage.stuFilter = JSON.stringify({ fy, fg });
    let l = all('students').filter(s => (!fy || s.yearId === fy) && (!fg || s.groupId === fg) && (!q || [s.name, s.code, s.phone, s.parentPhone].some(x => String(x || '').toLowerCase().includes(q))));
    l.sort((a, b) => a.name.localeCompare(b.name, 'ar')); const total = l.length; l = l.slice(0, 150);
    $('#list').innerHTML = (l.map(s => `<div class="row"><div class="g"><b>${esc(s.name)}${s.active === false ? ' <span class="pill er">متوقف</span>' : ''}</b><small>${esc(s.code)} · ${esc(groupName(s.groupId) || 'بدون مجموعة')} · ${esc(s.parentPhone || s.phone || '')}</small></div><div class="acts"><button class="ib" data-act="profile" data-id="${s.id}">👁</button><button class="ib" data-act="editStudent" data-id="${s.id}">✏️</button>${s.parentPhone || s.phone ? `<a class="ib" target="_blank" href="${waLink(s.parentPhone || s.phone)}">💬</a>` : ''}</div></div>`).join('') || '<div class="empty">لا يوجد طلاب</div>') + (total > 150 ? `<div class="empty">عرض أول 150 من ${total} — استخدم البحث</div>` : '');
  };
  const f = JSON.parse(localStorage.stuFilter || '{}'); if (f.fy) $('#fy').value = f.fy; if (f.fg) $('#fg').value = f.fg;
  ['q', 'fy', 'fg'].forEach(id => $('#' + id).oninput = draw); draw();
};
function studentForm(s) {
  s = s || { code: nextCode(), joinDate: today(), yearId: JSON.parse(localStorage.stuFilter || '{}').fy || '', groupId: JSON.parse(localStorage.stuFilter || '{}').fg || '' };
  return fld('الاسم', 'name', s.name) + `<div class="grid2">${fld('الكود', 'code', s.code)}${fld('تاريخ الانضمام', 'joinDate', s.joinDate, 'date')}</div><div class="grid2">${fld('هاتف الطالب', 'phone', s.phone, 'tel')}${fld('هاتف ولي الأمر', 'parentPhone', s.parentPhone, 'tel')}</div><div class="grid2">${sel('الصف', 'yearId', yearOpts(s.yearId, '— اختر —'))}${sel('المجموعة', 'groupId', groupOpts(s.groupId, '— اختر —'))}</div>${fld('ملاحظات', 'notes', s.notes)}<label><input type="checkbox" name="active" ${s.active === false ? '' : 'checked'} style="width:auto"> طالب نشط</label>`;
}
function saveStudent(old, d) {
  if (!d.name) return toast('اكتب الاسم', true);
  if (!d.code) return toast('اكتب الكود', true);
  if (allRaw('students').some(s => s.code === d.code && s.id !== old?.id)) return toast('الكود ده مستخدم لطالب تاني', true);
  const g = get('groups', d.groupId); if (g && !d.yearId) d.yearId = g.yearId || '';
  const rec = save('students', { ...(old || { id: uid(), points: 0 }), ...d });
  closeModal(); toast('تم الحفظ ✅'); ui.render(); return rec;
}
A.addStudent = () => modal('طالب جديد', studentForm(), [{ t: 'حفظ', fn: d => saveStudent(null, d) }, { t: 'حفظ وكارت', cls: 'ghost', fn: d => { const r = saveStudent(null, d); if (r) printHtml(`<div class="cards">${cardHtml(r)}</div>`); } }]);
A.editStudent = a => { const s = get('students', a.id); modal('تعديل طالب', studentForm(s), [{ t: 'حذف', cls: 'er', fn: () => confirmBox('حذف الطالب ' + esc(s.name) + '؟', () => { remove('students', s.id); toast('تم الحذف'); ui.render(); }) }, { t: 'حفظ', fn: d => saveStudent(s, d) }]); };
A.profile = a => {
  const s = get('students', a.id), att = all('attendance').filter(x => x.studentId === s.id), pr = att.filter(x => x.status === 'p').length, ab = att.filter(x => x.status === 'a').length;
  const sc = all('scores').filter(x => x.studentId === s.id).map(x => ({ ...x, ex: get('exams', x.examId) })).filter(x => x.ex).sort((a, b) => b.ex.date.localeCompare(a.ex.date));
  const pays = all('payments').filter(p => p.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date)), st = payState(s, curMonth());
  const html = `<div class="stats" style="grid-template-columns:1fr 1fr 1fr"><div class="stat"><small>حضور</small><b>${pr}</b></div><div class="stat"><small>غياب</small><b>${ab}</b></div><div class="stat"><small>الشهر</small><span class="pill ${st.k}">${st.t}</span></div></div>
  <p><b>${esc(s.code)}</b> · ${esc(yearName(s.yearId))} · ${esc(groupName(s.groupId))}<br><small>ولي الأمر: ${esc(s.parentPhone || '-')} · الطالب: ${esc(s.phone || '-')}</small></p>
  <h4>الامتحانات</h4>${sc.slice(0, 8).map(x => `<div class="row"><div class="g">${esc(x.ex.name)}</div><b>${x.score}/${x.ex.max}</b></div>`).join('') || '<small>لا يوجد</small>'}
  <h4 style="margin-top:10px">المدفوعات</h4>${pays.slice(0, 8).map(p => `<div class="row"><div class="g">${p.type === 'other' ? esc(p.note || 'أخرى') : esc(monthName(p.month))}<small> · ${esc(p.date)}</small></div><b>${money(p.amount)}</b><button class="ib" data-act="reprint" data-id="${p.id}">🖨</button></div>`).join('') || '<small>لا يوجد</small>'}`;
  modal(esc(s.name), html, [{ t: 'كارت', cls: 'ghost', fn: () => printHtml(`<div class="cards">${cardHtml(s)}</div>`) }, { t: 'تقرير للطباعة', cls: 'ghost', fn: () => printHtml(`<div dir="rtl" style="font-family:Tajawal,Arial;color:#000"><h2>${esc(S().center)} — تقرير الطالب</h2><h3>${esc(s.name)} (${esc(s.code)})</h3>${html.replace(/<button[^>]*>.*?<\/button>/g, '')}<p style="margin-top:40px">توقيع ولي الأمر: ............</p></div>`) }, { t: 'تعديل', fn: () => A.editStudent({ id: s.id }) }]);
};
A.reprint = a => showReceipt(get('payments', a.id));

/* ---- المجموعات ---- */
V.groups = () => `<div class="bar"><button class="btn" data-act="addGroup">+ مجموعة</button></div><div class="card">${all('groups').map(g => { const n = activeStudents().filter(s => s.groupId === g.id).length; return `<div class="row"><div class="g"><b>${esc(g.name)}</b><small>${esc(g.time || '')} · ${esc(yearName(g.yearId))} · ${n} طالب${g.fee ? ' · ' + money(g.fee) : ''}</small></div><div class="acts"><button class="ib" data-act="editGroup" data-id="${g.id}">✏️</button><button class="ib" data-act="openGroup" data-id="${g.id}">👥</button></div></div>`; }).join('') || '<div class="empty">لا توجد مجموعات</div>'}</div>`;
const groupForm = g => { g = g || {}; return fld('اسم المجموعة', 'name', g.name, 'text', 'placeholder="مثلاً: السبت والثلاثاء"') + fld('الموعد', 'time', g.time, 'text', 'placeholder="4 مساءً"') + sel('الصف', 'yearId', yearOpts(g.yearId, '— اختر —')) + `<div class="grid2">${fld('بداية الحصة', 'start', g.start || '', 'time')}${fld('نهاية الحصة', 'end', g.end || '', 'time')}</div>` + fld('سماح التأخير بالدقايق (فاضي = الافتراضي من الإعدادات)', 'grace', g.grace ?? '', 'number') + fld('سعر الاشتراك الشهري (اختياري — يتجاوز السعر العام)', 'fee', g.fee || '', 'number'); };
A.addGroup = () => modal('مجموعة جديدة', groupForm(), [{ t: 'حفظ', fn: d => { if (!d.name) return toast('اكتب الاسم', true); save('groups', { id: uid(), ...d, fee: num(d.fee) }); closeModal(); ui.render(); } }]);
A.editGroup = a => { const g = get('groups', a.id); modal('تعديل مجموعة', groupForm(g), [{ t: 'حذف', cls: 'er', fn: () => confirmBox('حذف المجموعة؟ الطلاب هيفضلوا بدون مجموعة.', () => { remove('groups', g.id); ui.render(); }) }, { t: 'حفظ', fn: d => { save('groups', { ...g, ...d, fee: num(d.fee) }); closeModal(); ui.render(); } }]); };
A.openGroup = a => { localStorage.stuFilter = JSON.stringify({ fy: '', fg: a.id }); location.hash = '#/students'; };

/* ---- الحضور ---- */
const AT = { g: localStorage.attG || '', d: today() };
V.attendance = () => `<div class="bar"><select id="ag">${groupOpts(AT.g, 'كل الطلاب')}</select><input type="date" id="ad" value="${AT.d}" style="max-width:170px"><button class="btn ghost" data-act="cam">📷 كاميرا</button></div><div class="scan"><input id="scan" placeholder="امسح الكود أو اكتبه ثم Enter" autocomplete="off" inputmode="text"></div><div id="sb"></div><div class="stats" id="ast"></div><div class="card" id="alist"></div><div class="bar"><button class="btn ghost" data-act="markRest">إنهاء الحصة وتسجيل الغياب</button><button class="btn ghost" data-act="absMsgs">💬 رسائل للغياب</button></div>`;
function lateMin(gid, time) { const g = get('groups', gid); if (!g?.start || !time) return 0; const d = mins(time) - mins(g.start), grace = (g.grace !== undefined && g.grace !== '' && g.grace !== null) ? num(g.grace) : num(S().lateGrace); return d > grace ? d : 0; }
function markAtt(sid, status) {
  const id = AT.d + '_' + sid, old = get('attendance', id); if (!status) { if (old) remove('attendance', id); return null; }
  const gid = AT.g || get('students', sid)?.groupId || '', time = old?.time && old.status === status ? old.time : nowTime();
  const lm = status === 'p' && AT.d === today() ? (old?.status === 'p' ? (old.lateMin || 0) : lateMin(gid, time)) : 0;
  return save('attendance', { id, studentId: sid, date: AT.d, groupId: gid, status, time, late: lm > 0, lateMin: lm });
}
function notifyPresent(s, rec) { if (!rec || rec.status !== 'p' || AT.d !== today()) return; const k = rec.late ? 'late' : 'present'; qWA(k, s, rec.late ? [s.name, AT.d, rec.time, rec.lateMin] : [s.name, AT.d, rec.time], k + '_' + AT.d + '_' + s.id); }
function absentRest(gid, date) { const have = new Set(all('attendance').filter(x => x.date === date).map(x => x.studentId)); const rest = activeStudents().filter(s => s.groupId === gid && !have.has(s.id)); rest.forEach(s => { save('attendance', { id: date + '_' + s.id, studentId: s.id, date, groupId: gid, status: 'a', time: nowTime() }); if (date === today()) qWA('absent', s, [s.name, date], 'absent_' + date + '_' + s.id); }); return rest.length; }
function drawAtt() {
  const list = (AT.g ? activeStudents().filter(s => s.groupId === AT.g) : []).sort((a, b) => a.name.localeCompare(b.name, 'ar')), recs = new Map(all('attendance').filter(a => a.date === AT.d).map(a => [a.studentId, a]));
  const inScope = a => !AT.g || a.groupId === AT.g || list.some(s => s.id === a.studentId);
  const ps = [...recs.values()].filter(a => a.status === 'p' && inScope(a)).length, as = [...recs.values()].filter(a => a.status === 'a' && inScope(a)).length;
  $('#ast').innerHTML = `<div class="stat"><small>حضروا</small><b>${ps}</b></div><div class="stat"><small>غابوا</small><b>${as}</b></div><div class="stat"><small>متأخرين</small><b>${[...recs.values()].filter(a => a.status === 'p' && a.late && inScope(a)).length}</b></div>${AT.g ? `<div class="stat"><small>لم يُسجّل</small><b>${list.filter(s => !recs.has(s.id)).length}</b></div>` : ''}`;
  const mo = AT.d.slice(0, 7);
  $('#alist').innerHTML = AT.g ? (list.map(s => { const r = recs.get(s.id), st = payState(s, mo); return `<div class="row"><div class="g"><b>${esc(s.name)}</b><small>${esc(s.code)} ${r?.status === 'p' ? '· ' + esc(r.time || '') : ''} ${r?.late ? `<span class="pill wa">متأخر ${r.lateMin}د</span>` : ''} <span class="pill ${st.k}">${st.t}</span></small></div><div class="acts"><button class="ib ${r?.status === 'p' ? 'on' : ''}" data-act="mk" data-id="${s.id}" data-s="p">✔ حاضر</button><button class="ib ${r?.status === 'a' ? 'off' : ''}" data-act="mk" data-id="${s.id}" data-s="a">✖ غائب</button></div></div>`; }).join('') || '<div class="empty">المجموعة فاضية</div>') : '<div class="empty">اختر مجموعة لعرض القائمة، أو امسح الأكواد مباشرة</div>';
}
function handleScan(code) {
  code = normCode(code); if (!code) return; const s = findStudentByCode(code);
  const sb = $('#sb'); if (!s) { sb.innerHTML = `<div class="big er">كود غير معروف: <span dir="ltr">${esc(code)}</span><br><small>(${code.length} حرف) ${/[\u0600-\u06ff]/.test(code) ? 'غيّر لغة الكيبورد لإنجليزي' : 'راجع الكود في بيانات الطالب'}</small></div>`; return; }
  const st = payState(s, AT.d.slice(0, 7)), other = AT.g && s.groupId !== AT.g;
  const rec = markAtt(s.id, 'p'); notifyPresent(s, rec);
  sb.innerHTML = `<div class="big ${st.k === 'er' || rec?.late ? 'wa' : 'ok'}">✔ ${esc(s.name)}${rec?.late ? '<br><small>⏰ متأخر ' + rec.lateMin + ' دقيقة</small>' : ''}${other ? '<br><small>من مجموعة: ' + esc(groupName(s.groupId) || '—') + '</small>' : ''}<br><small>${st.k === 'er' || st.k === 'wa' ? '⚠️ اشتراك الشهر: ' + st.t : st.k === 'ok' ? 'اشتراك الشهر مدفوع' : ''}</small></div>`;
  if (S().speak && window.speechSynthesis) { const u = new SpeechSynthesisUtterance(s.name); u.lang = 'ar-EG'; speechSynthesis.speak(u); }
  drawAtt();
}
M.attendance = () => {
  const sc = $('#scan'); $('#ag').onchange = e => { AT.g = e.target.value; localStorage.attG = AT.g; drawAtt(); }; $('#ad').onchange = e => { AT.d = e.target.value || today(); drawAtt(); };
  sc.onkeydown = e => { if (e.key === 'Enter') { handleScan(sc.value); sc.value = ''; } };
  if (!/Mobi/i.test(navigator.userAgent)) sc.focus(); drawAtt();
};
A.mk = a => { const r = get('attendance', AT.d + '_' + a.id), rec = markAtt(a.id, r?.status === a.s ? null : a.s); if (a.s === 'p') notifyPresent(get('students', a.id), rec); drawAtt(); };
A.markRest = () => { if (!AT.g) return toast('اختر مجموعة أولاً', true); const have = new Set(all('attendance').filter(x => x.date === AT.d).map(x => x.studentId)); const n = activeStudents().filter(s => s.groupId === AT.g && !have.has(s.id)).length; confirmBox(`إنهاء الحصة وتسجيل غياب ${n} طالب؟${S().waOn && AT.d === today() ? ' (هتتبعت رسائل الغياب لأولياء الأمور تلقائيًا)' : ''}`, () => { absentRest(AT.g, AT.d); drawAtt(); toast('تم'); }, 'إنهاء الحصة'); };
A.absMsgs = () => {
  const ab = all('attendance').filter(a => a.date === AT.d && a.status === 'a' && (!AT.g || a.groupId === AT.g)).map(a => get('students', a.studentId)).filter(Boolean);
  modal('رسائل الغياب', ab.map(s => `<div class="row"><div class="g"><b>${esc(s.name)}</b></div>${s.parentPhone || s.phone ? `<a class="btn sm ok" target="_blank" href="${waLink(s.parentPhone || s.phone, fill(S().tplAbsent, { name: s.name, date: AT.d }))}">💬 واتساب</a>` : '<small>لا يوجد رقم</small>'}</div>`).join('') || '<div class="empty">لا يوجد غياب مسجل</div>');
};
A.cam = async () => {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) return toast('المتصفح ده مش بيدعم قراءة الكاميرا. استخدم Chrome، أو قارئ باركود، أو اكتب الكود', true);
  let stream, stop = false;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { return toast('مفيش صلاحية للكاميرا', true); }
  modal('امسح الكود', '<video id="vid" autoplay playsinline muted></video><div id="sb2"></div>');
  const v = $('#vid'); v.srcObject = stream; modalCleanup = () => { stop = true; stream.getTracks().forEach(t => t.stop()); };
  const det = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39', 'ean_8', 'upc_a'] }); let lastCode = '', lastT = 0;
  (async function loop() { while (!stop) { try { const r = await det.detect(v); if (r[0]) { const c = r[0].rawValue; if (c !== lastCode || Date.now() - lastT > 3000) { lastCode = c; lastT = Date.now(); handleScan(c); const s = all('students').find(x => x.code === c); $('#sb2') && ($('#sb2').innerHTML = `<div class="big ${s ? 'ok' : 'er'}">${s ? '✔ ' + esc(s.name) : 'كود غير معروف'}</div>`); } } } catch (e) { } await new Promise(r => setTimeout(r, 250)); } })();
};

/* ---- المدفوعات ---- */
const PY = { m: curMonth(), g: localStorage.payG || '' };
V.payments = () => `<div class="bar"><input type="month" id="pm" value="${PY.m}" style="max-width:170px"><select id="pg">${groupOpts(PY.g, 'كل المجموعات')}</select><select id="pf" style="max-width:150px"><option value="">الكل</option><option value="un">غير مدفوع</option><option value="ok">مدفوع</option></select></div><div class="bar"><input id="pq" placeholder="🔍 اسم أو كود الطالب"></div><div class="stats" id="pst"></div><div class="card" id="plist"></div><div class="bar"><button class="btn ghost" data-act="otherPay">+ دفعة أخرى (ملازم/رسوم)</button></div>`;
function drawPay() {
  const q = $('#pq').value.trim().toLowerCase(), f = $('#pf').value;
  let l = activeStudents().filter(s => (!PY.g || s.groupId === PY.g) && (!q || s.name.toLowerCase().includes(q) || String(s.code).includes(q)));
  const rows = l.map(s => ({ s, st: payState(s, PY.m) })).filter(r => !f || (f === 'ok' ? r.st.k === 'ok' : r.st.k === 'er' || r.st.k === 'wa')).sort((a, b) => a.s.name.localeCompare(b.s.name, 'ar'));
  const total = all('payments').filter(p => p.month === PY.m && (!PY.g || get('students', p.studentId)?.groupId === PY.g)).reduce((a, p) => a + num(p.amount), 0), due = l.reduce((a, s) => { const st = payState(s, PY.m); return a + Math.max(0, st.fee - st.paid); }, 0);
  $('#pst').innerHTML = `<div class="stat"><small>المحصّل عن الشهر</small><b>${money(total)}</b></div><div class="stat"><small>المتبقي</small><b>${money(due)}</b></div>`;
  $('#plist').innerHTML = rows.slice(0, 200).map(({ s, st }) => `<div class="row"><div class="g"><b>${esc(s.name)}</b><small>${esc(s.code)} · ${esc(groupName(s.groupId))} · ${st.fee ? money(st.paid) + ' / ' + money(st.fee) : 'بدون رسوم'}</small></div><span class="pill ${st.k}">${st.t}</span><div class="acts"><button class="btn sm ${st.k === 'ok' ? 'ghost' : ''}" data-act="payFor" data-id="${s.id}">${st.k === 'ok' ? 'دفعة أخرى' : 'تسجيل دفع'}</button>${st.k === 'er' || st.k === 'wa' ? (s.parentPhone || s.phone ? `<a class="ib" target="_blank" href="${waLink(s.parentPhone || s.phone, fill(S().tplDue, { name: s.name, month: monthName(PY.m), amount: money(st.fee - st.paid) }))}" title="تذكير">💬</a>` : '') : ''}</div></div>`).join('') || '<div class="empty">لا يوجد</div>';
}
M.payments = () => { $('#pm').onchange = e => { PY.m = e.target.value || curMonth(); drawPay(); }; $('#pg').onchange = e => { PY.g = e.target.value; localStorage.payG = PY.g; drawPay(); }; $('#pf').onchange = $('#pq').oninput = drawPay; drawPay(); };
A.payFor = a => {
  const s = get('students', a.id), st = payState(s, PY.m), rest = Math.max(0, st.fee - st.paid);
  modal('دفع — ' + esc(s.name), `<p>${esc(monthName(PY.m))} · المطلوب ${money(st.fee)} · المدفوع ${money(st.paid)}</p>` + fld('المبلغ', 'amount', rest || st.fee || '', 'number', 'inputmode="decimal"') + fld('ملاحظة', 'note', ''), [{ t: 'تسجيل + وصل', fn: d => { const amt = num(d.amount); if (amt <= 0) return toast('اكتب المبلغ', true); const p = save('payments', { id: uid(), studentId: s.id, month: PY.m, amount: amt, date: today(), time: nowTime(), receiptNo: nextReceipt(), type: 'fee', note: d.note }); toast('تم تسجيل الدفع ✅'); qWA('pay', s, [s.name, monthName(PY.m), money(amt)], 'pay_' + p.id); drawPay(); showReceipt(p); } }]);
};
A.otherPay = () => modal('دفعة أخرى', `<div class="f"><label>الطالب</label><select name="sid">${optList(activeStudents().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(s => ({ v: s.id, t: s.name + ' — ' + s.code })), '')}</select></div>` + fld('البيان (ملزمة، رسوم...)', 'note', '') + fld('المبلغ', 'amount', '', 'number'), [{ t: 'تسجيل', fn: d => { const amt = num(d.amount); if (!d.sid || amt <= 0) return toast('أكمل البيانات', true); const p = save('payments', { id: uid(), studentId: d.sid, month: PY.m, amount: amt, date: today(), time: nowTime(), receiptNo: nextReceipt(), type: 'other', note: d.note }); drawPay(); showReceipt(p); } }]);

/* ---- المصروفات ---- */
const EX = { m: curMonth() };
V.expenses = () => { const l = all('expenses').filter(e => e.date?.slice(0, 7) === EX.m).sort((a, b) => b.date.localeCompare(a.date)); return `<div class="bar"><input type="month" id="em" value="${EX.m}" style="max-width:170px"><button class="btn" data-act="addExp">+ مصروف</button></div><div class="stats"><div class="stat"><small>إجمالي الشهر</small><b>${money(l.reduce((a, e) => a + num(e.amount), 0))}</b></div></div><div class="card">${l.map(e => `<div class="row"><div class="g"><b>${esc(e.category)} — ${money(e.amount)}</b><small>${esc(e.date)} ${esc(e.note || '')}</small></div><button class="ib" data-act="delExp" data-id="${e.id}">🗑</button></div>`).join('') || '<div class="empty">لا توجد مصروفات</div>'}</div>`; };
M.expenses = () => { $('#em').onchange = e => { EX.m = e.target.value || curMonth(); ui.render(); }; };
A.addExp = () => modal('مصروف جديد', sel('الفئة', 'category', optList(['إيجار', 'مرتبات', 'تصوير وطباعة', 'كهرباء ومياه', 'أخرى'].map(x => ({ v: x, t: x })), '')) + fld('المبلغ', 'amount', '', 'number') + fld('التاريخ', 'date', today(), 'date') + fld('ملاحظة', 'note', ''), [{ t: 'حفظ', fn: d => { if (num(d.amount) <= 0) return toast('اكتب المبلغ', true); save('expenses', { id: uid(), category: d.category, amount: num(d.amount), date: d.date || today(), note: d.note }); closeModal(); ui.render(); } }]);
A.delExp = a => confirmBox('حذف المصروف؟', () => { remove('expenses', a.id); ui.render(); });

/* ---- الامتحانات ---- */
V.exams = id => {
  if (id && get('exams', id)) { const ex = get('exams', id); return `<div class="bar"><a class="btn ghost" href="#/exams">← الامتحانات</a><select id="eg">${groupOpts(ex.groupId || '', 'كل الطلاب في الصف')}</select><button class="btn ghost" data-act="printScores" data-id="${ex.id}">🖨 طباعة</button><button class="btn er sm" data-act="delExam" data-id="${ex.id}">حذف الامتحان</button></div><div class="scan"><input id="escan" placeholder="امسح كود الطالب للانتقال لخانته" autocomplete="off"></div><div class="stats" id="exst"></div><div class="card" id="exlist"></div>`; }
  return `<div class="bar"><button class="btn" data-act="addExam">+ امتحان</button></div><div class="card">${all('exams').sort((a, b) => b.date.localeCompare(a.date)).map(e => { const sc = all('scores').filter(x => x.examId === e.id); const avg = sc.length ? sc.reduce((a, x) => a + num(x.score), 0) / sc.length : 0; return `<a class="row" style="text-decoration:none;color:inherit" href="#/exams/${e.id}"><div class="g"><b>${esc(e.name)}</b><small>${esc(e.date)} · من ${e.max} · ${sc.length} درجة${sc.length ? ' · متوسط ' + avg.toFixed(1) : ''}</small></div>›</a>`; }).join('') || '<div class="empty">لا توجد امتحانات</div>'}</div>`;
};
function examStudents(ex) { const g = $('#eg')?.value ?? ex.groupId; return activeStudents().filter(s => g ? s.groupId === g : (!ex.yearId || s.yearId === ex.yearId)).sort((a, b) => a.name.localeCompare(b.name, 'ar')); }
function drawExam(ex) {
  const l = examStudents(ex), sc = new Map(all('scores').filter(x => x.examId === ex.id).map(x => [x.studentId, x]));
  $('#exlist').innerHTML = `<table><tr><th>الطالب</th><th>الدرجة من ${ex.max}</th></tr>${l.map(s => `<tr><td>${esc(s.name)}<br><small>${esc(s.code)}</small></td><td><input type="number" step="any" inputmode="decimal" data-score="${s.id}" data-code="${esc(s.code)}" value="${sc.has(s.id) ? sc.get(s.id).score : ''}" max="${ex.max}" min="0"></td></tr>`).join('')}</table>`;
  statExam(ex);
}
function statExam(ex) { const l = examStudents(ex), ids = new Set(l.map(s => s.id)), v = all('scores').filter(x => x.examId === ex.id && ids.has(x.studentId)).map(x => num(x.score)); $('#exst').innerHTML = `<div class="stat"><small>تم الرصد</small><b>${v.length}/${l.length}</b></div><div class="stat"><small>المتوسط</small><b>${v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'}</b></div><div class="stat"><small>الأعلى</small><b>${v.length ? Math.max(...v) : '-'}</b></div>`; }
M.exams = id => {
  const ex = id && get('exams', id); if (!ex) return; $('#eg').onchange = () => drawExam(ex); drawExam(ex);
  const es = $('#escan'); es.onkeydown = e => { if (e.key === 'Enter') { const st = findStudentByCode(es.value), i = st && $(`[data-score="${st.id}"]`); if (i) { i.focus(); i.select(); } else toast('الكود مش في القائمة', true); es.value = ''; } };
};
A.addExam = () => modal('امتحان جديد', fld('اسم الامتحان', 'name', '') + `<div class="grid2">${fld('التاريخ', 'date', today(), 'date')}${fld('الدرجة النهائية', 'max', '100', 'number')}</div>` + sel('المجموعة (اختياري)', 'groupId', groupOpts('', 'كل الطلاب')) + sel('الصف', 'yearId', yearOpts('', 'الكل')), [{ t: 'حفظ', fn: d => { if (!d.name) return toast('اكتب الاسم', true); const e = save('exams', { id: uid(), name: d.name, date: d.date || today(), max: num(d.max) || 100, groupId: d.groupId, yearId: d.yearId }); closeModal(); location.hash = '#/exams/' + e.id; } }]);
A.delExam = a => confirmBox('حذف الامتحان وكل درجاته؟', () => { all('scores').filter(s => s.examId === a.id).forEach(s => remove('scores', s.id)); remove('exams', a.id); location.hash = '#/exams'; });
A.printScores = a => { const ex = get('exams', a.id), l = examStudents(ex), sc = new Map(all('scores').filter(x => x.examId === ex.id).map(x => [x.studentId, x])); printHtml(`<div dir="rtl" style="font-family:Tajawal,Arial;color:#000"><h2>${esc(S().center)} — ${esc(ex.name)} (${esc(ex.date)})</h2><table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><tr><th>#</th><th>الطالب</th><th>الدرجة / ${ex.max}</th></tr>${l.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${sc.has(s.id) ? sc.get(s.id).score : 'غائب'}</td></tr>`).join('')}</table></div>`); };
document.addEventListener('change', e => {
  const i = e.target.closest('[data-score]'); if (!i) return; const exId = ui.route().arg, ex = get('exams', exId); if (!ex) return;
  const id = exId + '_' + i.dataset.score; if (i.value === '') { if (get('scores', id)) remove('scores', id); } else { let v = num(i.value); if (v > ex.max) { toast('الدرجة أكبر من النهائية', true); i.value = ''; return; } mem.scores.has(id) ? save('scores', { ...mem.scores.get(id), score: v, deleted: false }) : save('scores', { id, examId: exId, studentId: i.dataset.score, score: v }); }
  statExam(ex);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-score]')) { e.preventDefault(); const all = $$('[data-score]'), n = all[all.indexOf(e.target) + 1]; e.target.blur(); if (n) { n.focus(); n.select(); } } });

/* ---- التقارير ---- */
const RP = { m: curMonth() };
V.reports = () => {
  const m = RP.m, pays = all('payments').filter(p => p.date?.slice(0, 7) === m), rev = pays.reduce((a, p) => a + num(p.amount), 0), exp = all('expenses').filter(e => e.date?.slice(0, 7) === m).reduce((a, e) => a + num(e.amount), 0), share = rev * num(S().share) / 100;
  const byG = {}; pays.forEach(p => { const g = groupName(get('students', p.studentId)?.groupId) || 'بدون مجموعة'; byG[g] = (byG[g] || 0) + num(p.amount); });
  const unpaid = activeStudents().map(s => ({ s, st: payState(s, m) })).filter(x => x.st.k === 'er' || x.st.k === 'wa');
  const since = daysAgo(30), risk = activeStudents().map(s => ({ s, n: all('attendance').filter(a => a.studentId === s.id && a.status === 'a' && a.date >= since).length })).filter(x => x.n >= 3).sort((a, b) => b.n - a.n).slice(0, 15);
  const hon = activeStudents().map(s => { const sc = all('scores').filter(x => x.studentId === s.id).map(x => ({ p: num(x.score) / (get('exams', x.examId)?.max || 100) * 100 })); return { s, avg: sc.length ? sc.reduce((a, x) => a + x.p, 0) / sc.length : -1, n: sc.length }; }).filter(x => x.avg >= 0).sort((a, b) => b.avg - a.avg).slice(0, 10);
  return `<div class="bar"><input type="month" id="rm" value="${m}" style="max-width:170px"></div><div class="stats"><div class="stat"><small>الإيرادات</small><b>${money(rev)}</b></div><div class="stat"><small>المصروفات</small><b>${money(exp)}</b></div><div class="stat"><small>الصافي</small><b>${money(rev - exp)}</b></div>${num(S().share) ? `<div class="stat"><small>نسبة السنتر (${S().share}%)</small><b>${money(share)}</b></div>` : ''}</div>
  <div class="card"><h3>الإيراد حسب المجموعة</h3>${Object.entries(byG).map(([g, v]) => `<div class="row"><div class="g">${esc(g)}</div><b>${money(v)}</b></div>`).join('') || '<div class="empty">لا يوجد</div>'}</div>
  <div class="card"><h3>لم يسددوا عن ${monthName(m)} (${unpaid.length})</h3>${unpaid.slice(0, 60).map(({ s, st }) => `<div class="row"><div class="g"><b>${esc(s.name)}</b><small>${esc(groupName(s.groupId))} · متبقي ${money(st.fee - st.paid)}</small></div>${s.parentPhone || s.phone ? `<a class="ib" target="_blank" href="${waLink(s.parentPhone || s.phone, fill(S().tplDue, { name: s.name, month: monthName(m), amount: money(st.fee - st.paid) }))}">💬</a>` : ''}</div>`).join('') || '<div class="empty">الكل سدد 🎉</div>'}</div>
  <div class="card"><h3>⚠️ طلاب متكرر غيابهم (3+ مرات آخر 30 يوم)</h3>${risk.map(x => `<div class="row"><div class="g"><b>${esc(x.s.name)}</b><small>${esc(groupName(x.s.groupId))}</small></div><span class="pill er">${x.n} غياب</span></div>`).join('') || '<div class="empty">لا يوجد</div>'}</div>
  <div class="card"><h3>🏆 لوحة الشرف (متوسط الدرجات)</h3>${hon.map((x, i) => `<div class="row"><div class="g"><b>${i + 1}. ${esc(x.s.name)}</b><small>${esc(groupName(x.s.groupId))} · ${x.n} امتحان</small></div><b>${x.avg.toFixed(1)}%</b></div>`).join('') || '<div class="empty">ارصد درجات الأول</div>'}</div>`;
};
M.reports = () => { $('#rm').onchange = e => { RP.m = e.target.value || curMonth(); ui.render(); }; };

/* ---- الكروت ---- */
V.cards = () => `<div class="card"><h3>طباعة كروت الطلاب (QR + باركود)</h3><div class="f"><label>المجموعة</label><select id="cg">${groupOpts('', 'كل الطلاب')}</select></div><button class="btn" data-act="printCards">🖨 طباعة (A4 — 10 كروت بالصفحة)</button></div><div id="cprev" class="cards"></div>`;
M.cards = () => { const d = () => { const l = activeStudents().filter(s => !$('#cg').value || s.groupId === $('#cg').value).slice(0, 6); $('#cprev').innerHTML = l.map(cardHtml).join(''); renderCodes($('#cprev')); }; $('#cg').onchange = d; d(); };
A.printCards = () => { const g = $('#cg').value, l = activeStudents().filter(s => !g || s.groupId === g).sort((a, b) => a.name.localeCompare(b.name, 'ar')); if (!l.length) return toast('لا يوجد طلاب', true); printHtml(`<div class="cards">${l.map(cardHtml).join('')}</div>`); };

/* ---- الإعدادات والنسخ ---- */
V.settings = () => {
  const s = S(), c = cloud.cfg(), snaps = [...mem.snapshots.values()].sort((a, b) => b.at - a.at);
  return `<div class="card"><h3>بيانات السنتر</h3>${fld('اسم السنتر', 's_center', s.center)}${fld('اسم المدرس', 's_teacher', s.teacher)}<div class="grid2">${fld('سعر الاشتراك الشهري الافتراضي', 's_fee', s.fee, 'number')}${fld('نسبة السنتر % (اختياري)', 's_share', s.share, 'number')}</div><label><input type="checkbox" id="s_speak" ${s.speak ? 'checked' : ''} style="width:auto"> نطق اسم الطالب عند المسح</label><br><br><button class="btn" data-act="saveS">حفظ</button></div>
  <div class="card"><h3>الصفوف الدراسية</h3>${all('years').sort((a, b) => (a.order || 0) - (b.order || 0)).map(y => `<div class="row"><div class="g">${esc(y.name)}</div><button class="ib" data-act="renYear" data-id="${y.id}">✏️</button><button class="ib" data-act="delYear" data-id="${y.id}">🗑</button></div>`).join('')}<div class="bar" style="margin-top:8px"><input id="ny" placeholder="اسم صف جديد"><button class="btn" data-act="addYear">إضافة</button></div></div>
  <div class="card"><h3>☁️ المزامنة السحابية (وصول من أي جهاز + نسخة احتياطية مستمرة)</h3><p style="color:var(--mu);font-size:13px;margin-bottom:8px">الحالة: <b>${esc(c ? cloud.status : 'غير مفعّلة')}</b></p>${c ? `<div class="bar"><button class="btn ghost" data-act="cloudRe">إعادة اتصال / تسجيل دخول</button><button class="btn er sm" data-act="cloudOff">فصل</button></div>` : `<button class="btn" data-act="cloudSetup">إعداد المزامنة</button> <small>الخطوات في ملف README</small>`}</div>
  <div class="card"><h3>💾 النسخ الاحتياطي</h3><p style="color:var(--mu);font-size:13px;margin-bottom:8px">النظام بياخد نسخة تلقائية على الجهاز كل 5 دقايق عند وجود تغيير، وبيحتفظ بآخر 30.</p><div class="bar"><button class="btn" data-act="exportNow">⬇️ تنزيل نسخة كاملة</button><label class="btn ghost">⬆️ استيراد نسخة<input type="file" id="fimp" accept=".json,.js,.txt" hidden></label></div>
  ${snaps.slice(0, 8).map(x => `<div class="row"><div class="g"><small>${new Date(x.at).toLocaleString('ar-EG')} · ${x.counts?.students || 0} طالب · ${x.kind === 'auto' ? 'تلقائي' : esc(x.kind)}</small></div><button class="btn sm ghost" data-act="restoreSnap" data-id="${x.id}">استعادة</button></div>`).join('')}</div>
  <div class="card"><h3>🔄 نقل البيانات من النظام القديم</h3><p style="color:var(--mu);font-size:13px;margin-bottom:8px">في البرنامج القديم افتح <b>مركز حماية البيانات</b> ← <b>حفظ نسخة الآن</b> هينزّل ملف <b>data.js</b>. اختاره من هنا.</p><label class="btn">📂 اختيار ملف data.js<input type="file" id="fold" accept=".js,.json,.txt" hidden></label></div>
  <div class="card"><h3>🔒 قفل التطبيق</h3><p style="color:var(--mu);font-size:13px;margin-bottom:8px">رقم سري لفتح التطبيق على هذا الجهاز (حماية بسيطة للواجهة).</p><div class="bar"><input id="pin" type="password" placeholder="رقم سري جديد (فاضي = إلغاء القفل)"><button class="btn" data-act="setPin">حفظ</button></div></div>
  <div class="card"><h3>💬 قوالب رسائل الواتساب</h3><small>المتغيرات: [[name]] [[date]] [[time]] [[amount]] [[month]]</small>${['Present:حضور', 'Absent:غياب', 'Pay:دفع', 'Due:تذكير بالاشتراك'].map(x => { const [k, t] = x.split(':'); return `<div class="f"><label>${t}</label><textarea id="tpl${k}" rows="2">${esc(s['tpl' + k])}</textarea></div>`; }).join('')}<button class="btn" data-act="saveTpl">حفظ القوالب</button></div>`;
};
M.settings = () => { $('#fimp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = parseLegacy(await f.text()); if (d.app !== 'edu-center') return importLegacy(f); confirmBox('استعادة كاملة (تستبدل بياناتك الحالية) ولا دمج؟ اضغط "استعادة" للاستبدال.', async () => { await snapshot('before-restore'); await restoreData(d, true); toast('تمت الاستعادة ✅'); ui.render(); }, 'استعادة (استبدال)'); } catch (er) { toast('ملف غير صالح', true); } }; $('#fold').onchange = e => e.target.files[0] && importLegacy(e.target.files[0]); };
A.saveS = () => { setS({ center: $('#s_center').value.trim() || 'اسم السنتر', teacher: $('#s_teacher').value.trim(), fee: num($('#s_fee').value), share: num($('#s_share').value), speak: $('#s_speak').checked }); toast('تم الحفظ ✅'); ui.render(); };
A.saveTpl = () => { setS({ tplPresent: $('#tplPresent').value, tplAbsent: $('#tplAbsent').value, tplPay: $('#tplPay').value, tplDue: $('#tplDue').value }); toast('تم الحفظ ✅'); };
A.addYear = () => { const n = $('#ny').value.trim(); if (!n) return; save('years', { id: uid(), name: n, order: all('years').length }); ui.render(); };
A.renYear = a => { const y = get('years', a.id); modal('تعديل الصف', fld('الاسم', 'name', y.name), [{ t: 'حفظ', fn: d => { if (d.name) save('years', { ...y, name: d.name }); closeModal(); ui.render(); } }]); };
A.delYear = a => confirmBox('حذف الصف؟', () => { remove('years', a.id); ui.render(); });
A.setPin = () => { const p = $('#pin').value; if (!p) { localStorage.removeItem('pin'); localStorage.removeItem('pinA'); toast('تم إلغاء القفل'); } else { localStorage.pin = hashPin(p); toast('تم تفعيل القفل ✅'); } $('#pin').value = ''; };
A.exportNow = () => { download('edu-center-backup-' + today() + '.json', JSON.stringify(dump())); setS({ lastExport: Date.now() }); toast('تم تنزيل النسخة ✅'); ui.banner(); };
A.restoreSnap = a => confirmBox('استعادة النسخة دي؟ (هتستبدل البيانات الحالية، وبيتاخد نسخة من الحالي قبلها)', async () => { const s = get('snapshots', a.id) || mem.snapshots.get(a.id); await snapshot('before-restore'); await restoreData(JSON.parse(s.data), true); toast('تمت الاستعادة ✅'); ui.render(); }, 'استعادة');
A.cloudSetup = () => modal('إعداد المزامنة', `<p style="font-size:13px;color:var(--mu)">الصق إعدادات Firebase (firebaseConfig) والإيميل وكلمة السر اللي عملتها في Firebase Authentication.</p><div class="f"><label>firebaseConfig</label><textarea name="cfg" rows="6" placeholder="{ apiKey: '...', authDomain: '...', projectId: '...' }"></textarea></div>${fld('الإيميل', 'email', localStorage.getItem('cloudEmail') || '', 'email')}${fld('كلمة السر', 'pass', '', 'password')}`, [{
  t: 'اتصال', fn: async d => {
    let cfg; try { const i = d.cfg.indexOf('{'), j = d.cfg.lastIndexOf('}'); cfg = (new Function('return (' + d.cfg.slice(i, j + 1) + ')'))(); if (!cfg.projectId || !cfg.apiKey) throw 0; } catch (e) { return toast('إعدادات Firebase غير صحيحة', true); }
    localStorage.cloudCfg = JSON.stringify({ config: cfg }); localStorage.cloudEmail = d.email; toast('جاري الاتصال...');
    try { await cloud.login(d.email, d.pass); closeModal(); toast('تم الاتصال ✅'); ui.render(); } catch (e) { toast('فشل الدخول: تأكد من الإيميل وكلمة السر', true); }
  }
}]);
A.cloudRe = () => modal('تسجيل الدخول', fld('الإيميل', 'email', localStorage.getItem('cloudEmail') || '', 'email') + fld('كلمة السر', 'pass', '', 'password'), [{ t: 'دخول', fn: async d => { try { await cloud.login(d.email, d.pass); localStorage.cloudEmail = d.email; closeModal(); toast('تم ✅'); ui.render(); } catch (e) { toast('فشل الدخول', true); } } }]);
A.cloudOff = () => confirmBox('فصل المزامنة؟ بياناتك هتفضل على الجهاز ومش هتتحدث على الأجهزة التانية.', () => { cloud.stop(); try { cloud.auth?.signOut(); } catch (e) { } localStorage.removeItem('cloudCfg'); cloud.status = 'غير مفعّل'; ui.render(); });

/* ---- أحداث عامة ---- */
A.closeM = closeModal; A.theme = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; localStorage.theme = t; };
A.lockNow = () => location.reload();
A.more = () => { $('#modal').innerHTML = `<div class="ov" style="align-items:flex-end"><div class="sheet" style="position:static;width:100%;max-width:520px;border-radius:18px">${Object.entries(routes).filter(([k, r]) => !mainNav.includes(k) && (isTeacher() || !r.teacherOnly)).map(([k, r]) => `<a href="#/${k}" data-act="closeM">${r.i} ${r.t}</a>`).join('')}</div></div>`; };
document.addEventListener('click', e => {
  if (e.target.classList?.contains('ov')) return closeModal();
  const mb = e.target.closest('[data-mb]'); if (mb) { const b = modalBtns[+mb.dataset.mb]; return b && b.fn(formData()); }
  const a = e.target.closest('[data-act]'); if (a && A[a.dataset.act]) { if (a.tagName === 'A' && a.dataset.act === 'closeM') closeModal(); else A[a.dataset.act](a.dataset, e); }
});
window.addEventListener('hashchange', () => { closeModal(); ui.render(); });
window.addEventListener('online', () => cloud.init());
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) snapshot('auto'); });
setInterval(() => { if (dirty) snapshot('auto'); }, 5 * 60 * 1000);

/* ---- القفل ---- */
function hashPin(p) { let h = 5381; const s = 'edu|' + p; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); }
function roleGate() {
  if (ROLE === 'assistant' && S().asstNoMobile !== false && matchMedia('(max-width:800px) and (pointer:coarse)').matches) {
    const el = $('#lock'); el.hidden = false; el.innerHTML = '<div class="card"><div style="font-size:40px">📵</div><h3>غير مسموح على الموبايل</h3><p style="color:var(--mu);margin:8px 0">تطبيق الموبايل للمدرس فقط. استخدم اللابتوب في السنتر.</p><button class="btn" onclick="location.reload()" style="width:100%">رجوع</button></div>'; return false;
  }
  return true;
}
function lockScreen() {
  return new Promise(res => {
    const el = $('#lock'); el.hidden = false; el.innerHTML = `<div class="card"><div style="font-size:40px">🔒</div><h3>${esc(S().center)}</h3><input id="lp" type="password" placeholder="الرقم السري" inputmode="numeric" style="text-align:center;margin:10px 0"><button class="btn" id="lb" style="width:100%">دخول</button></div>`;
    const go = () => { const h = hashPin($('#lp').value); if (h === localStorage.pin) ROLE = 'teacher'; else if (localStorage.pinA && h === localStorage.pinA) ROLE = 'assistant'; else { toast('رقم سري غلط', true); $('#lp').value = ''; return; } el.hidden = true; el.innerHTML = ''; res(); };
    $('#lb').onclick = go; $('#lp').onkeydown = e => e.key === 'Enter' && go(); $('#lp').focus();
  });
}

/* ================= التشغيل ================= */
(async function boot() {
  document.documentElement.dataset.theme = localStorage.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  try { await openDB(); await loadAll(); } catch (e) { document.body.innerHTML = '<p style="padding:30px;text-align:center">المتصفح ده مش بيسمح بتخزين البيانات (وضع التصفح الخفي؟). افتح التطبيق في نافذة عادية.</p>'; return; }
  if (navigator.storage?.persist) navigator.storage.persist();
  if (!mem.years.size && !mem.students.size) ['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي'].forEach((n, i) => save('years', { id: 'y' + (i + 1), name: n, order: i }, { noSync: true }));
  if (localStorage.pin) await lockScreen();
  if (!roleGate()) return;
  ui.render(); cloud.init();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
})();

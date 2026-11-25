'use strict';
/* =====================================================================
   ميزات إضافية: واتساب تلقائي (WhatsApp Cloud API عبر Worker) + تقرير يومي PDF
   ===================================================================== */
Object.assign(DEF, {
  waUrl: '', waSecret: '', waLang: 'ar', ownerPhone: '', lateGrace: 10, autoAbsent: true, reportAuto: true, reportTime: '22:00',
  waTplPresent: 'attendance_present', waTplLate: 'attendance_late', waTplAbsent: 'attendance_absent', waTplPay: 'payment_received', waTplDaily: 'daily_summary',
  waSendPresent: true, waSendLate: true, waSendAbsent: true, waSendPay: true, waSendDaily: true
});
const WA_KINDS = [['Present', 'حضور'], ['Late', 'تأخير'], ['Absent', 'غياب'], ['Pay', 'دفع'], ['Daily', 'ملخص يومي للمدرس']];
const cap = k => k[0].toUpperCase() + k.slice(1);
const waHere = () => localStorage.waHere === '1' && !!S().waUrl;

/* ---------------- طابور الرسائل ---------------- */
function qWA(kind, s, params, key) {
  if (!waHere()) return;
  const c = S(); if (c['waSend' + cap(kind)] === false) return;
  const to = intlPhone(s.parentPhone || s.phone); if (!to) return;
  const id = 'wa_' + key; if (mem.outbox.has(id)) return;
  save('outbox', { id, kind, to, template: c['waTpl' + cap(kind)], lang: c.waLang || 'ar', params: params.map(x => String(x ?? '').trim() || '-'), studentId: s.id || '', name: s.name || '', status: 'pending', tries: 0, at: Date.now() }, { keep: true });
  flushWA();
}
let flushing = false;
async function flushWA() {
  if (flushing || !idb || !waHere() || !navigator.onLine) return; flushing = true; const c = S();
  try {
    const q = [...mem.outbox.values()].filter(o => o.status === 'pending').sort((a, b) => a.at - b.at);
    for (const o of q) {
      try {
        const r = await fetch(c.waUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Secret': c.waSecret || '' }, body: JSON.stringify({ to: o.to, template: o.template, lang: o.lang, params: o.params }) });
        if (r.ok) save('outbox', { ...o, status: 'sent', sentAt: Date.now(), error: '' }, { keep: true });
        else { const t = await r.text().catch(() => ''), hard = r.status >= 400 && r.status < 500 && r.status !== 429; save('outbox', { ...o, tries: o.tries + 1, status: hard || o.tries + 1 >= 5 ? 'failed' : 'pending', error: (r.status + ' ' + t).slice(0, 300) }, { keep: true }); }
      } catch (e) { break; }
      await new Promise(r => setTimeout(r, 350));
    }
  } finally { flushing = false; if ($('#banner')) ui.banner(); }
}

/* ---------------- المؤقّت: غياب تلقائي + تقرير يومي ---------------- */
function tick() {
  if (!idb || !mem.settings) return;
  const t = today(), now = nowTime(), nm = mins(now), c = S();
  if (c.autoAbsent !== false) {
    all('groups').forEach(g => {
      const e = mins(g.end); if (e == null || nm < e) return;
      const key = 'aa_' + t + '_' + g.id; if (localStorage.getItem(key)) return; localStorage.setItem(key, '1');
      if (nm - e > 180) return;
      if (all('attendance').some(a => a.date === t && a.groupId === g.id && a.status === 'p')) {
        const n = absentRest(g.id, t); if (n) { toast('اتسجل غياب ' + n + ' طالب — ' + g.name); if (ui.route().name === 'attendance' && $('#alist') && AT.d === t) drawAtt(); }
      }
    });
  }
  if (c.reportAuto !== false && c.reportTime && now >= c.reportTime && localStorage.lastReport !== t) {
    localStorage.lastReport = t;
    if (all('attendance').some(a => a.date === t)) runReport(t, true);
  }
  flushWA();
}
setInterval(tick, 60000);
setTimeout(tick, 4000);
window.addEventListener('online', () => setTimeout(flushWA, 800));
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
setTimeout(() => { if (!idb) return; const old = Date.now() - 60 * 864e5; [...mem.outbox.values()].filter(o => o.status === 'sent' && o.at < old).forEach(o => hardDelete('outbox', o.id)); }, 8000);

/* ---------------- بيانات التقرير ---------------- */
function reportData(date) {
  const since = (() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 30); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })();
  const recs = all('attendance').filter(a => a.date === date), presRecs = recs.filter(a => a.status === 'p'), presentIds = new Set(presRecs.map(a => a.studentId));
  const gids = [...new Set(presRecs.map(a => a.groupId || ''))];
  const groups = gids.map(gid => {
    const g = get('groups', gid), students = gid ? activeStudents().filter(s => s.groupId === gid) : [];
    return { g, name: g?.name || 'بدون مجموعة', pres: presRecs.filter(a => (a.groupId || '') === gid).sort((a, b) => (a.time || '').localeCompare(b.time || '')), abs: students.filter(s => !presentIds.has(s.id)) };
  });
  const lates = presRecs.filter(a => a.late).sort((a, b) => b.lateMin - a.lateMin);
  const pays = all('payments').filter(p => p.date === date), exps = all('expenses').filter(e => e.date === date);
  const collected = pays.reduce((a, p) => a + num(p.amount), 0), spent = exps.reduce((a, e) => a + num(e.amount), 0);
  const pct = sc => { const ex = get('exams', sc.examId); return ex && ex.max ? num(sc.score) / ex.max * 100 : null; };
  const exams = all('exams').filter(e => e.date === date).map(e => {
    const l = all('scores').filter(x => x.examId === e.id).map(x => ({ s: get('students', x.studentId), v: num(x.score), p: num(x.score) / (e.max || 100) * 100 })).filter(x => x.s).sort((a, b) => b.v - a.v);
    return { e, l, avg: l.length ? l.reduce((a, x) => a + x.p, 0) / l.length : 0 };
  });
  const lvl = all('groups').map(g => {
    const ids = new Set(activeStudents().filter(s => s.groupId === g.id).map(s => s.id));
    const v = all('scores').filter(x => ids.has(x.studentId) && (get('exams', x.examId)?.date || '') >= since).map(pct).filter(x => x != null);
    return { name: g.name, n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  }).filter(x => x.n);
  const risk = activeStudents().map(s => ({ s, ab: all('attendance').filter(a => a.studentId === s.id && a.status === 'a' && a.date >= since && a.date <= date).length, lt: all('attendance').filter(a => a.studentId === s.id && a.late && a.date >= since && a.date <= date).length })).filter(x => x.ab >= 3 || x.lt >= 3).sort((a, b) => (b.ab + b.lt) - (a.ab + a.lt)).slice(0, 10);
  const honor = activeStudents().map(s => { const v = all('scores').filter(x => x.studentId === s.id).map(pct).filter(x => x != null); return { s, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1 }; }).filter(x => x.avg >= 0).sort((a, b) => b.avg - a.avg).slice(0, 5);
  return { date, groups, lates, pays, exps, collected, spent, exams, lvl, risk, honor, present: presRecs.length, absent: groups.reduce((a, g) => a + g.abs.length, 0), late: lates.length };
}
function reportHtml(d) {
  const c = S(), day = new Date(d.date + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long' });
  const th = 'style="background:#eef2ff;padding:6px;border:1px solid #ccc;text-align:right"', td = 'style="padding:5px 6px;border:1px solid #ddd;text-align:right"';
  const tbl = (heads, rows) => rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px"><tr>${heads.map(h => `<th ${th}>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(x => `<td ${td}>${x}</td>`).join('')}</tr>`).join('')}</table>` : '<div style="color:#888;font-size:13px;margin-bottom:8px">لا يوجد</div>';
  const h2 = t => `<h2 style="font-size:16px;margin:16px 0 6px;color:#4f46e5;border-bottom:2px solid #4f46e5;padding-bottom:3px">${t}</h2>`;
  const box = (l, v, col) => `<td style="border:1px solid #ddd;padding:8px;text-align:center;width:16.6%"><div style="font-size:12px;color:#666">${l}</div><div style="font-size:20px;font-weight:800;color:${col || '#111'}">${v}</div></td>`;
  const net = d.collected - d.spent;
  let h = `<div dir="rtl" style="width:794px;padding:28px;box-sizing:border-box;font-family:Tajawal,Arial,sans-serif;color:#111;background:#fff">
  <div style="text-align:center;border-bottom:3px solid #4f46e5;padding-bottom:8px"><div style="font-size:22px;font-weight:800">${esc(c.center)}</div><div style="font-size:13px;color:#555">${esc(c.teacher)}</div><div style="font-size:16px;margin-top:4px">التقرير اليومي — ${esc(day)} ${esc(d.date)}</div></div>
  <table style="width:100%;border-collapse:collapse;margin-top:10px"><tr>${box('حضور', d.present, '#059669')}${box('غياب', d.absent, '#dc2626')}${box('متأخرين', d.late, '#d97706')}${box('التحصيل', money(d.collected))}${box('المصروفات', money(d.spent))}${box('الصافي', money(net), net < 0 ? '#dc2626' : '#059669')}</tr></table>`;
  h += h2('الحضور والغياب');
  if (!d.groups.length) h += '<div style="color:#888;font-size:13px">لا يوجد حضور مسجل اليوم</div>';
  d.groups.forEach(g => {
    h += `<div style="font-weight:700;margin:8px 0 4px">${esc(g.name)}${g.g?.time ? ' — ' + esc(g.g.time) : ''} <span style="font-weight:400;color:#666;font-size:12px">(حضر ${g.pres.length} / غاب ${g.abs.length})</span></div>`;
    h += tbl(['#', 'الطالب', 'الكود', 'وقت الحضور', 'الحالة'], g.pres.map((a, i) => { const s = get('students', a.studentId) || {}; return [i + 1, esc(s.name || ''), esc(s.code || ''), esc(a.time || ''), a.late ? `<span style="color:#d97706">متأخر ${a.lateMin} د</span>` : 'في الموعد']; }));
    if (g.abs.length) h += `<div style="font-size:13px;margin-bottom:4px;color:#dc2626"><b>الغائبون:</b></div>` + tbl(['#', 'الطالب', 'هاتف ولي الأمر'], g.abs.map((s, i) => [i + 1, esc(s.name), esc(s.parentPhone || s.phone || '')]));
  });
  h += h2('المتأخرون') + tbl(['الطالب', 'المجموعة', 'وقت الحضور', 'التأخير'], d.lates.map(a => { const s = get('students', a.studentId) || {}; return [esc(s.name || ''), esc(groupName(a.groupId)), esc(a.time || ''), a.lateMin + ' دقيقة']; }));
  h += h2('المالية') + `<div style="font-weight:700;margin-bottom:4px">المقبوضات</div>` + tbl(['وصل', 'الطالب', 'البيان', 'المبلغ'], d.pays.map(p => [esc(p.receiptNo || ''), esc(get('students', p.studentId)?.name || ''), p.type === 'other' ? esc(p.note || 'أخرى') : 'اشتراك ' + esc(monthName(p.month)), money(p.amount)]));
  h += `<div style="font-weight:700;margin-bottom:4px">المصروفات</div>` + tbl(['الفئة', 'ملاحظة', 'المبلغ'], d.exps.map(e => [esc(e.category), esc(e.note || ''), money(e.amount)]));
  h += `<div style="font-size:14px;font-weight:700">الإجمالي: تحصيل ${money(d.collected)} − مصروفات ${money(d.spent)} = <span style="color:${net < 0 ? '#dc2626' : '#059669'}">${money(net)}</span></div>`;
  h += h2('المستوى الدراسي');
  if (d.exams.length) d.exams.forEach(x => {
    h += `<div style="font-weight:700;margin:6px 0 4px">${esc(x.e.name)} <span style="font-weight:400;color:#666;font-size:12px">(من ${x.e.max} — ${x.l.length} درجة — المتوسط ${x.avg.toFixed(1)}%)</span></div>`;
    const top = x.l.slice(0, 3), bot = x.l.length > 6 ? x.l.slice(-3) : [];
    h += tbl(['', 'الطالب', 'الدرجة'], [...top.map((r, i) => ['🏆 ' + (i + 1), esc(r.s.name), r.v]), ...bot.map(r => ['⚠️ أقل', esc(r.s.name), r.v])]);
  });
  else h += '<div style="color:#888;font-size:13px;margin-bottom:6px">لا توجد امتحانات اليوم</div>';
  h += `<div style="font-weight:700;margin:6px 0 4px">متوسط المستوى لكل مجموعة (آخر 30 يوم)</div>` + tbl(['المجموعة', 'عدد الدرجات', 'المتوسط'], d.lvl.map(x => [esc(x.name), x.n, x.avg.toFixed(1) + '%']));
  h += `<div style="font-weight:700;margin:6px 0 4px">طلاب بحاجة متابعة (غياب أو تأخير 3+ مرات في 30 يوم)</div>` + tbl(['الطالب', 'المجموعة', 'غياب', 'تأخير'], d.risk.map(x => [esc(x.s.name), esc(groupName(x.s.groupId)), x.ab, x.lt]));
  h += `<div style="font-weight:700;margin:6px 0 4px">الأوائل (متوسط الدرجات)</div>` + tbl(['#', 'الطالب', 'المتوسط'], d.honor.map((x, i) => [i + 1, esc(x.s.name), x.avg.toFixed(1) + '%']));
  return h + `<div style="margin-top:14px;font-size:11px;color:#888;text-align:center">صدر بتاريخ ${new Date().toLocaleString('ar-EG')}</div></div>`;
}

/* ---------------- توليد PDF وحفظه ---------------- */
async function makePdf(html) {
  await loadLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1'; host.innerHTML = html; document.body.appendChild(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const { jsPDF } = window.jspdf, pdf = new jsPDF('p', 'mm', 'a4'), pw = 210, ph = 297, pageH = Math.floor(canvas.width * ph / pw);
    for (let y = 0, first = true; y < canvas.height; y += pageH) {
      const sl = document.createElement('canvas'); sl.width = canvas.width; sl.height = Math.min(pageH, canvas.height - y);
      const cx = sl.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, sl.width, sl.height); cx.drawImage(canvas, 0, y, canvas.width, sl.height, 0, 0, canvas.width, sl.height);
      if (!first) pdf.addPage(); first = false;
      pdf.addImage(sl.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, sl.height * pw / canvas.width);
    }
    return pdf.output('blob');
  } finally { host.remove(); }
}
async function saveReport(blob, name, interactive) {
  const row = mem.kv.get('reportDir');
  if (row?.handle) {
    try {
      let p = await row.handle.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted' && interactive) p = await row.handle.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') { const fh = await row.handle.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(blob); await w.close(); return 'folder'; }
    } catch (e) { if (!interactive) return 'pending'; }
  }
  if (interactive) { download(name, blob, 'application/pdf'); return 'download'; }
  return 'pending';
}
let pendingReport = null;
async function runReport(date, auto) {
  try {
    if (!auto) toast('جاري تجهيز التقرير...');
    const d = reportData(date), blob = await makePdf(reportHtml(d)), name = 'تقرير-' + date + '.pdf', how = await saveReport(blob, name, !auto);
    if (how === 'folder') toast('✅ اتحفظ التقرير في مجلد: ' + (mem.kv.get('reportDir')?.name || ''));
    else if (how === 'download') toast('اتنزّل التقرير ✅');
    else { pendingReport = { blob, name, date }; ui.banner(); toast('📄 تقرير اليوم جاهز — اضغط حفظ'); }
    if (S().ownerPhone) qWA('daily', { parentPhone: S().ownerPhone, name: 'المدرس' }, [date, d.present, d.absent, d.late, money(d.collected)], 'daily_' + date);
  } catch (e) { if (auto) localStorage.removeItem('lastReport'); else toast('تعذر إنشاء التقرير. محتاج نت أول مرة لتحميل مكتبة PDF', true); }
}
A.savePending = async () => { if (!pendingReport) return; const r = await saveReport(pendingReport.blob, pendingReport.name, true); if (r !== 'pending') { toast(r === 'folder' ? '✅ اتحفظ في المجلد' : 'اتنزّل ✅'); pendingReport = null; ui.banner(); } };
A.genReport = () => runReport($('#rd')?.value || today(), false);
A.pickDir = async () => {
  if (!window.showDirectoryPicker) return toast('المتصفح ده مش بيدعم اختيار مجلد. استخدم Chrome أو Edge على الكمبيوتر، وفي غيره التقارير بتتنزّل في التنزيلات', true);
  try { const h = await showDirectoryPicker({ mode: 'readwrite', id: 'edu-reports' }); save('kv', { id: 'reportDir', handle: h, name: h.name }, { keep: true, noSync: true }); toast('✅ تم تحديد المجلد: ' + h.name); ui.render(); } catch (e) { }
};
A.clearDir = () => { hardDelete('kv', 'reportDir'); ui.render(); };

/* ---------------- الواجهة ---------------- */
function extraBanner() {
  let h = '';
  if (pendingReport) h += `<div class="warn" style="margin-bottom:8px"><span>📄 تقرير ${esc(pendingReport.date)} جاهز — اضغط لحفظه في المجلد.</span><button class="btn sm" data-act="savePending">حفظ التقرير</button></div>`;
  const failed = [...mem.outbox.values()].filter(o => o.status === 'failed').length;
  if (waHere() && failed) h += `<div class="warn" style="margin-bottom:8px"><span>⚠️ ${failed} رسالة واتساب فشلت.</span><a class="btn sm" href="#/settings">التفاصيل</a></div>`;
  return h;
}
const _vReports = V.reports;
V.reports = () => `<div class="card"><h3>📄 تقرير يومي PDF</h3><div class="bar"><input type="date" id="rd" value="${today()}" style="max-width:170px"><button class="btn" data-act="genReport">إنشاء وحفظ التقرير</button></div><small style="color:var(--mu)">بيتحفظ في المجلد المحدد في الإعدادات، أو بيتنزّل.</small></div>` + _vReports();
const _vSettings = V.settings;
V.settings = () => {
  const s = S(), dir = mem.kv.get('reportDir'), ob = [...mem.outbox.values()], pend = ob.filter(o => o.status === 'pending').length, sent = ob.filter(o => o.status === 'sent').length, fail = ob.filter(o => o.status === 'failed').sort((a, b) => b.at - a.at);
  const chk = (id, v) => `<label style="display:inline-flex;gap:6px;align-items:center;margin:0 0 6px 14px"><input type="checkbox" id="${id}" ${v ? 'checked' : ''} style="width:auto">`;
  return _vSettings() + `
  <div class="card"><h3>📄 التقرير اليومي (PDF)</h3>
    <p style="color:var(--mu);font-size:13px;margin-bottom:8px">فيه: الحضور والغياب والتأخير والمصروفات والمستوى. بيتولّد تلقائي في الوقت المحدد لو التطبيق مفتوح.</p>
    <div class="row"><div class="g"><b>مجلد الحفظ</b><small>${dir ? '📁 ' + esc(dir.name) : 'غير محدد (هيتنزّل في التنزيلات)'}</small></div><div class="acts"><button class="btn sm" data-act="pickDir">${dir ? 'تغيير' : 'تحديد المجلد'}</button>${dir ? '<button class="btn sm er" data-act="clearDir">إلغاء</button>' : ''}</div></div>
    <div class="grid2" style="margin-top:10px">${fld('وقت التقرير التلقائي', 'r_time', s.reportTime, 'time')}<div class="f"><label>&nbsp;</label>${chk('r_auto', s.reportAuto !== false)} توليد تلقائي يوميًا</label></div></div>
    <button class="btn" data-act="saveRep">حفظ</button></div>
  <div class="card"><h3>💬 واتساب التلقائي</h3>
    <p style="color:var(--mu);font-size:13px;margin-bottom:8px">إرسال رسائل الحضور والتأخير والغياب والدفع لولي الأمر تلقائيًا عبر WhatsApp Cloud API الرسمي. الإعداد في ملف WHATSAPP-SETUP.md.</p>
    <div>${chk('w_here', localStorage.waHere === '1')} تشغيل الإرسال التلقائي على <b>هذا الجهاز</b></label></div>
    <small style="color:var(--mu)">شغّله على جهاز واحد بس (جهاز السنتر) عشان الرسالة متتبعتش مرتين.</small>
    ${fld('رابط الـ Worker', 'w_url', s.waUrl, 'url', 'placeholder="https://xxx.workers.dev"')}${fld('الرمز السري للـ Worker', 'w_secret', s.waSecret, 'password')}
    <div class="grid2">${fld('لغة القوالب', 'w_lang', s.waLang)}${fld('رقم المدرس (للملخص اليومي)', 'w_owner', s.ownerPhone, 'tel')}</div>
    <div class="grid2">${fld('سماح التأخير الافتراضي (دقيقة)', 'w_grace', s.lateGrace, 'number')}<div class="f"><label>&nbsp;</label>${chk('w_auto', s.autoAbsent !== false)} غياب تلقائي بعد نهاية الحصة</label></div></div>
    <div style="margin:6px 0"><b style="font-size:13px">إرسال رسائل:</b><br>${WA_KINDS.map(([k, t]) => chk('w_s' + k, s['waSend' + k] !== false) + t + '</label>').join('')}</div>
    <b style="font-size:13px">أسماء القوالب المعتمدة في Meta:</b>
    <div class="grid2">${WA_KINDS.map(([k, t]) => fld(t, 'w_t' + k, s['waTpl' + k])).join('')}</div>
    <div class="bar"><button class="btn" data-act="saveWA">حفظ</button><button class="btn ghost" data-act="testWA">إرسال تجربة للمدرس</button></div>
    <p style="font-size:13px;margin-top:6px">في الانتظار: <b>${pend}</b> · اتبعت: <b>${sent}</b> · فشل: <b>${fail.length}</b></p>
    ${fail.slice(0, 5).map(o => `<div class="row"><div class="g"><b>${esc(o.name || o.to)}</b><small>${esc(o.kind)} · ${esc(o.error || '')}</small></div></div>`).join('')}
    ${fail.length ? '<button class="btn sm ghost" data-act="retryWA">إعادة المحاولة للفاشل</button>' : ''}</div>`;
};
A.saveRep = () => { setS({ reportTime: $('#r_time').value || '22:00', reportAuto: $('#r_auto').checked }); toast('تم الحفظ ✅'); };
A.saveWA = () => {
  localStorage.waHere = $('#w_here').checked ? '1' : '0';
  const p = { waUrl: $('#w_url').value.trim(), waSecret: $('#w_secret').value.trim(), waLang: $('#w_lang').value.trim() || 'ar', ownerPhone: $('#w_owner').value.trim(), lateGrace: num($('#w_grace').value), autoAbsent: $('#w_auto').checked };
  WA_KINDS.forEach(([k]) => { p['waSend' + k] = $('#w_s' + k).checked; p['waTpl' + k] = $('#w_t' + k).value.trim(); });
  setS(p); toast('تم الحفظ ✅'); ui.render(); flushWA();
};
A.testWA = () => { if (!waHere()) return toast('فعّل الإرسال على الجهاز وحط رابط الـ Worker واحفظ الأول', true); if (!S().ownerPhone) return toast('اكتب رقم المدرس واحفظ', true); qWA('daily', { parentPhone: S().ownerPhone, name: 'المدرس' }, [today(), 1, 0, 0, money(0)], 'test_' + Date.now()); toast('اتحطت رسالة تجربة في الطابور'); setTimeout(ui.render, 2500); };
A.retryWA = () => { [...mem.outbox.values()].filter(o => o.status === 'failed').forEach(o => save('outbox', { ...o, status: 'pending', tries: 0 }, { keep: true })); flushWA(); toast('جاري إعادة المحاولة'); setTimeout(ui.render, 2500); };

/* ================= محوّل نسخة النظام القديم (ALAMIN_BACKUP_V3) ================= */
function mapAlamin(root) {
  const D = root.__dict__ || [], T = root.tables || {};
  const dec = v => (typeof v === 'string' && /^~\d+$/.test(v)) ? D[+v.slice(1)] : v;
  const rows = name => { const t = T[name]; if (!t || !t.cols) return []; const ks = Object.keys(t.cols), n = t.n ?? (t.cols[ks[0]] || []).length, out = []; for (let i = 0; i < n; i++) { const r = {}; ks.forEach(k => { r[k] = dec(t.cols[k][i]); }); out.push(r); } return out; };
  const cairoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = iso => { const x = {}; cairoFmt.formatToParts(new Date(iso)).forEach(p => { x[p.type] = p.value; }); return { date: x.year + '-' + x.month + '-' + x.day, time: (x.hour === '24' ? '00' : x.hour) + ':' + x.minute }; };
  const dayOf = v => { if (!v) return ''; const s = String(v); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d = new Date(typeof v === 'number' ? v : s); return isNaN(d) ? '' : parts(d).date; };
  const ad = s => String(s ?? '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  const slug = x => String(x).replace(/[^\p{L}\p{N}]+/gu, '_');
  const res = { years: [], groups: [], students: [], attendance: [], payments: [], expenses: [], exams: [], scores: [], notes: [] };

  // الصفوف: prep1..3 = الإعدادي، 1..3 = الثانوي (مستنتج من أسماء المجموعات)
  const ord = ['الأول', 'الثاني', 'الثالث'], gName = g => { g = String(g || ''); const m = g.match(/^prep(\d)$/); if (m) return ord[m[1] - 1] + ' الإعدادي'; if (/^\d$/.test(g)) return ord[g - 1] + ' الثانوي'; const gl = (root.gradesList || []).find(x => String(x.id) === g); return gl ? gl.name : ''; };
  const ys = new Map(); const yearId = g => { const n = gName(g); if (!n) return ''; if (!ys.has(n)) { const y = { id: 'y_' + slug(n), name: n, order: res.years.length }; ys.set(n, y); res.years.push(y); } return ys.get(n).id; };
  ['الأول الإعدادي', 'الثاني الإعدادي', 'الثالث الإعدادي', 'الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'].forEach(n => { if (!ys.has(n)) { const y = { id: 'y_' + slug(n), name: n, order: res.years.length }; ys.set(n, y); res.years.push(y); } });

  // المجموعات
  const cycles = rows('cycles').sort((a, b) => String(a.date).localeCompare(String(b.date))), feeByG = {}; cycles.forEach(c => { if (c.gid && num(c.fee) > 0) feeByG[String(c.gid)] = num(c.fee); });
  const lg = rows('groups'), nameCount = {}; lg.forEach(g => { const k = String(g.nm || '').trim(); nameCount[k] = (nameCount[k] || 0) + 1; });
  const hhmm = (h, m) => pad(h) + ':' + pad(m || 0);
  const parseSpan = ti => { const t = ad(ti), m = t.match(/(\d{1,2})[:.](\d{2})\s*([صم])?\s*[—\-–]\s*(\d{1,2})[:.](\d{2})\s*([صم])?/); if (!m) { const one = t.match(/^\s*(\d{1,2})(?:[.:](\d{1,2}))?\s*$/); if (one) { let h = +one[1]; const mm = one[2] ? (one[2].length === 1 ? +one[2] * 10 : +one[2]) : 0; if (h < 8) h += 12; return { start: hhmm(h, mm), end: '' }; } return {}; } const f = (h, mi, ap) => { h = +h; if (ap === 'م' && h < 12) h += 12; if (ap === 'ص' && h === 12) h = 0; return hhmm(h, +mi); }; return { start: f(m[1], m[2], m[3] || m[6]), end: f(m[4], m[5], m[6] || m[3]) }; };
  const gMap = new Map();
  lg.forEach(g => {
    const base = String(g.nm || 'مجموعة').trim(), yid = yearId(g.gr), nm = nameCount[base] > 1 ? base + ' — ' + (gName(g.gr) || '') : base, sp = parseSpan(g.ti);
    const rec = { id: 'g_' + slug(g.id), name: nm.replace(/\s+—\s*$/, ''), time: [g.dy, /[٠-٩:]/.test(String(g.ti)) ? g.ti : ''].filter(Boolean).join(' — '), yearId: yid, fee: num(g.price) || feeByG[String(g.id)] || 0, start: sp.start || '', end: sp.end || '' };
    gMap.set(String(g.id), rec); res.groups.push(rec);
  });

  // الطلاب
  const sMap = new Map(), usedCodes = new Set();
  rows('students').forEach(s => {
    let code = String(s.qr || s.id); if (usedCodes.has(code)) code = String(s.id); usedCodes.add(code);
    const g = gMap.get(String(s.gid));
    const rec = { id: 's_' + s.id, name: String(s.nm || '').trim(), code, phone: String(s.ph || ''), parentPhone: String(s.pp || ''), groupId: g ? g.id : '', yearId: yearId(s.gr) || g?.yearId || '', joinDate: dayOf(s.jd), points: num(s.pt), active: true };
    if (rec.name) { sMap.set(String(s.id), rec); res.students.push(rec); }
  });

  // الحضور (سجل واحد لكل طالب في اليوم، والحاضر يغلب)
  const att = new Map(); let orphA = 0;
  rows('attendance').forEach(a => {
    const st = sMap.get(String(a.sid)); if (!st) { orphA++; return; }
    const pt = parts(a.d), date = pt.date, id = date + '_' + st.id, status = a.s === 'absent' ? 'a' : 'p', old = att.get(id);
    if (old && (old.status === 'p' || status === 'a')) return;
    const g = gMap.get(String(a.gid));
    att.set(id, { id, studentId: st.id, date, groupId: g ? g.id : st.groupId, status, time: status === 'p' ? (/^\d{1,2}:\d{2}$/.test(String(a.time || '')) ? String(a.time).padStart(5, '0') : pt.time) : '', late: false, lateMin: 0 });
  });
  res.attendance = [...att.values()];

  // المدفوعات
  let orphP = 0, rn = 0;
  rows('payments').sort((a, b) => String(a.d).localeCompare(String(b.d))).forEach(p => {
    const st = sMap.get(String(p.sid)); if (!st) { orphP++; return; } const amount = num(p.am); if (amount <= 0) return;
    const date = dayOf(p.d) || today(), isFee = p.mo && p.yr;
    res.payments.push({ id: 'p_' + slug(p.id), studentId: st.id, month: isFee ? p.yr + '-' + pad(p.mo) : date.slice(0, 7), amount, date, receiptNo: String(++rn), type: isFee ? 'fee' : 'other', note: isFee ? '' : String(p.cat || 'أخرى') });
  });

  // الامتحانات والدرجات (الامتحان مفيهوش تاريخ، فبيتاخد من توقيت إنشائه)
  const exMap = new Map();
  rows('exams').forEach(e => {
    const g = gMap.get(String(e.gid)), rec = { id: 'x_' + slug(e.id), name: String(e.ti || 'امتحان').trim(), date: Number(e.id) > 1e12 ? dayOf(Number(e.id)) : today(), max: num(e.mx) || 100, groupId: g ? g.id : '', yearId: yearId(e.gr) };
    exMap.set(String(e.id), rec); res.exams.push(rec);
  });
  let orphS = 0; const seenSc = new Set();
  rows('scores').forEach(c => {
    const st = sMap.get(String(c.sid)), ex = exMap.get(String(c.eid)); if (!st || !ex) { orphS++; return; }
    const id = ex.id + '_' + st.id; if (seenSc.has(id)) return; seenSc.add(id); res.scores.push({ id, examId: ex.id, studentId: st.id, score: num(c.mk) });
  });

  // المصروفات
  rows('expenses').forEach(e => { const amount = num(e.am ?? e.amount); if (amount > 0) res.expenses.push({ id: 'e_' + slug(e.id), date: dayOf(e.d) || today(), category: String(e.cat || e.category || 'أخرى'), amount, note: String(e.nt || e.note || '') }); });

  // الإعدادات (اسم السنتر والمدرس فقط. كلمات السر مش بتتنقل)
  const ap = root.settings?.appProfile; if (ap && typeof ap === 'object') res.settings = { center: String(ap.centerName || ap.programName || '').trim() || undefined, teacher: String(ap.teacherName || '').trim() || undefined };
  if (res.settings) Object.keys(res.settings).forEach(k => res.settings[k] === undefined && delete res.settings[k]);

  const skipped = [orphA && orphA + ' سجل حضور', orphP && orphP + ' دفعة', orphS && orphS + ' درجة'].filter(Boolean);
  if (skipped.length) res.notes.push('اتخطّيت سجلات لطلاب اتحذفوا من النظام القديم: ' + skipped.join('، '));
  res.notes.push('الصفوف اتحدّدت كالتالي: prep1-3 = الإعدادي، و1-3 = الثانوي. راجعها.');
  res.notes.push('مواعيد بداية الحصص اتفهمت من خانة الوقت وافترضت إنها بعد الظهر. راجعها من المجموعات قبل ما تعتمد على التأخير.');
  const noPrice = res.groups.filter(g => !g.fee).length; if (noPrice) res.notes.push(noPrice + ' مجموعة من غير سعر اشتراك. هتاخد السعر العام من الإعدادات.');
  res.notes.push('مش بيتنقل: كلمات السر، الموظفين والشفتات، وطابور الواتساب القديم.');
  return res;
}

/* ================= باركود Code128 بدون إنترنت + ملصقات + اختبار القارئ ================= */
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
function code128Widths(text) {
  const t = String(text ?? '').replace(/[^\x20-\x7e]/g, '?'); if (!t) return [];
  const vals = [];
  if (/^\d{4,}$/.test(t)) {
    let i = 0;
    if (t.length % 2) { vals.push(104, t.charCodeAt(0) - 32, 99); i = 1; } else vals.push(105);
    for (; i < t.length; i += 2) vals.push(+t.slice(i, i + 2));
  } else { vals.push(104); for (const ch of t) vals.push(ch.charCodeAt(0) - 32); }
  let sum = vals[0]; for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103, 106);
  return vals.flatMap(v => C128[v].split('').map(Number));
}
function barVal(c) { c = normCode(c); let p = 4; try { const v = JSON.parse(localStorage.getItem('lbl') || '{}').pad; if (v !== undefined && v !== '') p = Math.max(0, Math.min(12, parseInt(v, 10) || 0)); } catch (e) { } return p && /^\d+$/.test(c) && c.length < p ? c.padStart(p, '0') : c; }
function barcodeSvg(text, o = {}) {
  text = barVal(text); const w = code128Widths(text); if (!w.length) return '';
  const Q = 10, total = w.reduce((a, b) => a + b, 0) + 2 * Q, h = o.h || 12;
  let narrow = o.narrow || 0.33; if (o.maxW && total * narrow > o.maxW) narrow = o.maxW / total;
  let x = Q, d = ''; w.forEach((m, i) => { if (i % 2 === 0) d += 'M' + x + ' 0h' + m + 'v1h-' + m + 'z'; x += m; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" width="${(total * narrow).toFixed(2)}mm" height="${h}mm" data-narrow="${narrow.toFixed(3)}" style="display:block"><path d="${d}" fill="#000"/></svg>`;
}

/* ---- مطابقة الكود ---- */
function normCode(v) { return String(v ?? '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '').trim(); }
function ean13ok(c) { if (!/^\d{13}$/.test(c)) return false; let s = 0; for (let i = 0; i < 12; i++) s += (+c[i]) * (i % 2 ? 3 : 1); return (10 - s % 10) % 10 === +c[12]; }
function exactStudent(raw) { const c = normCode(raw); return c ? all('students').find(x => String(x.code) === c || x.id === c) || null : null; }
function findStudentByCode(raw) {
  const c = normCode(raw); if (!c) return null; const list = all('students');
  let s = exactStudent(c); if (s) return s;
  const lc = c.toLowerCase(); s = list.find(x => String(x.code).toLowerCase() === lc); if (s) return s;
  if (/^\d+$/.test(c)) {
    const nz = c.replace(/^0+/, '');
    if (nz) { s = list.find(x => /^\d+$/.test(String(x.code)) && String(x.code).replace(/^0+/, '') === nz); if (s) return s; }
    if (ean13ok(c)) { s = list.find(x => String(x.code) === c.slice(0, 12)); if (s) return s; }
  }
  return null;
}

/* ---- الملصقات ---- */
const LBL_PRESETS = {
  '50x25': { w: 50, h: 25, m: 1.5, name: 10, bar: 9, narrow: 0.3, center: false, year: false, code: true },
  '50x30': { w: 50, h: 30, m: 1.5, name: 10, bar: 10, narrow: 0.3, center: false, year: true, code: true },
  '40x30': { w: 40, h: 30, m: 1.5, name: 9, bar: 9, narrow: 0.25, center: false, year: false, code: true },
  '58x30': { w: 58, h: 30, m: 1.5, name: 11, bar: 9, narrow: 0.32, center: false, year: true, code: true },
  '58x40': { w: 58, h: 40, m: 2, name: 12, bar: 12, narrow: 0.33, center: true, year: true, code: true },
  '80x50': { w: 80, h: 50, m: 3, name: 14, bar: 16, narrow: 0.4, center: true, year: true, code: true }
};
const LBL_DEF = { ...LBL_PRESETS['50x25'], pad: 4 };
const lbl = () => { try { return { ...LBL_DEF, ...JSON.parse(localStorage.getItem('lbl') || '{}') }; } catch (e) { return { ...LBL_DEF }; } };
(function () { const st = document.createElement('style'); st.textContent = '.lbl{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#000;background:#fff;font-family:Tajawal,Arial,sans-serif;overflow:hidden;line-height:1.15;break-after:page;page-break-after:always}.lbl:last-child{break-after:auto;page-break-after:auto}.lblprev{border:1px dashed #999;display:inline-block;background:#fff;box-shadow:var(--sh)}'; document.head.appendChild(st); })();
let _cv; function txtMm(t, pt) { try { _cv = _cv || document.createElement('canvas').getContext('2d'); _cv.font = '800 ' + (pt * 96 / 72) + 'px Tajawal, Arial, sans-serif'; return _cv.measureText(String(t || '')).width * 25.4 / 96; } catch (e) { return String(t || '').length * pt * 0.3528 * 0.64; } }
function labelFit(s, o) {
  const avail = o.w - 2 * o.m, notes = [], mm = p => p * 0.3528;
  let fs = Math.max(7, o.name); const tw = txtMm(s.name, fs); if (tw > avail - 0.5) fs = Math.max(6, fs * (avail - 0.5) / tw * 0.97);
  const subN = Math.max(6, Math.min(9, o.name - 3)); let bar = o.bar, showC = !!o.center, showY = !!(o.year && yearName(s.yearId));
  const H = o.h ? Math.max(8, o.h - 0.5) : 0;
  if (H) {
    const room = H - 2 * o.m, est = () => (showC ? mm(subN) * 1.35 : 0) + (showY ? mm(subN) * 1.35 : 0) + mm(fs) * 1.45 + 2 + bar + (o.code ? mm(subN) * 1.35 + 0.5 : 0);
    if (est() > room && showC) { showC = false; notes.push('اتشال اسم السنتر تلقائيًا'); }
    if (est() > room && showY) { showY = false; notes.push('اتشال الصف تلقائيًا'); }
    if (est() > room && bar > 6) { bar = Math.max(6, bar - (est() - room)); notes.push('اتصغّر الباركود'); }
    if (est() > room && fs > 7) { fs = Math.max(7, fs - (est() - room) / (0.3528 * 1.45)); notes.push('اتصغّر الاسم'); }
  }
  return { H, avail, fs, sub: subN + 'pt', bar, showC, showY, notes };
}
function labelHtml(s, o) {
  const L = labelFit(s, o), svg = barcodeSvg(s.code, { h: L.bar, narrow: o.narrow, maxW: L.avail });
  return `<div class="lbl" style="width:${o.w}mm;${L.H ? 'height:' + L.H + 'mm;max-height:' + L.H + 'mm;' : ''}padding:${o.m}mm">${L.showC ? `<div style="font-size:${L.sub};font-weight:700">${esc(S().center)}</div>` : ''}${L.showY ? `<div style="font-size:${L.sub}">${esc(yearName(s.yearId))}</div>` : ''}<div style="font-size:${L.fs.toFixed(1)}pt;font-weight:800;margin:1mm 0;white-space:nowrap">${esc(s.name)}</div>${svg}${o.code ? `<div style="font-size:${L.sub};letter-spacing:1px;margin-top:.5mm">${esc(barVal(s.code))}</div>` : ''}</div>`;
}
function printLabels(list) {
  const o = lbl(); if (!list.length) return toast('لا يوجد طلاب للطباعة', true);
  const html = list.map(s => labelHtml(s, o)).join('');
  if (o.h) { $('#print').innerHTML = html; $('#pstyle').textContent = `@page{size:${o.w}mm ${o.h}mm;margin:0}`; setTimeout(() => window.print(), 200); }
  else printThermal(html, o.w);
}
V.cards = () => { const o = lbl(); const n = (id, label, v, step) => `<div class="f"><label>${label}</label><input id="${id}" type="number" step="${step || 1}" value="${v}" inputmode="decimal"></div>`; const ck = (id, v, t) => `<label style="display:inline-flex;gap:6px;align-items:center;margin:0 0 6px 14px"><input type="checkbox" id="${id}" ${v ? 'checked' : ''} style="width:auto">${t}</label>`;
  return `<div class="card"><h3>🏷 ملصقات الطلاب (طابعة كاشير / ملصقات)</h3>
  <div class="f"><label>مقاس جاهز</label><select id="lpre"><option value="">مخصص</option><option value="50x25">5 × 2.5 سم (50 × 25 مم)</option><option value="50x30">50 × 30 مم</option><option value="40x30">40 × 30 مم</option><option value="58x30">58 × 30 مم</option><option value="58x40">58 × 40 مم</option><option value="80x50">80 × 50 مم</option></select></div>
  <div class="grid2">${n('lw', 'عرض الملصق (مم)', o.w)}${n('lh', 'ارتفاع الملصق (مم)', o.h)}${n('lm', 'الهامش (مم)', o.m, 0.5)}${n('lname', 'حجم اسم الطالب (pt)', o.name)}${n('lbar', 'ارتفاع الباركود (مم)', o.bar, 0.5)}${n('lnar', 'سُمك خط الباركود (مم)', o.narrow, 0.01)}${n('lpad', 'طول الباركود الثابت (أرقام، 0 = بدون)', o.pad ?? 4)}</div>
  <div>${ck('lc', o.center, 'اسم السنتر')}${ck('ly', o.year, 'الصف')}${ck('lcode', o.code, 'رقم الكود تحت الباركود')}</div>
  <div style="margin:10px 0;text-align:center"><div id="lprev" class="lblprev"></div><div id="lwarn" style="color:var(--er);font-size:13px;margin-top:6px"></div></div>
  <div class="bar"><select id="lg">${groupOpts('', 'كل الطلاب')}</select><button class="btn" data-act="lblGroup">🖨 طباعة ملصقات المجموعة</button></div>
  <div class="bar"><select id="ls">${optList(activeStudents().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(s => ({ v: s.id, t: s.name + ' — ' + s.code })), '', 'اختر طالب')}</select><button class="btn ghost" data-act="lblOne">🖨 ملصق طالب واحد</button><button class="btn ghost" data-act="lblTest">ملصق تجربة</button></div>
  <small style="color:var(--mu)">في شاشة الطباعة اختار: الهوامش <b>None / بلا</b>، المقياس <b>100%</b>، وألغِ الرؤوس والتذييلات، ومقاس الورق نفس مقاس الملصق.</small></div>
  <div class="card"><h3>🔎 اختبار قارئ الباركود</h3><p style="color:var(--mu);font-size:13px;margin-bottom:8px">اضغط في الخانة وامسح أي كارت. هيظهر بالظبط اللي القارئ بعته.</p><div class="scan"><input id="stest" placeholder="امسح هنا" autocomplete="off"></div><div id="sres" style="margin-top:8px"></div></div>
  <div class="card"><h3>طباعة كروت A4 (10 في الصفحة)</h3><div class="f"><label>المجموعة</label><select id="cg">${groupOpts('', 'كل الطلاب')}</select></div><button class="btn" data-act="printCards">🖨 طباعة</button></div><div id="cprev" class="cards"></div>`; };
M.cards = () => {
  const ids = { lw: 'w', lh: 'h', lm: 'm', lname: 'name', lbar: 'bar', lnar: 'narrow', lpad: 'pad' };
  const read = () => { const o = {}; Object.entries(ids).forEach(([i, k]) => { o[k] = num($('#' + i).value); }); o.center = $('#lc').checked; o.year = $('#ly').checked; o.code = $('#lcode').checked; return o; };
  const draw = () => {
    const o = { ...LBL_DEF, ...read() }; if (!(o.w > 10)) o.w = 58; if (!(o.narrow > 0)) o.narrow = 0.33; try { localStorage.setItem('lbl', JSON.stringify(o)); } catch (e) { }
    const s = activeStudents()[0] || { name: 'اسم الطالب', code: '1001', yearId: '' };
    $('#lprev').innerHTML = labelHtml(s, o); const sv = $('#lprev svg'), nw = sv ? +sv.dataset.narrow : 1;
    const L = $('#lprev .lbl'), over = L && o.h && contentOverflow(L); $('#lwarn').textContent = nw < 0.2 ? '⚠️ الباركود ضيق قوي وممكن القارئ مايقراهوش. كبّر عرض الملصق أو قلّل الهامش أو استخدم كود أقصر.' : over ? '⚠️ المحتوى أطول من الملصق. صغّر الاسم أو ارتفاع الباركود أو شيل اسم السنتر/الصف.' : (() => { const n = labelFit(s, o).notes; return n.length ? 'ℹ️ ' + n.join('، ') + ' علشان يناسب الملصق' : ''; })();
  };
  Object.keys(ids).concat(['lc', 'ly', 'lcode']).forEach(i => $('#' + i).oninput = draw);
  $('#lpre').onchange = e => { const P = LBL_PRESETS[e.target.value]; if (!P) return; Object.entries(ids).forEach(([i, k]) => { $('#' + i).value = P[k] ?? $('#' + i).value; }); $('#lc').checked = P.center; $('#ly').checked = P.year; $('#lcode').checked = P.code; draw(); };
  draw();
  const d = () => { const l = activeStudents().filter(s => !$('#cg').value || s.groupId === $('#cg').value).slice(0, 6); $('#cprev').innerHTML = l.map(cardHtml).join(''); renderCodes($('#cprev')); }; $('#cg').onchange = d; d();
  const t = $('#stest'); let tm; const show = () => { const raw = t.value; if (!raw) return; const n = normCode(raw), s = findStudentByCode(n), codes = [...raw].map(c => c.charCodeAt(0).toString(16)).join(' ');
    $('#sres').innerHTML = `<div class="big ${s ? 'ok' : 'er'}">${s ? '✔ ' + esc(s.name) : 'مش متعرّف على طالب'}</div><small>اللي وصل: <b dir="ltr">${esc(raw)}</b> (${raw.length} حرف) · بعد التنظيف: <b dir="ltr">${esc(n)}</b>${/[؀-ۿ]/.test(raw) ? '<br>⚠️ فيه حروف عربي: غيّر لغة الكيبورد لإنجليزي وجرّب تاني' : ''}${!s && n ? '<br>لو الرقم مختلف عن المطبوع على الكارت، يبقى القارئ مظبوط على نوع باركود تاني أو بيضيف حروف.' : ''}</small>`; t.value = ''; };
  t.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); show(); } }; t.oninput = () => { clearTimeout(tm); tm = setTimeout(show, 400); };
};
A.lblGroup = () => { const g = $('#lg').value; printLabels(activeStudents().filter(s => !g || s.groupId === g).sort((a, b) => a.name.localeCompare(b.name, 'ar'))); };
A.lblOne = () => { const s = get('students', $('#ls').value); if (!s) return toast('اختر طالب', true); printLabels([s]); };
A.lblTest = () => printLabels([activeStudents()[0] || { name: 'اسم الطالب للتجربة', code: '1234567890', yearId: '' }]);

/* ---- تثبيت القارئ على شاشة الحضور ---- */
const _mAtt = M.attendance;
M.attendance = () => {
  _mAtt(); const sc = $('#scan'); if (!sc) return;
  const st = document.createElement('div'); st.id = 'scanState'; st.style.cssText = 'text-align:center;font-size:12px;margin:4px 0 6px'; sc.after(st);
  const upd = () => { const on = document.activeElement === sc; st.textContent = on ? '🟢 جاهز لقراءة الباركود' : '🔴 اضغط هنا علشان القارئ يشتغل'; st.style.color = on ? 'var(--ok)' : 'var(--er)'; };
  sc.addEventListener('focus', upd); sc.addEventListener('blur', () => setTimeout(upd, 0)); upd();
  let t, ts = []; sc.addEventListener('input', () => { clearTimeout(t); const now = Date.now(); if (!sc.value) { ts = []; return; } ts.push(now); const v = normCode(sc.value), burst = ts.length >= 2 && (now - ts[0]) / (ts.length - 1) < 60; if (v.length >= 3 || (v.length >= 2 && burst)) t = setTimeout(() => { ts = []; if (sc.value && (exactStudent(sc.value) || (burst && findStudentByCode(sc.value)))) { handleScan(sc.value); sc.value = ''; } }, 200); });
  sc.addEventListener('keydown', e => { if (e.key === 'Tab' && sc.value) { e.preventDefault(); handleScan(sc.value); sc.value = ''; } });
};
document.addEventListener('keydown', e => {
  if (ui.route().name !== 'attendance' || $('#modal .ov')) return; const sc = $('#scan'), a = document.activeElement; if (!sc || a === sc) return;
  const tag = a?.tagName || '', textual = tag === 'TEXTAREA' || (tag === 'INPUT' && /^(text|search|tel|number|password|email|url)$/.test(a.type));
  if (!textual && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) sc.focus();
}, true);
document.addEventListener('click', e => { if (ui.route().name === 'attendance' && !$('#modal .ov') && !e.target.closest('input,select,textarea,button,a,label')) $('#scan')?.focus(); });

/* ---- طباعة حرارية بطول الورقة حسب المحتوى (إيصال 80 مم) ---- */
function measureMm(html, w) { const p = $('#print'); p.innerHTML = html; p.style.cssText = `display:block;position:absolute;left:-9999px;top:0;width:${w}mm`; const h = p.scrollHeight * 25.4 / 96; p.style.cssText = ''; return h; }
function printThermal(html, w) { const h = Math.ceil(measureMm(html, w)) + 4; $('#pstyle').textContent = `@page{size:${w}mm ${h}mm;margin:0}`; setTimeout(() => window.print(), 250); }

function contentOverflow(L) { const k = [...L.children]; if (!k.length) return false; const top = Math.min(...k.map(c => c.getBoundingClientRect().top)), bot = Math.max(...k.map(c => c.getBoundingClientRect().bottom)), r = L.getBoundingClientRect(), pad = parseFloat(getComputedStyle(L).paddingTop) || 0; return bot - top > r.height - 2 * pad + 0.5; }

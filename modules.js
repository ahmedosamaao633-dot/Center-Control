'use strict';
/* =====================================================================
   وحدات: الخزنة اليومية · الإيراد اليومي · أكواد الطلاب · المنصة التعليمية
   ===================================================================== */
Object.assign(DEF, { platOn: false, platUrl: '', platKey: '' });

/* ---------------- أدوات مشتركة ---------------- */
const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long' }) + ' ' + d;
const stuName = id => get('students', id)?.name || '—';
const stuGroup = id => groupName(get('students', id)?.groupId) || 'بدون مجموعة';
const payItem = p => p.type === 'other' ? (p.note || 'أخرى') : 'اشتراك ' + monthName(p.month);
const sumBy = (l, f) => l.reduce((a, x) => a + num(f(x)), 0);
const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const csvText = v => /^\d{8,}$/.test(String(v)) ? '="' + v + '"' : v;
const toCsv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('اتنسخ ✅'); } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('اتنسخ ✅'); } catch (er) { toast('تعذر النسخ', true); } ta.remove();
  }
}
async function savePdf(html, name) {
  try { toast('جاري تجهيز الـ PDF...'); const blob = await makePdf(html), how = await saveReport(blob, name, true); toast(how === 'folder' ? '✅ اتحفظ في المجلد المحدد' : 'اتنزّل ✅'); }
  catch (e) { toast('تعذر إنشاء PDF. محتاج نت أول مرة لتحميل المكتبة', true); }
}
function byGroup(list) {
  const m = new Map(); list.forEach(s => { const k = s.groupId || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(s); });
  return [...m.entries()].sort((a, b) => (groupName(a[0]) || 'ي').localeCompare(groupName(b[0]) || 'ي', 'ar'));
}
const tabBar = (tabs, cur, act) => `<div class="bar">${tabs.map(([k, t]) => `<button class="btn ${cur === k ? '' : 'ghost'}" data-act="${act}" data-k="${k}">${t}</button>`).join('')}</div>`;

/* =====================================================================
   1) الخزنة اليومية
   ===================================================================== */
const TR = { tab: 'open', date: today(), month: curMonth() };
function closedSet() { const s = new Set(); all('closings').forEach(c => { (c.paymentIds || []).forEach(i => s.add('p' + i)); (c.expenseIds || []).forEach(i => s.add('e' + i)); }); return s; }
function dayItems(date, onlyOpen) {
  const cs = onlyOpen ? closedSet() : new Set();
  const pays = all('payments').filter(p => p.date === date && !cs.has('p' + p.id)).sort((a, b) => (a.time || '').localeCompare(b.time || '') || num(a.receiptNo) - num(b.receiptNo));
  const exps = all('expenses').filter(e => e.date === date && !cs.has('e' + e.id));
  const collected = sumBy(pays, p => p.amount), spent = sumBy(exps, e => e.amount);
  return { date, pays, exps, collected, spent, net: collected - spent };
}
function closingItems(cl) {
  const pays = (cl.paymentIds || []).map(i => get('payments', i)).filter(Boolean), exps = (cl.expenseIds || []).map(i => get('expenses', i)).filter(Boolean);
  const collected = sumBy(pays, p => p.amount), spent = sumBy(exps, e => e.amount);
  return { date: cl.date, pays, exps, collected, spent, net: collected - spent };
}
function breakdown(it) {
  const g = {}, t = { fee: 0, other: 0 };
  it.pays.forEach(p => { const k = stuGroup(p.studentId); g[k] = g[k] || { n: 0, v: 0 }; g[k].n++; g[k].v += num(p.amount); t[p.type === 'other' ? 'other' : 'fee'] += num(p.amount); });
  return { g, t };
}
function moneyReport(it, o = {}) {
  const c = S(), cl = o.closing, rev = o.kind === 'revenue', bd = breakdown(it), title = rev ? 'تقرير الإيراد اليومي' : 'كشف الخزنة اليومية';
  const diffTxt = cl ? (cl.diff === 0 ? 'مطابق' : (cl.diff < 0 ? 'عجز ' : 'زيادة ') + money(Math.abs(cl.diff))) : '';
  if (o.thermal) {
    const L = (a, b, bold) => `<div style="display:flex;justify-content:space-between;gap:6px;${bold ? 'font-weight:800;font-size:14px' : ''}"><span>${a}</span><span>${b}</span></div>`, hr = '<hr style="border:0;border-top:1px dashed #000;margin:5px 0">';
    let h = `<div dir="rtl" style="width:72mm;margin:auto;font-family:Tajawal,Arial,sans-serif;color:#000;font-size:12px;line-height:1.35"><div style="text-align:center"><b style="font-size:15px">${esc(c.center)}</b><div>${title}</div><div>${esc(dayLabel(it.date))}</div>${cl ? `<div>إغلاق رقم ${cl.no} — ${esc(cl.time || '')}</div>` : ''}</div>${hr}`;
    if (!it.pays.length) h += '<div style="text-align:center">لا يوجد تحصيل</div>';
    it.pays.forEach(p => { h += L(esc(stuName(p.studentId)), money(p.amount)) + `<div style="font-size:10px;color:#333;margin-bottom:2px">${esc(p.time || '')} · ${esc(payItem(p))}</div>`; });
    h += hr + L('عدد الوصولات', it.pays.length) + L('التحصيل', money(it.collected));
    if (rev) { h += L('اشتراكات', money(bd.t.fee)) + L('أخرى', money(bd.t.other)); Object.entries(bd.g).forEach(([k, x]) => { h += L(esc(k) + ' (' + x.n + ')', money(x.v)); }); }
    if (it.exps.length) { h += hr; it.exps.forEach(e => { h += L(esc(e.category) + (e.note ? ' - ' + esc(e.note) : ''), '-' + money(e.amount)); }); }
    h += hr + L('المصروفات', money(it.spent)) + L('الصافي', money(it.net), true);
    if (cl) h += hr + L('الفعلي في الدرج', money(cl.counted)) + L('الفرق', diffTxt, true) + (cl.by ? L('المسؤول', esc(cl.by)) : '');
    return h + `${hr}<div style="text-align:center;font-size:10px">توقيع: ..................</div></div>`;
  }
  const th = 'style="background:#eef2ff;padding:6px;border:1px solid #ccc;text-align:right"', td = 'style="padding:5px 6px;border:1px solid #ddd;text-align:right"';
  const tbl = (heads, rows) => rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px"><tr>${heads.map(h => `<th ${th}>${h}</th>`).join('')}</tr>${rows.map(r => `<tr style="break-inside:avoid">${r.map(x => `<td ${td}>${x}</td>`).join('')}</tr>`).join('')}</table>` : '<div style="color:#888;font-size:13px;margin-bottom:8px">لا يوجد</div>';
  const h2 = t => `<h2 style="font-size:16px;margin:14px 0 6px;color:#4f46e5;border-bottom:2px solid #4f46e5;padding-bottom:3px">${t}</h2>`;
  const box = (l, v, col) => `<td style="border:1px solid #ddd;padding:8px;text-align:center"><div style="font-size:12px;color:#666">${l}</div><div style="font-size:18px;font-weight:800;color:${col || '#111'}">${v}</div></td>`;
  let h = `<div dir="rtl" style="${o.fixed ? 'width:794px;padding:28px;box-sizing:border-box;' : 'width:100%;'}font-family:Tajawal,Arial,sans-serif;color:#111;background:#fff"><div style="text-align:center;border-bottom:3px solid #4f46e5;padding-bottom:8px"><div style="font-size:22px;font-weight:800">${esc(c.center)}</div><div style="font-size:13px;color:#555">${esc(c.teacher)}</div><div style="font-size:16px;margin-top:4px">${title} — ${esc(dayLabel(it.date))}${cl ? ' — إغلاق رقم ' + cl.no + ' (' + esc(cl.time || '') + ')' : ''}</div></div>`;
  h += `<table style="width:100%;border-collapse:collapse;margin-top:10px"><tr>${box('الوصولات', it.pays.length)}${box('التحصيل', money(it.collected), '#059669')}${box('المصروفات', money(it.spent), '#dc2626')}${box('الصافي', money(it.net), it.net < 0 ? '#dc2626' : '#059669')}</tr></table>`;
  if (cl) h += `<table style="width:100%;border-collapse:collapse;margin-top:6px"><tr>${box('المتوقع في الدرج', money(cl.expected))}${box('الفعلي', money(cl.counted))}${box('الفرق', diffTxt, cl.diff === 0 ? '#059669' : '#dc2626')}</tr></table>${cl.by || cl.note ? `<div style="font-size:13px;margin-top:4px">${cl.by ? 'المسؤول: <b>' + esc(cl.by) + '</b> ' : ''}${cl.note ? '· ملاحظة: ' + esc(cl.note) : ''}</div>` : ''}`;
  if (rev) {
    const mo = it.date.slice(0, 7), mtd = sumBy(all('payments').filter(p => p.date.slice(0, 7) === mo && p.date <= it.date), p => p.amount);
    const unpaid = activeStudents().map(s => payState(s, mo)).filter(x => x.k === 'er' || x.k === 'wa'), due = unpaid.reduce((a, x) => a + Math.max(0, x.fee - x.paid), 0);
    h += h2('الملخص') + tbl(['البند', 'القيمة'], [['اشتراكات', money(bd.t.fee)], ['دفعات أخرى (ملازم/رسوم)', money(bd.t.other)], ['إجمالي إيراد الشهر حتى هذا اليوم', money(mtd)], ['طلاب لم يسددوا اشتراك الشهر', unpaid.length + ' طالب'], ['المتبقي من اشتراكات الشهر', money(due)]]);
    h += h2('الإيراد حسب المجموعة') + tbl(['المجموعة', 'عدد الوصولات', 'المبلغ'], Object.entries(bd.g).map(([k, x]) => [esc(k), x.n, money(x.v)]));
  }
  h += h2('تفاصيل التحصيل') + tbl(['#', 'وصل', 'الوقت', 'الطالب', 'المجموعة', 'البند', 'المبلغ'], it.pays.map((p, i) => [i + 1, esc(p.receiptNo || ''), esc(p.time || ''), esc(stuName(p.studentId)), esc(stuGroup(p.studentId)), esc(payItem(p)), money(p.amount)]));
  h += h2('المصروفات') + tbl(['الفئة', 'ملاحظة', 'المبلغ'], it.exps.map(e => [esc(e.category), esc(e.note || ''), money(e.amount)]));
  h += `<div style="font-size:15px;font-weight:700;margin-top:8px">الصافي: ${money(it.collected)} − ${money(it.spent)} = <span style="color:${it.net < 0 ? '#dc2626' : '#059669'}">${money(it.net)}</span></div>`;
  h += `<table style="width:100%;margin-top:34px;font-size:13px"><tr><td style="text-align:center">توقيع المسؤول: ................</td><td style="text-align:center">توقيع المدرس: ................</td></tr></table><div style="margin-top:10px;font-size:11px;color:#888;text-align:center">صدر بتاريخ ${new Date().toLocaleString('ar-EG')}</div></div>`;
  return h;
}
function printMoney(it, o, mode) { if (mode === '80') printThermal(moneyReport(it, { ...o, thermal: true }), 80); else printHtml(moneyReport(it, o), 'A4'); }

V.treasury = () => tabBar([['open', 'العهدة الحالية'], ['arch', 'الأرشيف'], ['rev', 'الإيراد اليومي']], TR.tab, 'trTab') + '<div id="trbody"></div>';
M.treasury = () => drawTreasury();
function drawTreasury() { ({ open: drawOpen, arch: drawArch, rev: drawRev })[TR.tab](); }
A.trTab = a => { TR.tab = a.k; ui.render(); };

function drawOpen() {
  const it = dayItems(TR.date, true), bd = breakdown(it), done = all('closings').filter(c => c.date === TR.date);
  $('#trbody').innerHTML = `<div class="bar"><input type="date" id="trd" value="${TR.date}" style="max-width:170px"><button class="btn ok" data-act="closeTr">🔒 إغلاق العهدة وتصفيرها</button><button class="btn ghost" data-act="trPrint" data-m="a4">🖨 A4</button><button class="btn ghost" data-act="trPrint" data-m="80">🖨 80مم</button></div>
  <div class="stats"><div class="stat"><small>وصولات العهدة</small><b>${it.pays.length}</b></div><div class="stat"><small>التحصيل</small><b>${money(it.collected)}</b></div><div class="stat"><small>المصروفات</small><b>${money(it.spent)}</b></div><div class="stat"><small>المتوقع في الدرج</small><b>${money(it.net)}</b></div></div>
  ${done.length ? `<div class="card"><small>اتقفل النهارده ${done.length} مرة: ${done.map(c => '#' + c.no + ' (' + money(c.counted) + ')').join(' · ')}</small></div>` : ''}
  ${Object.keys(bd.g).length ? `<div class="card"><h3>حسب المجموعة</h3>${Object.entries(bd.g).map(([k, x]) => `<div class="row"><div class="g">${esc(k)}<small> · ${x.n} وصل</small></div><b>${money(x.v)}</b></div>`).join('')}</div>` : ''}
  <div class="card"><h3>التحصيل</h3>${it.pays.map(p => `<div class="row"><div class="g"><b>${esc(stuName(p.studentId))} — ${money(p.amount)}</b><small>${esc(p.time || '')} · وصل ${esc(p.receiptNo || '-')} · ${esc(stuGroup(p.studentId))} · ${esc(payItem(p))}</small></div><div class="acts"><button class="ib" data-act="trRcpt" data-id="${p.id}">🖨</button><button class="ib off" data-act="voidPay" data-id="${p.id}" title="إلغاء الوصل">✖</button></div></div>`).join('') || '<div class="empty">مفيش تحصيل مفتوح في اليوم ده</div>'}</div>
  ${it.exps.length ? `<div class="card"><h3>المصروفات</h3>${it.exps.map(e => `<div class="row"><div class="g"><b>${esc(e.category)} — ${money(e.amount)}</b><small>${esc(e.note || '')}</small></div></div>`).join('')}</div>` : ''}`;
  $('#trd').onchange = e => { TR.date = e.target.value || today(); drawOpen(); };
}
A.trPrint = a => printMoney(dayItems(TR.date, true), { kind: 'treasury' }, a.m);
A.trRcpt = a => { const p = get('payments', a.id); if (p) showReceipt(p); };
A.voidPay = a => {
  const p = get('payments', a.id); if (!p) return; if (closedSet().has('p' + p.id)) return toast('الوصل ده في عهدة مقفولة', true);
  confirmBox(`إلغاء الوصل رقم ${esc(p.receiptNo || '')} (${money(p.amount)}) للطالب ${esc(stuName(p.studentId))}؟<br><small>هيتشال من الخزنة والإيراد، والطالب يرجع غير مدفوع.</small>`, () => { remove('payments', p.id); toast('اتلغى الوصل'); drawTreasury(); }, 'إلغاء الوصل');
};
A.closeTr = () => {
  const it = dayItems(TR.date, true); if (!it.pays.length && !it.exps.length) return toast('مفيش حاجة مفتوحة تتقفل', true);
  modal('🔒 إغلاق العهدة', `<div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><small>تحصيل</small><b>${money(it.collected)}</b></div><div class="stat"><small>مصروفات</small><b>${money(it.spent)}</b></div></div><p>المتوقع في الدرج: <b>${money(it.net)}</b></p>` + fld('المبلغ الفعلي في الدرج', 'counted', it.net, 'number', 'inputmode="decimal"') + '<div id="cdiff" class="big ok" style="font-size:15px"></div>' + fld('اسم المسؤول', 'by', localStorage.getItem('trBy') || '') + fld('ملاحظة', 'note', ''), [
    { t: 'إلغاء', cls: 'ghost', fn: closeModal },
    { t: 'إغلاق وتصفير', cls: 'ok', fn: d => {
      const f = dayItems(TR.date, true); if (!f.pays.length && !f.exps.length) return closeModal();
      const counted = d.counted === '' ? f.net : num(d.counted), no = all('closings').filter(c => c.date === TR.date).length + 1;
      try { localStorage.setItem('trBy', d.by || ''); } catch (e) { }
      const cl = save('closings', { id: 'cl_' + uid(), date: TR.date, at: Date.now(), time: nowTime(), no, expected: f.net, counted, diff: counted - f.net, collected: f.collected, spent: f.spent, count: f.pays.length, paymentIds: f.pays.map(p => p.id), expenseIds: f.exps.map(e => e.id), by: d.by || '', note: d.note || '' });
      closeModal(); toast('✅ اتقفلت العهدة'); showClosed(cl); drawTreasury();
    } }]);
  const upd = () => { const diff = num($('#counted').value) - it.net, el = $('#cdiff'); el.className = 'big ' + (diff === 0 ? 'ok' : diff < 0 ? 'er' : 'wa'); el.textContent = diff === 0 ? '✔ مطابق' : (diff < 0 ? 'عجز ' : 'زيادة ') + money(Math.abs(diff)); };
  $('#counted').oninput = upd; upd();
};
function showClosed(cl) {
  const it = closingItems(cl), o = { kind: 'treasury', closing: cl };
  modal('تم إغلاق العهدة #' + cl.no, moneyReport(it, o), [{ t: '🖨 A4', cls: 'ghost', fn: () => printMoney(it, o, 'a4') }, { t: '🖨 80مم', cls: 'ghost', fn: () => printMoney(it, o, '80') }, { t: '📄 PDF', cls: 'ghost', fn: () => savePdf(moneyReport(it, { ...o, fixed: true }), 'خزنة-' + cl.date + '-' + cl.no + '.pdf') }, { t: 'تم', fn: closeModal }]);
}
A.viewCl = a => { const cl = get('closings', a.id); if (cl) showClosed(cl); };
function drawArch() {
  const l = all('closings').sort((a, b) => b.at - a.at).slice(0, 100);
  $('#trbody').innerHTML = `<div class="card">${l.map(c => `<div class="row"><div class="g"><b>${esc(c.date)} — إغلاق #${c.no} (${esc(c.time || '')})</b><small>متوقع ${money(c.expected)} · فعلي ${money(c.counted)} · ${c.count} وصل${c.by ? ' · ' + esc(c.by) : ''}</small></div><span class="pill ${c.diff === 0 ? 'ok' : c.diff < 0 ? 'er' : 'wa'}">${c.diff === 0 ? 'مطابق' : (c.diff < 0 ? 'عجز ' : 'زيادة ') + money(Math.abs(c.diff))}</span><button class="ib" data-act="viewCl" data-id="${c.id}">👁</button></div>`).join('') || '<div class="empty">لا يوجد إغلاقات لسه</div>'}</div>`;
}

/* ---------------- الإيراد اليومي ---------------- */
function revModal(date) {
  const it = dayItems(date, false), o = { kind: 'revenue' };
  modal('الإيراد — ' + date, moneyReport(it, o), [{ t: '🖨 A4', cls: 'ghost', fn: () => printMoney(it, o, 'a4') }, { t: '🖨 80مم', cls: 'ghost', fn: () => printMoney(it, o, '80') }, { t: '📄 حفظ PDF', fn: () => savePdf(moneyReport(it, { ...o, fixed: true }), 'إيراد-' + date + '.pdf') }, { t: 'إغلاق', cls: 'ghost', fn: closeModal }]);
}
A.revDay = a => revModal(a.d);
A.revToday = () => revModal(today());
function drawRev() {
  const m = TR.month, days = {}, D = d => (days[d] = days[d] || { n: 0, fee: 0, other: 0, exp: 0 });
  all('payments').filter(p => p.date?.slice(0, 7) === m).forEach(p => { const x = D(p.date); x.n++; x[p.type === 'other' ? 'other' : 'fee'] += num(p.amount); });
  all('expenses').filter(e => e.date?.slice(0, 7) === m).forEach(e => { D(e.date).exp += num(e.amount); });
  const rows = Object.entries(days).sort((a, b) => b[0].localeCompare(a[0])), t = rows.reduce((a, [, x]) => ({ n: a.n + x.n, fee: a.fee + x.fee, other: a.other + x.other, exp: a.exp + x.exp }), { n: 0, fee: 0, other: 0, exp: 0 });
  $('#trbody').innerHTML = `<div class="bar"><input type="month" id="trm" value="${m}" style="max-width:170px"><button class="btn" data-act="revToday">📄 تقرير إيراد النهارده</button></div>
  <div class="stats"><div class="stat"><small>إيراد الشهر</small><b>${money(t.fee + t.other)}</b></div><div class="stat"><small>مصروفات</small><b>${money(t.exp)}</b></div><div class="stat"><small>الصافي</small><b>${money(t.fee + t.other - t.exp)}</b></div><div class="stat"><small>متوسط اليوم</small><b>${money(rows.length ? (t.fee + t.other) / rows.length : 0)}</b></div></div>
  <div class="card" style="overflow-x:auto"><table><tr><th>اليوم</th><th>وصولات</th><th>اشتراكات</th><th>أخرى</th><th>مصروفات</th><th>الصافي</th><th></th></tr>${rows.map(([d, x]) => `<tr><td>${esc(d)}</td><td>${x.n}</td><td>${money(x.fee)}</td><td>${money(x.other)}</td><td>${money(x.exp)}</td><td><b>${money(x.fee + x.other - x.exp)}</b></td><td><button class="ib" data-act="revDay" data-d="${d}">📄</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">لا يوجد حركة في الشهر ده</td></tr>'}</table></div>`;
  $('#trm').onchange = e => { TR.month = e.target.value || curMonth(); drawRev(); };
}

/* =====================================================================
   2) أكواد الطلاب (مجموعة كاملة على بعضها)
   ===================================================================== */
const CD = { g: '', y: '', q: '' };
const cdList = () => activeStudents().filter(s => (!CD.g || s.groupId === CD.g) && (!CD.y || s.yearId === CD.y) && (!CD.q || [s.name, s.code, s.parentPhone, s.phone].some(x => String(x || '').toLowerCase().includes(CD.q.toLowerCase())))).sort((a, b) => (groupName(a.groupId) || 'ي').localeCompare(groupName(b.groupId) || 'ي', 'ar') || a.name.localeCompare(b.name, 'ar'));
V.codes = () => `<div class="bar"><select id="cdg">${groupOpts(CD.g, 'كل المجموعات')}</select><select id="cdy">${yearOpts(CD.y, 'كل الصفوف')}</select><input id="cdq" placeholder="🔍 بحث بالاسم أو الكود" value="${esc(CD.q)}"></div>
<div class="bar"><button class="btn" data-act="cdLabels">🏷 ملصقات المعروض</button><button class="btn ghost" data-act="cdCards">🪪 كروت A4</button><button class="btn ghost" data-act="cdPrint">🖨 قائمة الأكواد</button><button class="btn ghost" data-act="cdCopyAll">📋 نسخ</button><button class="btn ghost" data-act="cdCsv">⬇️ CSV</button><button class="btn ghost" data-act="cdGen">🔄 توليد أكواد ناقصة</button></div><div class="stats" id="cdst"></div><div id="cdlist"></div>`;
M.codes = () => {
  $('#cdg').onchange = e => { CD.g = e.target.value; drawCodes(); }; $('#cdy').onchange = e => { CD.y = e.target.value; drawCodes(); }; $('#cdq').oninput = e => { CD.q = e.target.value; drawCodes(); }; drawCodes();
};
function drawCodes() {
  const list = cdList(), cnt = {}; all('students').forEach(s => { cnt[s.code] = (cnt[s.code] || 0) + 1; });
  const noCode = list.filter(s => !s.code).length, dup = list.filter(s => s.code && cnt[s.code] > 1).length;
  $('#cdst').innerHTML = `<div class="stat"><small>المعروض</small><b>${list.length}</b></div><div class="stat"><small>بدون كود</small><b>${noCode}</b></div><div class="stat"><small>أكواد مكررة</small><b>${dup}</b></div>`;
  $('#cdlist').innerHTML = byGroup(list).map(([gid, l]) => `<div class="card"><div class="row" style="border:0"><div class="g"><b>${esc(groupName(gid) || 'بدون مجموعة')}</b><small>${l.length} طالب</small></div><button class="btn sm ghost" data-act="cdGroupLbl" data-g="${gid}">🏷 ملصقات</button><button class="btn sm ghost" data-act="cdGroupCopy" data-g="${gid}">📋 نسخ</button></div>${l.map(s => `<div class="row"><div class="g"><b>${esc(s.name)}</b><small>${esc(s.parentPhone || s.phone || '')}</small></div><span class="pill ${!s.code || cnt[s.code] > 1 ? 'er' : ''}" style="font-size:15px;letter-spacing:1px" dir="ltr">${esc(s.code || '—')}</span><div class="acts"><button class="ib" data-act="cdCopy" data-id="${s.id}" title="نسخ الكود">📋</button><button class="ib" data-act="cdLbl" data-id="${s.id}" title="ملصق">🏷</button><button class="ib" data-act="editStudent" data-id="${s.id}">✏️</button></div></div>`).join('')}</div>`).join('') || '<div class="empty">لا يوجد طلاب</div>';
}
const inGroup = g => cdList().filter(s => (s.groupId || '') === g);
A.cdLabels = () => printLabels(cdList());
A.cdGroupLbl = a => printLabels(inGroup(a.g));
A.cdLbl = a => { const s = get('students', a.id); if (s) printLabels([s]); };
A.cdCopy = a => copyText(get('students', a.id)?.code || '');
A.cdCopyAll = () => copyText(cdList().map(s => s.name + '\t' + s.code).join('\n'));
A.cdGroupCopy = a => copyText(inGroup(a.g).map(s => s.name + '\t' + s.code).join('\n'));
A.cdCards = () => { const l = cdList(); if (!l.length) return toast('لا يوجد طلاب', true); printHtml(`<div class="cards">${l.map(cardHtml).join('')}</div>`); };
A.cdCsv = () => { const l = cdList(); if (!l.length) return toast('لا يوجد طلاب', true); download('student-codes-' + today() + '.csv', toCsv([['الاسم', 'الكود', 'المجموعة', 'الصف', 'هاتف ولي الأمر', 'هاتف الطالب'], ...l.map(s => [s.name, csvText(s.code), groupName(s.groupId), yearName(s.yearId), csvText(s.parentPhone || ''), csvText(s.phone || '')])]), 'text/csv;charset=utf-8'); toast('اتنزّل الملف ✅'); };
A.cdPrint = () => {
  const l = cdList(); if (!l.length) return toast('لا يوجد طلاب', true);
  const td = 'style="padding:4px 6px;border:1px solid #bbb;text-align:right"';
  printHtml(`<div dir="rtl" style="font-family:Tajawal,Arial,sans-serif;color:#000"><h2 style="text-align:center">${esc(S().center)} — أكواد الطلاب</h2>${byGroup(l).map(([gid, g]) => `<h3 style="margin:12px 0 4px">${esc(groupName(gid) || 'بدون مجموعة')} (${g.length})</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="background:#eee"><th ${td}>#</th><th ${td}>الطالب</th><th ${td}>الكود</th><th ${td}>باركود</th></tr>${g.map((s, i) => `<tr style="break-inside:avoid"><td ${td}>${i + 1}</td><td ${td}>${esc(s.name)}</td><td ${td}><b dir="ltr">${esc(s.code)}</b>${barVal(s.code) !== s.code ? ` <small dir="ltr">(${esc(barVal(s.code))})</small>` : ''}</td><td ${td}>${s.code ? barcodeSvg(s.code, { h: 7, narrow: 0.25, maxW: 45 }) : ''}</td></tr>`).join('')}</table>`).join('')}</div>`, 'A4');
};
A.cdGen = () => {
  const miss = activeStudents().filter(s => !s.code); if (!miss.length) return toast('كل الطلاب عندهم أكواد ✅');
  confirmBox(`توليد كود جديد لـ ${miss.length} طالب مالهمش كود؟`, () => { miss.forEach(s => save('students', { ...s, code: nextCode() })); toast('اتولّدت الأكواد ✅'); drawCodes(); }, 'توليد');
};

/* =====================================================================
   3) المنصة التعليمية (جاهزة للربط)
   ===================================================================== */
const PL = { tab: 'activate', course: '', group: '', paid: false, q: '' };
const plCfg = () => { const s = S(); return { on: !!s.platOn, url: String(s.platUrl || '').trim().replace(/\/+$/, ''), key: s.platKey || '' }; };
const platHere = () => localStorage.getItem('platHere') === '1' && plCfg().on && !!plCfg().url;
const plCourses = () => all('courses').filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
const enrollOf = (cid, sid) => get('enrolls', cid + '_' + sid);
const stuPayload = s => ({ id: s.id, code: s.code, name: s.name, phone: s.phone || '', parentPhone: s.parentPhone || '', year: yearName(s.yearId), group: groupName(s.groupId), platformId: s.platformId || '' });
const coursePayload = c => ({ id: c.id, platformCourseId: c.platformCourseId || '', name: c.name, year: yearName(c.yearId), price: num(c.price) });
function genActCode() {
  const AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', used = new Set(all('enrolls').map(e => e.code));
  for (;;) { const r = crypto.getRandomValues(new Uint8Array(10)); let c = ''; r.forEach((b, i) => { c += AL[b % AL.length]; if (i === 4) c += '-'; }); if (!used.has(c)) return c; }
}
function qPlat(event, data) {
  if (!platHere()) return;
  save('pq', { id: 'pq_' + uid(), event, payload: data, status: 'pending', tries: 0, at: Date.now() }, { keep: true }); flushPlat();
}
let pFlushing = false;
async function flushPlat() {
  if (pFlushing || !idb || !platHere() || !navigator.onLine) return; pFlushing = true; const c = plCfg();
  try {
    for (let pass = 0; pass < 100; pass++) {
      const q = [...mem.pq.values()].filter(o => o.status === 'pending' && (pass === 0 || o.tries === 0)).sort((a, b) => a.at - b.at); if (!q.length) break;
      let progressed = false;
      for (const o of q) {
        let r; try { r = await fetch(c.url + '/api/center/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': c.key, 'Idempotency-Key': o.id }, body: JSON.stringify({ id: o.id, event: o.event, at: o.at, center: S().center, data: o.payload }) }); } catch (e) { return; }
        if (r.ok) {
          let b = null; try { b = await r.json(); } catch (e) { }
          if (b && b.platformId && o.event === 'student.upsert') { const st = get('students', o.payload.id); if (st && st.platformId !== String(b.platformId)) save('students', { ...st, platformId: String(b.platformId) }); }
          save('pq', { ...o, status: 'sent', sentAt: Date.now(), error: '' }, { keep: true }); progressed = true;
        } else { const t = await r.text().catch(() => ''), hard = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429; save('pq', { ...o, tries: o.tries + 1, status: hard || o.tries + 1 >= 5 ? 'failed' : 'pending', error: (r.status + ' ' + t).slice(0, 300) }, { keep: true }); }
      }
      if (!progressed) break;
    }
  } finally { pFlushing = false; if (ui.route().name === 'platform' && PL.tab === 'link' && !$('#modal .ov') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) drawPlat(); }
}
setInterval(flushPlat, 60000); window.addEventListener('online', () => setTimeout(flushPlat, 800));

V.platform = () => tabBar([['activate', 'التفعيل'], ['courses', 'الكورسات'], ['codes', 'أكواد التفعيل'], ['link', 'الربط والتصدير']], PL.tab, 'plTab') + '<div id="plbody"></div>';
M.platform = () => drawPlat();
A.plTab = a => { PL.tab = a.k; ui.render(); };
function drawPlat() { ({ activate: plActivate, courses: plCoursesTab, codes: plCodes, link: plLink })[PL.tab](); }

/* ---- الكورسات ---- */
function courseForm(c) { c = c || {}; return fld('اسم الكورس', 'name', c.name) + sel('الصف', 'yearId', yearOpts(c.yearId, '— الكل —')) + fld('السعر (اختياري)', 'price', c.price || '', 'number') + fld('معرّف الكورس على المنصة (لو معروف)', 'platformCourseId', c.platformCourseId) + fld('ملاحظات', 'note', c.note); }
function saveCourse(old, d) { if (!d.name) return toast('اكتب اسم الكورس', true); const c = save('courses', { ...(old || { id: uid(), active: true }), name: d.name, yearId: d.yearId, price: num(d.price), platformCourseId: d.platformCourseId, note: d.note }); qPlat('course.upsert', coursePayload(c)); closeModal(); ui.render(); }
function plCoursesTab() {
  $('#plbody').innerHTML = `<div class="bar"><button class="btn" data-act="addCourse">+ كورس</button></div><div class="card">${plCourses().map(c => { const n = all('enrolls').filter(e => e.courseId === c.id && e.status === 'active').length; return `<div class="row"><div class="g"><b>${esc(c.name)}</b><small>${esc(yearName(c.yearId))}${c.price ? ' · ' + money(c.price) : ''} · ${n} مفعّل${c.platformCourseId ? ' · منصة: ' + esc(c.platformCourseId) : ''}</small></div><button class="ib" data-act="editCourse" data-id="${c.id}">✏️</button></div>`; }).join('') || '<div class="empty">لا توجد كورسات. ضيف أول كورس.</div>'}</div>`;
}
A.addCourse = () => modal('كورس جديد', courseForm(), [{ t: 'حفظ', fn: d => saveCourse(null, d) }]);
A.editCourse = a => { const c = get('courses', a.id); modal('تعديل كورس', courseForm(c), [{ t: 'حذف', cls: 'er', fn: () => confirmBox('حذف الكورس؟ التفعيلات القديمة هتفضل مسجلة.', () => { remove('courses', c.id); ui.render(); }) }, { t: 'حفظ', fn: d => saveCourse(c, d) }]); };

/* ---- التفعيل ---- */
function setEnroll(s, c, on) {
  const old = enrollOf(c.id, s.id); if (on && old?.status === 'active') return false; if (!on && (!old || old.status !== 'active')) return false;
  const e = save('enrolls', { id: c.id + '_' + s.id, courseId: c.id, studentId: s.id, status: on ? 'active' : 'revoked', code: old?.code || genActCode(), at: Date.now(), source: 'center' });
  qPlat(on ? 'enrollment.activate' : 'enrollment.revoke', { student: stuPayload(s), course: coursePayload(c), activationCode: e.code, status: e.status }); return true;
}
function plStudents() {
  const mo = curMonth();
  return activeStudents().filter(s => (!PL.group || s.groupId === PL.group) && (!PL.q || [s.name, s.code].some(x => String(x || '').toLowerCase().includes(PL.q.toLowerCase()))) && (!PL.paid || ['ok', 'na'].includes(payState(s, mo).k))).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}
function plActivate() {
  const cs = plCourses(); if (!cs.length) { $('#plbody').innerHTML = '<div class="card empty">ضيف كورس الأول من تاب "الكورسات".</div>'; return; }
  if (!cs.some(c => c.id === PL.course)) PL.course = cs[0].id;
  $('#plbody').innerHTML = `<div class="bar"><select id="plc">${optList(cs.map(c => ({ v: c.id, t: c.name })), PL.course)}</select><select id="plg">${groupOpts(PL.group, 'كل المجموعات')}</select><input id="plq" placeholder="🔍 بحث" value="${esc(PL.q)}"></div>
  <label style="display:inline-flex;gap:6px;align-items:center;margin-bottom:8px"><input type="checkbox" id="plp" ${PL.paid ? 'checked' : ''} style="width:auto"> اللي سدد اشتراك الشهر بس</label>
  <div class="bar"><button class="btn ok" data-act="plAll" data-v="1">✅ تفعيل المعروض</button><button class="btn er" data-act="plAll" data-v="0">⛔ إيقاف المعروض</button></div><div class="stats" id="plst"></div><div class="card" id="pll"></div>`;
  $('#plc').onchange = e => { PL.course = e.target.value; drawPlRows(); }; $('#plg').onchange = e => { PL.group = e.target.value; drawPlRows(); }; $('#plq').oninput = e => { PL.q = e.target.value; drawPlRows(); }; $('#plp').onchange = e => { PL.paid = e.target.checked; drawPlRows(); };
  drawPlRows();
}
function drawPlRows() {
  const c = get('courses', PL.course), l = plStudents(), mo = curMonth(), st = s => enrollOf(c.id, s.id)?.status;
  $('#plst').innerHTML = `<div class="stat"><small>مفعّل</small><b>${l.filter(s => st(s) === 'active').length}</b></div><div class="stat"><small>موقوف</small><b>${l.filter(s => st(s) === 'revoked').length}</b></div><div class="stat"><small>لسه</small><b>${l.filter(s => !st(s)).length}</b></div>`;
  $('#pll').innerHTML = l.slice(0, 300).map(s => { const e = enrollOf(c.id, s.id), ps = payState(s, mo); return `<div class="row"><div class="g"><b>${esc(s.name)}</b><small>${esc(s.code)} · ${esc(groupName(s.groupId))} <span class="pill ${ps.k}">${ps.t}</span></small></div><span class="pill ${e?.status === 'active' ? 'ok' : e ? 'er' : ''}">${e?.status === 'active' ? 'مفعّل' : e ? 'موقوف' : '—'}</span><button class="btn sm ${e?.status === 'active' ? 'er' : 'ok'}" data-act="plTog" data-id="${s.id}">${e?.status === 'active' ? 'إيقاف' : 'تفعيل'}</button></div>`; }).join('') || '<div class="empty">لا يوجد طلاب</div>';
}
A.plTog = a => { const s = get('students', a.id), c = get('courses', PL.course); if (!s || !c) return; setEnroll(s, c, enrollOf(c.id, s.id)?.status !== 'active'); drawPlRows(); };
A.plAll = a => {
  const c = get('courses', PL.course), on = a.v === '1', l = plStudents(); if (!c || !l.length) return toast('لا يوجد طلاب', true);
  confirmBox(`${on ? 'تفعيل' : 'إيقاف'} كورس "${esc(c.name)}" لـ ${l.length} طالب؟`, () => { const n = l.filter(s => setEnroll(s, c, on)).length; toast(`تم لـ ${n} طالب ✅`); drawPlRows(); }, on ? 'تفعيل' : 'إيقاف');
};

/* ---- أكواد التفعيل ---- */
function plCodeRows() { const c = get('courses', PL.course); if (!c) return []; return plStudents().map(s => ({ s, e: enrollOf(c.id, s.id), c })).filter(x => x.e); }
function plCodes() {
  const cs = plCourses(); if (!cs.length) { $('#plbody').innerHTML = '<div class="card empty">ضيف كورس وفعّل طلاب الأول.</div>'; return; }
  if (!cs.some(c => c.id === PL.course)) PL.course = cs[0].id;
  $('#plbody').innerHTML = `<div class="bar"><select id="plc">${optList(cs.map(c => ({ v: c.id, t: c.name })), PL.course)}</select><select id="plg">${groupOpts(PL.group, 'كل المجموعات')}</select></div><div class="bar"><button class="btn" data-act="plCards">🪪 طباعة كروت الأكواد</button><button class="btn ghost" data-act="plCsv">⬇️ CSV</button><button class="btn ghost" data-act="plCopy">📋 نسخ</button></div><div class="card" id="plcl"></div>`;
  const draw = () => { const r = plCodeRows(); $('#plcl').innerHTML = r.map(({ s, e }) => `<div class="row"><div class="g"><b>${esc(s.name)}</b><small>${esc(s.code)} · ${esc(groupName(s.groupId))}</small></div><span class="pill ${e.status === 'active' ? 'ok' : 'er'}" dir="ltr" style="letter-spacing:1px">${esc(e.code)}</span></div>`).join('') || '<div class="empty">مفيش تفعيلات. فعّل طلاب من تاب "التفعيل".</div>'; };
  $('#plc').onchange = e => { PL.course = e.target.value; draw(); }; $('#plg').onchange = e => { PL.group = e.target.value; draw(); }; draw();
}
A.plCards = () => { const r = plCodeRows().filter(x => x.e.status === 'active'); if (!r.length) return toast('لا توجد تفعيلات', true); printHtml(`<div class="cards">${r.map(({ s, e, c }) => `<div class="idcard"><b>${esc(S().center)}</b><div style="font-size:11px">${esc(c.name)}</div><h4>${esc(s.name)}</h4>${barcodeSvg(e.code, { h: 9, narrow: 0.25, maxW: 52 })}<div style="font-size:13px;letter-spacing:1px">${esc(e.code)}</div></div>`).join('')}</div>`); };
A.plCsv = () => { const r = plCodeRows(); if (!r.length) return toast('لا توجد تفعيلات', true); download('activation-codes-' + today() + '.csv', toCsv([['كود الطالب', 'الاسم', 'المجموعة', 'الكورس', 'كود التفعيل', 'الحالة'], ...r.map(({ s, e, c }) => [csvText(s.code), s.name, groupName(s.groupId), c.name, e.code, e.status === 'active' ? 'مفعّل' : 'موقوف'])]), 'text/csv;charset=utf-8'); toast('اتنزّل الملف ✅'); };
A.plCopy = () => copyText(plCodeRows().map(({ s, e }) => s.name + '\t' + e.code).join('\n'));

/* ---- الربط والتصدير ---- */
function plLink() {
  const s = S(), pq = [...mem.pq.values()], pend = pq.filter(o => o.status === 'pending').length, sent = pq.filter(o => o.status === 'sent').length, fail = pq.filter(o => o.status === 'failed').sort((a, b) => b.at - a.at);
  const chk = (id, v) => `<label style="display:inline-flex;gap:6px;align-items:center;margin:0 0 6px 14px"><input type="checkbox" id="${id}" ${v ? 'checked' : ''} style="width:auto">`;
  $('#plbody').innerHTML = `<div class="card"><h3>🔗 الربط بمنصة تعليمية</h3><p style="color:var(--mu);font-size:13px;margin-bottom:8px">لما يبقى عندك منصة، حط رابطها ومفتاحها هنا. التطبيق هيبعتلها الطلاب والكورسات والتفعيلات تلقائيًا. التفاصيل الفنية في ملف PLATFORM-API.md.</p>
  <div>${chk('pl_on', s.platOn)} تفعيل الربط</label>${chk('pl_here', localStorage.getItem('platHere') === '1')} الإرسال من <b>هذا الجهاز</b></label></div>
  ${fld('رابط المنصة', 'pl_url', s.platUrl, 'url', 'placeholder="https://platform.example.com"')}${fld('مفتاح الـ API', 'pl_key', s.platKey, 'password')}
  <div class="bar"><button class="btn" data-act="plSave">حفظ</button><button class="btn ghost" data-act="plTest">اختبار الاتصال</button><button class="btn ghost" data-act="plSyncAll">إرسال كل البيانات</button><button class="btn ghost" data-act="plFlush">إرسال الآن</button></div>
  <p style="font-size:13px">في الانتظار: <b>${pend}</b> · اتبعت: <b>${sent}</b> · فشل: <b>${fail.length}</b></p>${fail.slice(0, 5).map(o => `<div class="row"><div class="g"><b>${esc(o.event)}</b><small>${esc(o.error || '')}</small></div></div>`).join('')}${fail.length ? '<button class="btn sm ghost" data-act="plRetry">إعادة المحاولة للفاشل</button>' : ''}</div>
  <div class="card"><h3>📦 تصدير واستيراد يدوي (بدون ربط مباشر)</h3><p style="color:var(--mu);font-size:13px;margin-bottom:8px">صدّر الطلاب والكورسات والتفعيلات لملف يترفع على أي منصة، واستورد منها نتايج التفعيل.</p><div class="bar"><button class="btn" data-act="plExport">⬇️ تصدير JSON</button><button class="btn ghost" data-act="plExportCsv">⬇️ تفعيلات CSV</button><label class="btn ghost">⬆️ استيراد تفعيلات<input type="file" id="plimp" accept=".json,.csv,.txt" hidden></label></div></div>`;
  $('#plimp').onchange = e => e.target.files[0] && platImport(e.target.files[0]);
}
A.plSave = () => { localStorage.setItem('platHere', $('#pl_here').checked ? '1' : '0'); setS({ platOn: $('#pl_on').checked, platUrl: $('#pl_url').value.trim(), platKey: $('#pl_key').value.trim() }); toast('تم الحفظ ✅'); drawPlat(); flushPlat(); };
A.plTest = async () => {
  const url = ($('#pl_url')?.value || plCfg().url).trim().replace(/\/+$/, ''), key = $('#pl_key')?.value ?? plCfg().key; if (!url) return toast('اكتب رابط المنصة الأول', true);
  try { const r = await fetch(url + '/api/center/ping', { headers: { 'X-Api-Key': key } }); toast(r.ok ? '✅ الاتصال شغال' : 'المنصة ردّت بخطأ ' + r.status, !r.ok); } catch (e) { toast('تعذر الاتصال: الرابط غلط أو المنصة مش بتسمح بالاتصال من موقعك (CORS)', true); }
};
A.plSyncAll = () => {
  if (!platHere()) return toast('فعّل الربط والإرسال من الجهاز واحفظ الأول', true); let n = 0;
  all('courses').forEach(c => { qPlat('course.upsert', coursePayload(c)); n++; }); activeStudents().forEach(s => { qPlat('student.upsert', stuPayload(s)); n++; });
  all('enrolls').filter(e => e.status === 'active').forEach(e => { const s = get('students', e.studentId), c = get('courses', e.courseId); if (s && c) { qPlat('enrollment.activate', { student: stuPayload(s), course: coursePayload(c), activationCode: e.code, status: 'active' }); n++; } });
  toast(n + ' عملية اتحطت في الطابور');
};
A.plFlush = () => { if (!platHere()) return toast('فعّل الربط والإرسال من الجهاز واحفظ الأول', true); flushPlat(); toast('جاري الإرسال...'); };
A.plRetry = () => { [...mem.pq.values()].filter(o => o.status === 'failed').forEach(o => save('pq', { ...o, status: 'pending', tries: 0 }, { keep: true })); flushPlat(); toast('جاري إعادة المحاولة'); };
const enrollRows = () => all('enrolls').map(e => ({ studentCode: get('students', e.studentId)?.code || '', courseId: e.courseId, platformCourseId: get('courses', e.courseId)?.platformCourseId || '', course: get('courses', e.courseId)?.name || '', status: e.status, activationCode: e.code })).filter(r => r.studentCode);
A.plExport = () => { download('center-export-' + today() + '.json', JSON.stringify({ center: S().center, exportedAt: new Date().toISOString(), courses: all('courses').map(coursePayload), students: activeStudents().map(stuPayload), enrollments: enrollRows() }, null, 1)); toast('اتنزّل الملف ✅'); };
A.plExportCsv = () => { download('enrollments-' + today() + '.csv', toCsv([['studentCode', 'courseId', 'platformCourseId', 'course', 'status', 'activationCode'], ...enrollRows().map(r => [csvText(r.studentCode), r.courseId, r.platformCourseId, r.course, r.status, r.activationCode])]), 'text/csv;charset=utf-8'); toast('اتنزّل الملف ✅'); };
function parseCsv(t) {
  t = t.replace(/^﻿/, ''); const first = t.split('\n')[0] || '', d = [',', ';', '\t'].map(x => [x, first.split(x).length]).sort((a, b) => b[1] - a[1])[0][0], rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === d) { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); }
  const h = (rows.shift() || []).map(x => x.trim()); return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(h.map((k, i) => [k, String(r[i] ?? '').trim().replace(/^=/, '')])));
}
async function platImport(file) {
  const text = await file.text(); let rows; try { const j = JSON.parse(text); rows = Array.isArray(j) ? j : (j.enrollments || []); } catch (e) { rows = parseCsv(text); }
  const findC = v => { v = String(v ?? '').trim(); return v ? all('courses').find(c => c.id === v || c.platformCourseId === v || c.name === v) : null; };
  let ok = 0, miss = 0;
  rows.forEach(r => { const s = findStudentByCode(r.studentCode ?? r.code), c = findC(r.courseId) || findC(r.platformCourseId) || findC(r.course); if (!s || !c) { miss++; return; } const off = /^(revoked|inactive|stopped|disabled|0|false|موقوف|ملغي)$/i.test(String(r.status ?? 'active').trim()), old = enrollOf(c.id, s.id); save('enrolls', { id: c.id + '_' + s.id, courseId: c.id, studentId: s.id, status: off ? 'revoked' : 'active', code: r.activationCode || old?.code || genActCode(), at: Date.now(), source: 'platform' }); ok++; });
  toast(`اتطبّق ${ok} تفعيل${miss ? ' · ' + miss + ' سطر ماتعرفش عليه' : ''}`, !ok && !!miss); drawPlat();
}

/* ---- تنبيه العهدة المفتوحة بعد وقت التقرير ---- */
const _eb2 = extraBanner;
extraBanner = function () {
  let h = _eb2();
  try { if (nowTime() >= (S().reportTime || '22:00')) { const it = dayItems(today(), true); if (it.pays.length || it.exps.length) h += `<div class="warn" style="margin-bottom:8px"><span>🏦 العهدة لسه مفتوحة: ${it.pays.length} وصل (${money(it.net)}). اقفلها.</span><a class="btn sm" href="#/treasury">الخزنة</a></div>`; } } catch (e) { }
  return h;
};

/* ================= pro2.js — مراحل منفصلة + اشتراكات/أصناف + تقرير اليوم + إيصال صرف + تحليلات AI + إعدادات منظمة ================= */
'use strict';

const noStage = fn => { const s = STAGE; STAGE = ''; try { return fn(); } finally { STAGE = s; } };
const ordY = (a, b) => (a.order || 0) - (b.order || 0);
const stageName = id => id ? (get('years', id)?.name || '—') : 'كل المراحل';
const sumN = (l, f) => l.reduce((a, x) => a + num(f(x)), 0);

/* التقارير والمهام الخلفية تشتغل على كل المراحل بغض النظر عن التبويب */
reportData = (o => d => noStage(() => o(d)))(reportData);
reportHtml = (o => d => noStage(() => o(d)))(reportHtml);

/* ---------- شريط المراحل (تبويب لكل مرحلة + فتح في تبويب متصفح جديد) ---------- */
function stageBar() {
  let el = $('#stagebar'); if (!el) { el = document.createElement('div'); el.id = 'stagebar'; $('#top').after(el); }
  const ys = all('years').sort(ordY);
  if (STAGE && !ys.find(y => y.id === STAGE)) { STAGE = ''; try { sessionStorage.setItem('stage', ''); } catch (e) { } }
  el.hidden = !ys.length;
  const chip = (id, t) => `<span class="stg-i${STAGE === id ? ' on' : ''}"><button data-act="stage" data-id="${id}">${esc(t)}</button><a href="?stage=${encodeURIComponent(id)}#/dashboard" target="_blank" rel="noopener" title="فتح في تبويب جديد">↗</a></span>`;
  el.innerHTML = `<div class="stg">${chip('', 'كل المراحل')}${ys.map(y => chip(y.id, y.name)).join('')}</div>`;
  document.title = (STAGE ? stageName(STAGE) + ' — ' : '') + (S().center || 'إدارة السنتر');
}
A.stage = a => { STAGE = a.id || ''; try { sessionStorage.setItem('stage', STAGE); } catch (e) { } ui.render(); };
ui.render = (o => function () {
  stageBar(); const r = o.apply(this, arguments);
  if (STAGE) $('#top h1')?.insertAdjacentHTML('beforeend', ` <span class="pill">${esc(stageName(STAGE))}</span>`);
  return r;
})(ui.render);
routes.insights.t = 'تحليلات AI';

/* ---------- الاشتراكات والخصم لكل مرحلة + الأصناف ---------- */
const DEF_ITEMS = ['كتب', 'مذكرات', 'كروت متابعة', 'اشتراك منصة الكورسات'];
const globalItems = () => Array.isArray(S().items) ? S().items : DEF_ITEMS.map(n => ({ name: n, price: 0 }));
const itemsFor = y => [...((S().yearCfg || {})[y]?.items || []), ...globalItems()].filter(i => i.name);
const itemRow = i => `<div class="row it-row"><input class="it-n" value="${esc(i.name || '')}" placeholder="اسم الصنف"><input class="it-p" type="number" inputmode="decimal" value="${i.price || ''}" placeholder="السعر" style="max-width:110px"><button class="ib" data-act="itDel" title="شيل من القايمة">✕</button></div>`;
const feeCards = () => {
  const yc = S().yearCfg || {}, ys = all('years').sort(ordY);
  return `<div class="card" data-tab="fees"><h3>💰 اشتراكات المراحل والأصناف</h3><p style="color:var(--mu);font-size:13px">اكتب اشتراك كل مرحلة ونسبة الخصم الخاصة بيها. سعر المجموعة (لو متحدد) بيتقدّم على سعر المرحلة، ونسبة خصم المرحلة بتتطبق على الاتنين. وكل مرحلة ليها أصنافها (كتب، مذكرات، كروت متابعة...) بالإضافة للأصناف العامة اللي تحت.</p><button class="btn" data-act="saveFees">حفظ الاشتراكات والأصناف</button></div>`
    + (ys.map(y => { const c = yc[y.id] || {}; return `<div class="card fee-card" data-tab="fees" data-y="${y.id}"><h3>🎓 ${esc(y.name)}</h3><div class="grid2">${fld('الاشتراك الشهري (ج.م)', 'yf_' + y.id, c.fee || '', 'number', 'inputmode="decimal"')}${fld('نسبة الخصم %', 'yd_' + y.id, c.disc || '', 'number', 'min="0" max="100"')}</div><b style="font-size:13px">أصناف خاصة بالمرحلة</b><div class="it-list" data-y="${y.id}">${(c.items || []).map(itemRow).join('')}</div><button class="btn sm ghost" data-act="itAdd" data-y="${y.id}">+ صنف</button></div>`; }).join('') || '<div class="card" data-tab="fees"><div class="empty">أضف الصفوف الدراسية الأول من تبويب «السنتر والمراحل».</div></div>')
    + `<div class="card" data-tab="fees"><h3>📚 أصناف عامة (لكل المراحل)</h3><div class="it-list" data-y="*">${globalItems().map(itemRow).join('')}</div><button class="btn sm ghost" data-act="itAdd" data-y="*">+ صنف</button></div>`;
};
A.itAdd = a => { const l = document.querySelector(`.it-list[data-y="${a.y}"]`); if (l) { l.insertAdjacentHTML('beforeend', itemRow({})); l.lastElementChild.querySelector('input').focus(); } };
A.itDel = (a, e) => e.target.closest('.it-row').remove();
const readItems = box => [...box.querySelectorAll('.it-row')].map(r => ({ name: r.querySelector('.it-n').value.trim(), price: num(r.querySelector('.it-p').value) })).filter(i => i.name);
A.saveFees = () => {
  const yearCfg = {}; all('years').forEach(y => { yearCfg[y.id] = { fee: num($('#yf_' + y.id).value), disc: Math.max(0, Math.min(100, num($('#yd_' + y.id).value))), items: readItems(document.querySelector(`.it-list[data-y="${y.id}"]`)) }; });
  setS({ yearCfg, items: readItems(document.querySelector('.it-list[data-y="*"]')) }); toast('تم الحفظ ✅'); ui.render();
};

/* دفعة أخرى: اختيار صنف من الأصناف الخاصة بمرحلة الطالب */
A.otherPay = () => {
  const studs = activeStudents().sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  modal('دفعة أخرى (كتب / مذكرات / كروت / منصة...)', sel('الطالب', 'sid', optList(studs.map(s => ({ v: s.id, t: s.name + ' — ' + s.code })), '', 'اختار طالب'))
    + sel('الصنف', 'item', '<option value="">—</option>') + `<div class="grid2">${fld('الكمية', 'qty', 1, 'number', 'min="1"')}${fld('سعر الوحدة', 'price', '', 'number', 'inputmode="decimal"')}</div><p>الإجمالي: <b id="op_tot">—</b></p>` + fld('بيان / ملاحظة', 'note', ''),
    [{ t: 'تسجيل + وصل', fn: d => {
      const q = Math.max(1, Math.round(num(d.qty))), amt = q * num(d.price); if (!d.sid || amt <= 0) return toast('اختار الطالب واكتب السعر', true);
      const nm = d.item || d.note || 'أخرى', note = nm + (q > 1 ? ' × ' + q : '') + (d.item && d.note ? ' — ' + d.note : '');
      const p = save('payments', { id: uid(), studentId: d.sid, month: PY.m, amount: amt, date: today(), time: nowTime(), receiptNo: nextReceipt(), type: 'other', note, item: d.item || '', qty: q, price: num(d.price) });
      closeModal(); if ($('#plist')) drawPay(); showReceipt(p);
    } }]);
  const m = $('#modal'), S1 = m.querySelector('[name=sid]'), I = m.querySelector('[name=item]'), P = m.querySelector('[name=price]'), Q = m.querySelector('[name=qty]');
  const tot = () => { $('#op_tot').textContent = money(num(Q.value) * num(P.value)); };
  const items = () => { const s = get('students', S1.value); const l = itemsFor(s?.yearId || ''); I.innerHTML = '<option value="">أخرى (اكتب البيان)</option>' + l.map(i => `<option value="${esc(i.name)}" data-p="${i.price || ''}">${esc(i.name)}${i.price ? ' — ' + i.price : ''}</option>`).join(''); I.onchange(); };
  I.onchange = () => { const o = I.selectedOptions[0]; if (o && o.dataset.p) P.value = o.dataset.p; tot(); };
  S1.onchange = items; P.oninput = Q.oninput = tot; items();
};

/* ---------- إيصال صرف (حراري 80مم / 58مم / A4) ---------- */
const nextVoucher = () => { const n = (S().voucherNo || 0) + 1; setS({ voucherNo: n }); return n; };
function voucherHtml(e) {
  const c = S(), l = (a, b) => `<div class="l"><span>${a}</span><b>${b}</b></div>`;
  return `<div class="rcpt"><div style="text-align:center"><b style="font-size:16px">${esc(c.center)}</b><div>${esc(c.teacher)}</div>${c.centerPhone ? `<div style="font-size:11px">${esc(c.centerPhone)}</div>` : ''}${c.centerAddr ? `<div style="font-size:11px">${esc(c.centerAddr)}</div>` : ''}</div><hr>
  <div style="text-align:center;font-weight:800;margin:2px 0">إيصال صرف</div>${l('رقم الإيصال', esc(e.voucherNo || ''))}${l('التاريخ', esc(e.date))}${l('البند', esc(e.category))}${e.staff ? l('المستلم', esc(e.staff)) : ''}${e.yearId ? l('المرحلة', esc(stageName(e.yearId))) : ''}${e.note ? `<div style="font-size:12px;margin-top:3px">${esc(e.note)}</div>` : ''}<hr>
  <div class="l"><b>المبلغ</b><b style="font-size:16px">${money(e.amount)}</b></div><hr><div class="l"><span>توقيع المستلم</span><span>..............</span></div>${c.rcptNote ? `<div style="text-align:center;font-size:11px;margin-top:4px">${esc(c.rcptNote)}</div>` : ''}</div>`;
}
function showVoucher(e) {
  const w = S().rcptW || 80;
  modal('إيصال صرف', voucherHtml(e), [{ t: '🖨 حراري ' + w + 'mm', cls: 'ghost', fn: () => printThermal(voucherHtml(e), w) }, { t: '🖨 A4', cls: 'ghost', fn: () => printHtml(voucherHtml(e).replace('class="rcpt"', 'class="rcpt a4"'), 'A4') }, { t: 'إغلاق', fn: closeModal }]);
}
A.expPrint = a => { let e = get('expenses', a.id); if (!e) return; if (!e.voucherNo) e = save('expenses', { ...e, voucherNo: nextVoucher() }); showVoucher(e); };

/* ---------- تقرير نهاية اليوم (واتساب المدرس): حضور + غياب + مدفوعات + غير المسددين ---------- */
function dayInfo(date, d0) {
  return noStage(() => {
    const d = d0 || reportData(date), month = date.slice(0, 7);
    const absNames = d.groups.flatMap(g => g.abs.map(s => s.name)), c = S();
    const unpaid = activeStudents().map(s => ({ s, st: payState(s, month) })).filter(r => r.st.k === 'er' || r.st.k === 'wa');
    const due = unpaid.reduce((a, r) => a + Math.max(0, r.st.fee - r.st.paid), 0);
    const fees = sumN(d.pays.filter(p => p.type !== 'other'), p => p.amount), other = sumN(d.pays.filter(p => p.type === 'other'), p => p.amount);
    const st = [...allRaw('years').sort(ordY).map(y => y.id), ''].map(y => ({
      nm: y ? stageName(y) : 'بدون مرحلة',
      pres: sumN(d.groups, g => g.pres.filter(r => (stOf(r.studentId) || '') === y).length), abs: sumN(d.groups, g => g.abs.filter(s => (s.yearId || '') === y).length),
      col: sumN(d.pays.filter(p => (stOf(p.studentId) || '') === y), p => p.amount), exp: sumN(d.exps.filter(e => (e.yearId || '') === y), e => e.amount)
    })).filter(r => r.pres || r.abs || r.col || r.exp);
    return { d, absNames, unpaid, due, fees, other, st, c };
  });
}
const namesLine = (l, n) => l.length ? l.slice(0, n).join('، ') + (l.length > n ? ` … و${l.length - n} آخرين` : '') : 'لا يوجد';
function dailyParams(date, d) {
  const x = dayInfo(date, d), net = x.d.collected - x.d.spent, c = x.c;
  return [date, `حضر ${x.d.present} / غاب ${x.d.absent} / متأخر ${x.d.late}`,
    `تحصيل ${money(x.d.collected)} (اشتراكات ${money(x.fees)} · أصناف ${money(x.other)}) - مصروفات ${money(x.d.spent)} - الصافي ${money(net)}`,
    c.dayAbs === false ? 'غير مفعّل' : namesLine(x.absNames, 12),
    c.dayUnpaid === false ? 'غير مفعّل' : x.unpaid.length ? `${x.unpaid.length} طالب بإجمالي ${money(x.due)}: ${namesLine(x.unpaid.map(r => r.s.name), 8)}` : 'لا يوجد',
    c.dayStages === false ? 'غير مفعّل' : x.st.map(r => `${r.nm}: حضور ${r.pres}/غياب ${r.abs}/تحصيل ${money(r.col)}`).join(' | ') || '-'];
}
function dayText(date) {
  const x = dayInfo(date), net = x.d.collected - x.d.spent, c = x.c, day = new Date(date + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long' });
  let t = `📊 *تقرير ${day} ${date}* — ${c.center}\n\n✅ حضور: ${x.d.present}   ❌ غياب: ${x.d.absent}   ⏰ متأخر: ${x.d.late}\n💰 التحصيل: ${money(x.d.collected)} (اشتراكات ${money(x.fees)} · أصناف ${money(x.other)})\n🧾 المصروفات: ${money(x.d.spent)}\n🟰 الصافي: ${money(net)}\n`;
  if (c.dayStages !== false && x.st.length) t += '\n*حسب المرحلة:*\n' + x.st.map(r => `• ${r.nm}: حضور ${r.pres} / غياب ${r.abs} / تحصيل ${money(r.col)}${r.exp ? ' / مصروفات ' + money(r.exp) : ''}`).join('\n') + '\n';
  if (c.dayAbs !== false) t += `\n❌ *الغائبون (${x.absNames.length}):* ${namesLine(x.absNames, 25)}\n`;
  if (c.dayUnpaid !== false) t += `\n💳 *غير المسددين لشهر ${monthName(date.slice(0, 7))} (${x.unpaid.length}):* ${x.unpaid.length ? 'إجمالي ' + money(x.due) + ' — ' + namesLine(x.unpaid.map(r => r.s.name), 15) : 'الكل مسدد 👏'}\n`;
  return t;
}
A.dayWA = () => { const ph = S().ownerPhone; if (!ph) return toast('اكتب رقم المدرس في الإعدادات ← واتساب والتقارير', true); const u = waLink(ph, dayText(today())); if (u) window.open(u, '_blank', 'noopener'); else toast('رقم غير صحيح', true); };
A.dayNow = () => { const t = today(); if (typeof runReport === 'function') runReport(t, false); };
QK_CAT.push({ id: 'dayWA', t: 'تقرير اليوم واتساب', i: '📲', act: 'dayWA' });

/* ---------- تحليلات AI: متفوقين ومقصّرين (أسبوع / شهر) ---------- */
function aiRank() {
  const r = analyzeAll().map(x => { const ex = x.cur.exam, at = x.cur.rate; return { ...x, score: ex != null ? (at != null ? .65 * ex + .35 * at : ex) : at != null ? .7 * at : null }; });
  const ranked = r.filter(x => x.score != null).sort((a, b) => b.score - a.score);
  const top = ranked.filter(x => x.score >= 70 && x.level !== 'risk').slice(0, 10);
  const low = r.filter(x => x.level === 'risk' || x.level === 'watch').sort((a, b) => b.sev - a.sev || (a.score ?? 0) - (b.score ?? 0));
  return { all: r, top, low };
}
const aiToggle = () => `<div class="seg">${[[7, 'آخر أسبوع'], [30, 'آخر شهر']].map(([d, t]) => `<button class="${AI.days === d ? 'on' : ''}" data-act="aiDays" data-d="${d}">${t}</button>`).join('')}</div>`;
A.aiDays = a => { AI.days = +a.d; try { localStorage.setItem('aiDays', a.d); } catch (e) { } ui.render(); };
const detail = x => `${esc(groupName(x.s.groupId))} · حضور ${pct(x.cur.rate)} (${x.cur.present}/${x.cur.sessions}) · امتحانات ${pct(x.cur.exam)}`;
function aiPanel() {
  const { all: r, top, low } = aiRank(); if (!r.some(x => x.level !== 'new')) return '';
  const star = weekRank(today())[0];
  return `<div class="card"><div class="bar" style="justify-content:space-between"><h3 style="margin:0">🧠 تحليلات AI — الأداء</h3>${aiToggle()}</div>
  <div class="stats" style="grid-template-columns:repeat(3,1fr);margin:10px 0"><div class="stat"><small>متفوقون</small><b style="color:var(--ok)">${top.length}</b></div><div class="stat"><small>مقصّرون</small><b style="color:var(--er)">${low.filter(x => x.level === 'risk').length}</b></div><div class="stat"><small>تحت المتابعة</small><b style="color:var(--wa)">${low.filter(x => x.level === 'watch').length}</b></div></div>
  <div class="grid2"><div><b>🏅 أهم المتفوقين</b>${top.slice(0, 5).map((x, i) => `<div class="row"><div class="g"><b>${i + 1}. ${esc(x.s.name)}</b><small>${detail(x)}</small></div><span class="pill ok">${Math.round(x.score)}</span></div>`).join('') || '<div class="empty">لا يوجد بعد</div>'}</div>
  <div><b>⚠️ أهم المقصّرين</b>${low.slice(0, 5).map(x => `<div class="row"><div class="g"><b>${esc(x.s.name)}</b><small>${esc(x.flags.filter(f => f.lv !== 'lo').map(f => f.txt).join(' · '))}</small><small style="color:var(--pr)">💡 ${esc(x.tips[0] || '')}</small></div></div>`).join('') || '<div class="empty">مفيش مقصّرين 👏</div>'}</div></div>
  ${star && isTeacher() ? `<div style="margin-top:8px;font-size:13px">🏆 متفوق الأسبوع: <b>${esc(star.s.name)}</b> — <a href="#/star">اعمل الشهادة</a></div>` : ''}
  <div class="bar" style="margin-top:10px"><a class="btn sm" href="#/insights">التفاصيل الكاملة</a></div></div>`;
}
V.insights = () => `<div class="bar" style="justify-content:space-between">${aiToggle()}<div style="display:flex;gap:8px;flex:1;min-width:240px"><select id="ig">${groupOpts(V._ig || '', 'كل المجموعات')}</select><select id="il"><option value="">كل المستويات</option><option value="risk">محتاج تدخل</option><option value="watch">تحت المتابعة</option><option value="good">متقدّم</option></select></div></div><div id="ilist"></div>`;
M.insights = () => {
  const row = x => { const wa = waLink(x.s.parentPhone || x.s.phone, parentNote(x)); return `<div class="row" style="align-items:flex-start"><div class="g"><b>${esc(x.s.name)}</b> <span class="pill ${LV[x.level][0]}">${LV[x.level][1]}</span><small>${detail(x)}${x.prv.exam != null ? ' (قبلها ' + pct(x.prv.exam) + ')' : ''}</small>${x.flags.map(f => `<small style="display:block;color:var(--${f.lv === 'hi' ? 'er' : f.lv === 'md' ? 'wa' : 'mu'})">• ${esc(f.txt)}</small>`).join('')}${x.good.map(t => `<small style="display:block;color:var(--ok)">✔ ${esc(t)}</small>`).join('')}${x.tips.map(t => `<small style="display:block;color:var(--pr)">💡 ${esc(t)}</small>`).join('')}</div>${wa ? `<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">واتساب</a>` : ''}</div>`; };
  const draw = () => {
    const g = $('#ig').value, lv = $('#il').value; V._ig = g; const R = aiRank(), f = l => l.filter(x => !g || x.s.groupId === g);
    const ex = all('exams').map(e => { const v = all('scores').filter(x => x.examId === e.id).map(x => num(x.score) / (num(e.max) || 100) * 100); return v.length >= 3 ? { e, m: avg(v) } : null; }).filter(Boolean).sort((a, b) => a.m - b.m);
    $('#ilist').innerHTML = (lv ? '' : `<div class="grid2"><div class="card"><h3>🏅 المتفوقون (${f(R.top).length})</h3>${f(R.top).map(row).join('') || '<div class="empty">لا يوجد</div>'}</div><div class="card"><h3>⚠️ المقصّرون (${f(R.low).length})</h3>${f(R.low).slice(0, 30).map(row).join('') || '<div class="empty">لا يوجد 👏</div>'}</div></div>`)
      + `<div class="card"><h3>كل الطلاب</h3>${f(R.all).filter(x => !lv || x.level === lv).sort((a, b) => b.sev - a.sev).slice(0, 150).map(row).join('') || '<div class="empty">لا يوجد</div>'}</div>`
      + (ex[0] && ex[0].m < 60 ? `<div class="card"><h3>ملاحظة على مستوى السنتر</h3><div class="row"><div class="g">📝 أضعف امتحان: <b>${esc(ex[0].e.name)}</b> (متوسط ${pct(ex[0].m)}) — يُفضَّل مراجعته في الحصة.</div></div></div>` : '')
      + '<p style="font-size:12px;color:var(--mu)">التحليل إحصائي على بيانات الحضور والامتحانات والاشتراك المسجّلة، وبيتحسب على جهازك.</p>';
  };
  $('#ig').onchange = $('#il').onchange = draw; draw();
};

/* ---------- الإعدادات المنظمة في تبويبات ---------- */
const STABS = [['center', '🏫', 'السنتر والمراحل'], ['fees', '💰', 'الاشتراكات والأصناف'], ['wa', '💬', 'الواتساب والتقارير'], ['print', '🖨', 'الطباعة والإيصالات'], ['security', '🔒', 'الأمان والصلاحيات'], ['sync', '☁️', 'المزامنة والنسخ'], ['look', '🎨', 'المظهر والاختصارات']];
const tabOf = h => /الاشتراكات المراحل|اشتراكات المراحل|أصناف/.test(h) ? 'fees' : /واتساب|قوالب|رسائل|تقرير|الأهالي/.test(h) ? 'wa' : /إيصال|طباعة|الطباعة/.test(h) ? 'print' : /قفل|المدرس والمساعدين|صلاحيات/.test(h) ? 'security' : /مزامنة|المزامنة|نسخ|النسخ|نقل البيانات|حماية/.test(h) ? 'sync' : /مظهر|المظهر|مفاتيح|اختصار/.test(h) ? 'look' : 'center';
const extraCards = () => {
  const s = S(), z = localStorage.getItem('zoom') || '1', ac = localStorage.getItem('accent') || '';
  return feeCards() + `
  <div class="card" data-tab="center"><h3>🏢 بيانات تظهر على الإيصالات</h3><div class="grid2">${fld('رقم تليفون السنتر', 'c_phone', s.centerPhone || '', 'tel')}${fld('العنوان', 'c_addr', s.centerAddr || '')}</div><button class="btn" data-act="saveRcpt">حفظ</button></div>
  <div class="card" data-tab="print"><h3>🧾 الإيصالات والطباعة الحرارية</h3>
    ${sel('عرض ورق الطابعة الحرارية', 'r_w', `<option value="80"${(s.rcptW || 80) === 80 ? ' selected' : ''}>80 مم</option><option value="58"${s.rcptW === 58 ? ' selected' : ''}>58 مم</option>`)}
    ${fld('سطر أسفل الإيصال', 'r_foot', s.rcptFooter || 'شكرًا لكم')}${fld('ملاحظة إضافية على الإيصال (اختياري)', 'r_note', s.rcptNote || '')}
    <div class="bar"><button class="btn" data-act="saveRcpt">حفظ</button><button class="btn ghost" data-act="testRcpt">طباعة إيصال تجريبي</button></div>
    <small style="color:var(--mu)">بينطبق على إيصالات الدفع وإيصالات صرف المصروفات. إعدادات الدرايفر (الورق والـ Gap) بتفضل من الطابعة نفسها.</small></div>
  <div class="card" data-tab="wa"><h3>📲 تقرير نهاية اليوم على واتساب المدرس</h3>
    <p style="color:var(--mu);font-size:13px;margin-bottom:8px">بيتبعت تلقائيًا في وقت التقرير اليومي (من كارت «التقرير اليومي») على رقم المدرس، ويشمل: الحضور والغياب (بأسماء الغائبين) والمدفوعات (اشتراكات وأصناف) والمصروفات والطلاب غير المسددين، وتفصيل لكل مرحلة. يحتاج قالب <b>daily_summary</b> بالصيغة الجديدة (راجع WHATSAPP-SETUP.md). وبدون قوالب تقدر تبعته يدوي بزر واحد.</p>
    <div>${chkb('d_abs', s.dayAbs !== false, 'أسماء الغائبين')}${chkb('d_unp', s.dayUnpaid !== false, 'غير المسددين')}${chkb('d_stg', s.dayStages !== false, 'تفصيل المراحل')}</div>
    <div class="bar"><button class="btn" data-act="saveDay">حفظ</button><button class="btn ghost" data-act="dayWA">📲 ابعت تقرير اليوم الآن (يدوي)</button><button class="btn ghost" data-act="dayNow">📄 جهّز PDF التقرير الآن</button></div></div>
  <div class="card" data-tab="look"><h3>🎨 المظهر (على هذا الجهاز)</h3>
    <div class="bar"><button class="btn ghost" data-act="theme">🌓 تبديل الوضع الليلي</button></div>
    ${sel('حجم الواجهة', 'ui_zoom', [['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.2', '120%']].map(([v, t]) => `<option value="${v}"${z === v ? ' selected' : ''}>${t}</option>`).join(''))}
    <div class="f"><label>اللون الأساسي</label><div class="swatches">${[['', '#4f46e5'], ['teal', '#0d9488'], ['rose', '#e11d48'], ['amber', '#d97706'], ['sky', '#0284c7'], ['green', '#16a34a']].map(([k, c]) => `<button class="sw${ac === k ? ' on' : ''}" data-act="accent" data-k="${k}" style="background:${c}" title="${k || 'افتراضي'}"></button>`).join('')}</div></div></div>`;
};
const _vSet4 = V.settings;
V.settings = () => `<div id="stabs"></div>` + extraCards() + _vSet4();
const applyTab = () => { const t = V._stab || 'center'; $$('#view > .card').forEach(c => { c.hidden = c.dataset.tab !== t; }); $$('#stabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); };
const _mSet = M.settings;
M.settings = function () {
  _mSet.apply(this, arguments);
  $$('#view > .card').forEach(c => { c.dataset.tab = c.dataset.tab || tabOf(c.querySelector('h3')?.textContent || ''); });
  $('#stabs').innerHTML = STABS.map(([k, i, t]) => `<button data-act="stab" data-t="${k}">${i} ${t}</button>`).join(''); applyTab();
};
A.stab = a => { V._stab = a.t; applyTab(); window.scrollTo(0, 0); };
A.saveRcpt = () => { const p = {}; if ($('#c_phone')) { p.centerPhone = $('#c_phone').value.trim(); p.centerAddr = $('#c_addr').value.trim(); } if ($('#r_w')) { p.rcptW = +$('#r_w').value || 80; p.rcptFooter = $('#r_foot').value.trim(); p.rcptNote = $('#r_note').value.trim(); } setS(p); toast('تم الحفظ ✅'); };
A.testRcpt = () => { const e = { voucherNo: 0, category: 'تجربة', amount: 100, date: today(), note: 'إيصال تجريبي' }; printThermal(voucherHtml(e), S().rcptW || 80); };
A.saveDay = () => { setS({ dayAbs: $('#d_abs').checked, dayUnpaid: $('#d_unp').checked, dayStages: $('#d_stg').checked }); toast('تم الحفظ ✅'); };
const applyLook = () => { try { document.body.style.zoom = localStorage.getItem('zoom') || '1'; const k = localStorage.getItem('accent') || '', C = { teal: ['#0d9488', '#0891b2'], rose: ['#e11d48', '#db2777'], amber: ['#d97706', '#ea580c'], sky: ['#0284c7', '#2563eb'], green: ['#16a34a', '#0d9488'] }[k], r = document.documentElement.style; if (C) { r.setProperty('--pr', C[0]); r.setProperty('--gr', `linear-gradient(135deg,${C[0]},${C[1]})`); r.setProperty('--pr2', C[0] + '1f'); } else { ['--pr', '--gr', '--pr2'].forEach(v => r.removeProperty(v)); } } catch (e) { } };
A.accent = a => { localStorage.setItem('accent', a.k || ''); applyLook(); $$('.sw').forEach(b => b.classList.toggle('on', b.dataset.k === (a.k || ''))); };
document.addEventListener('change', e => { if (e.target.id === 'ui_zoom') { localStorage.setItem('zoom', e.target.value); applyLook(); } });
applyLook();
if (idb) try { ui.render(); } catch (e) { }

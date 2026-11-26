/* ================= pro.js — صلاحيات + رسائل الأهالي + تقرير شهري + تحليل الأداء + شهادة المتفوق ================= */
'use strict';

Object.assign(DEF, { asstNoMobile: true, teacherEmail: '', asstEmails: '' });

/* ---------- أدوات مشتركة ---------- */
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pct = v => v == null ? '—' : Math.round(v) + '%';
const prevMonth = m => { let [y, mm] = m.split('-').map(Number); mm--; if (!mm) { mm = 12; y--; } return y + '-' + pad(mm); };
const chkb = (id, v, t) => `<label style="display:inline-flex;gap:6px;align-items:center;margin:0 0 6px 14px"><input type="checkbox" id="${id}" ${v ? 'checked' : ''} style="width:auto">${t}</label>`;
const proRoutes = () => {
  if (routes.messages) return;
  const ent = Object.entries(routes); Object.keys(routes).forEach(k => delete routes[k]);
  ent.forEach(([k, r]) => {
    if (k === 'platform') {
      routes.insights = { t: 'تحليل الأداء', i: '🧠', g: 'المتابعة' };
      routes.monthly = { t: 'التقرير الشهري', i: '🗓', g: 'المتابعة', teacherOnly: true };
      routes.star = { t: 'متفوق الأسبوع', i: '🏆', g: 'المتابعة', teacherOnly: true };
      routes.messages = { t: 'رسائل الأهالي', i: '📨', g: 'المتابعة', teacherOnly: true };
    }
    routes[k] = r;
  });
};
proRoutes();

/* ---------- محرك التحليل (إحصاء على بيانات السنتر — بدون إرسال بيانات لأي جهة) ---------- */
function perf(s, from, to) {
  const att = all('attendance').filter(a => a.date >= from && a.date <= to);
  const gAtt = att.filter(a => a.groupId === s.groupId);
  const dates = [...new Set(gAtt.map(a => a.date))].sort();
  const mine = att.filter(a => a.studentId === s.id);
  const pres = new Set(mine.filter(a => a.status === 'p').map(a => a.date));
  const sessions = dates.length, present = dates.filter(d => pres.has(d)).length;
  let streak = 0; for (let i = dates.length - 1; i >= 0 && !pres.has(dates[i]); i--) streak++;
  const exams = all('scores').filter(x => x.studentId === s.id).map(x => { const e = get('exams', x.examId); return e && e.date >= from && e.date <= to && num(e.max) > 0 ? { pct: num(x.score) / num(e.max) * 100, name: e.name, date: e.date } : null; }).filter(Boolean);
  return { sessions, present, absent: sessions - present, rate: sessions ? present / sessions * 100 : null, streak, late: mine.filter(a => a.status === 'p' && a.late).length, exams, exam: avg(exams.map(e => e.pct)) };
}
function analyze(s) {
  const t = today(), cur = perf(s, addDays(t, -29), t), prv = perf(s, addDays(t, -59), addDays(t, -30)), pay = payState(s, curMonth());
  const flags = [], tips = [], good = [];
  const add = (lv, txt, tip) => { flags.push({ lv, txt }); if (tip && !tips.includes(tip)) tips.push(tip); };
  if (cur.rate != null) {
    if (cur.rate < 60) add('hi', 'حضور ضعيف ' + pct(cur.rate), 'كلّم ولي الأمر واعرف سبب الغياب، وحدد حصة تعويضية.');
    else if (cur.rate < 75) add('md', 'حضور متوسط ' + pct(cur.rate), 'نبّه الطالب على أهمية الانتظام.');
    if (cur.streak >= 2) add('hi', 'غايب ' + cur.streak + ' حصص ورا بعض', 'اتصل بولي الأمر النهارده قبل ما الغياب يتحول لتسرّب.');
    if (prv.rate != null && prv.rate - cur.rate >= 20) add('md', 'الحضور نزل ' + Math.round(prv.rate - cur.rate) + ' نقطة', 'اسأل الطالب لو حصل تغيير في ظروفه.');
  }
  if (cur.exam != null) {
    if (cur.exam < 50) add('hi', 'مستوى الامتحانات ' + pct(cur.exam), 'مراجعة أساسيات وتمارين إضافية، وحصة تقوية صغيرة لو أمكن.');
    else if (cur.exam < 65) add('md', 'مستوى الامتحانات ' + pct(cur.exam), 'تمارين متدرجة وتصحيح أخطاء الامتحان الأخير معاه.');
    if (prv.exam != null && prv.exam - cur.exam >= 15) add('hi', 'الدرجات نزلت ' + Math.round(prv.exam - cur.exam) + ' نقطة', 'راجع آخر الامتحانات وحدد الدروس اللي اتأثر فيها.');
    if (prv.exam != null && cur.exam - prv.exam >= 10) good.push('تحسّن ' + Math.round(cur.exam - prv.exam) + ' نقطة في الامتحانات');
    if (cur.exam >= 85) good.push('مستوى ممتاز في الامتحانات');
  }
  if (cur.rate != null && cur.rate >= 90) good.push('التزام عالي بالحضور');
  if ((pay.k === 'er' || pay.k === 'wa') && +today().slice(8) > 10) add('lo', 'اشتراك الشهر ' + (pay.k === 'er' ? 'غير مسدد' : 'مسدد جزئيًا'), 'ذكّر ولي الأمر بالاشتراك بلطف.');
  const hasHi = flags.some(f => f.lv === 'hi'), hasMd = flags.some(f => f.lv === 'md');
  const level = hasHi ? 'risk' : hasMd ? 'watch' : good.length ? 'good' : (cur.sessions || cur.exams.length) ? 'ok' : 'new';
  const sev = flags.reduce((a, f) => a + (f.lv === 'hi' ? 3 : f.lv === 'md' ? 2 : 0.5), 0);
  return { s, cur, prv, pay, flags, tips, good, level, sev };
}
const LV = { risk: ['er', 'محتاج تدخل'], watch: ['wa', 'تحت المتابعة'], good: ['ok', 'متقدّم'], ok: ['ok', 'مستقر'], new: ['', 'بيانات قليلة'] };
const analyzeAll = () => activeStudents().map(analyze);
function parentNote(a) {
  const n = a.s.name;
  if (a.level === 'risk' || a.level === 'watch') return `السلام عليكم، بخصوص ${n}: ${a.flags.filter(f => f.lv !== 'lo').map(f => f.txt).join('، ')}. نحب نتعاون مع حضرتكم لتحسين المستوى.`;
  return `السلام عليكم، ${n} مستواه ${a.good.length ? 'ممتاز (' + a.good[0] + ')' : 'مستقر'}، بارك الله فيه.`;
}

/* ---------- لوحة التحليل في الشاشة الرئيسية ---------- */
const _vDash = V.dashboard;
V.dashboard = () => {
  const base = _vDash(); let panel = '';
  try {
    const r = analyzeAll(), risk = r.filter(x => x.level === 'risk').sort((a, b) => b.sev - a.sev), watch = r.filter(x => x.level === 'watch'), good = r.filter(x => x.good.length);
    if (r.some(x => x.level !== 'new')) {
      const star = weekRank(today())[0];
      panel = `<div class="card"><h3>🧠 تحليل الأداء <small style="font-weight:400;color:var(--mu)">(آخر 30 يوم)</small></h3>
      <div class="stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px"><div class="stat"><small>محتاجين تدخل</small><b style="color:var(--er)">${risk.length}</b></div><div class="stat"><small>تحت المتابعة</small><b style="color:var(--wa)">${watch.length}</b></div><div class="stat"><small>متقدمين</small><b style="color:var(--ok)">${good.length}</b></div></div>
      ${risk.slice(0, 5).map(x => `<div class="row"><div class="g"><b>${esc(x.s.name)}</b><small>${esc(x.flags.filter(f => f.lv !== 'lo').map(f => f.txt).join(' · '))}</small><small style="color:var(--pr)">💡 ${esc(x.tips[0] || '')}</small></div></div>`).join('') || '<div class="empty">ما فيش طلاب محتاجين تدخل دلوقتي 👏</div>'}
      ${good.slice(0, 3).length ? `<div style="margin-top:8px;font-size:13px">📈 <b>تقدّم ملحوظ:</b> ${good.slice(0, 3).map(x => esc(x.s.name)).join('، ')}</div>` : ''}
      ${star ? `<div style="margin-top:6px;font-size:13px">🏆 <b>متفوق الأسبوع:</b> ${esc(star.s.name)}${isTeacher() ? ' — <a href="#/star">اعمل الشهادة</a>' : ''}</div>` : ''}
      <div class="bar" style="margin-top:10px"><a class="btn sm" href="#/insights">التحليل الكامل</a></div></div>`;
    }
  } catch (e) { console.error(e); }
  const i = base.indexOf('<div class="grid2">');
  return i < 0 ? base + panel : base.slice(0, i) + panel + base.slice(i);
};

V.insights = () => `<div class="bar"><select id="ig">${groupOpts(V._ig || '', 'كل المجموعات')}</select><select id="il"><option value="">كل المستويات</option><option value="risk">محتاج تدخل</option><option value="watch">تحت المتابعة</option><option value="good">متقدّم</option></select></div><div id="ilist"></div>`;
M.insights = () => {
  const draw = () => {
    const g = $('#ig').value, lv = $('#il').value; V._ig = g;
    const r = analyzeAll().filter(x => (!g || x.s.groupId === g) && (!lv || x.level === lv)).sort((a, b) => b.sev - a.sev);
    const ex = all('exams').map(e => { const v = all('scores').filter(x => x.examId === e.id).map(x => num(x.score) / (num(e.max) || 100) * 100); return v.length >= 3 ? { e, m: avg(v) } : null; }).filter(Boolean).sort((a, b) => a.m - b.m);
    const gs = all('groups').map(gr => { const v = activeStudents().filter(s => s.groupId === gr.id).map(s => perf(s, addDays(today(), -29), today()).rate).filter(x => x != null); return v.length ? { gr, m: avg(v) } : null; }).filter(Boolean).sort((a, b) => a.m - b.m);
    $('#ilist').innerHTML = `<div class="card"><h3>ملاحظات على مستوى السنتر</h3>
      ${ex[0] && ex[0].m < 60 ? `<div class="row"><div class="g">📝 أضعف نتيجة: <b>${esc(ex[0].e.name)}</b> (متوسط ${pct(ex[0].m)}) — يُفضَّل مراجعتها في الحصة.</div></div>` : ''}
      ${gs[0] ? `<div class="row"><div class="g">👥 أقل مجموعة حضورًا: <b>${esc(gs[0].gr.name)}</b> (${pct(gs[0].m)})${gs.length > 1 ? ` — أعلى مجموعة: ${esc(gs[gs.length - 1].gr.name)} (${pct(gs[gs.length - 1].m)})` : ''}</div></div>` : ''}
      ${!ex.length && !gs.length ? '<div class="empty">لسه مفيش بيانات كفاية.</div>' : ''}</div>
    <div class="card"><h3>الطلاب (${r.length})</h3>${r.slice(0, 150).map(x => {
      const wa = waLink(x.s.parentPhone || x.s.phone, parentNote(x));
      return `<div class="row" style="align-items:flex-start"><div class="g"><b>${esc(x.s.name)}</b> <span class="pill ${LV[x.level][0]}">${LV[x.level][1]}</span>
      <small>${esc(groupName(x.s.groupId))} · حضور ${pct(x.cur.rate)} (${x.cur.present}/${x.cur.sessions}) · امتحانات ${pct(x.cur.exam)}${x.prv.exam != null ? ' (قبلها ' + pct(x.prv.exam) + ')' : ''}</small>
      ${x.flags.map(f => `<small style="display:block;color:var(--${f.lv === 'hi' ? 'er' : f.lv === 'md' ? 'wa' : 'mu'})">• ${esc(f.txt)}</small>`).join('')}
      ${x.good.map(t => `<small style="display:block;color:var(--ok)">✔ ${esc(t)}</small>`).join('')}
      ${x.tips.map(t => `<small style="display:block;color:var(--pr)">💡 ${esc(t)}</small>`).join('')}</div>${wa ? `<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">واتساب</a>` : ''}</div>`;
    }).join('') || '<div class="empty">لا يوجد</div>'}</div>
    <p style="font-size:12px;color:var(--mu)">التحليل بيعتمد على الحضور والامتحانات والاشتراك المسجّلين في البرنامج، وبيتحسب على جهازك.</p>`;
  };
  $('#ig').onchange = $('#il').onchange = draw; draw();
};

/* ---------- التقرير الشهري ---------- */
const monthDefault = () => +today().slice(8) <= 7 ? prevMonth(curMonth()) : curMonth();
function monthLast(m) { const [y, mm] = m.split('-').map(Number), t = today(); const end = y + '-' + pad(mm) + '-' + pad(new Date(y, mm, 0).getDate()); return end > t ? t : end; }
function monthReport(s, m) {
  const p = perf(s, m + '-01', monthLast(m)), pay = payState(s, m), a = analyze(s);
  const attS = p.sessions ? `حضر ${p.present} من ${p.sessions} حصة (${pct(p.rate)})${p.late ? ' منها ' + p.late + ' تأخير' : ''}` : 'لا توجد حصص مسجلة';
  const exS = p.exams.length ? `${p.exams.length} امتحان بمتوسط ${pct(p.exam)}` : 'لا توجد امتحانات';
  const payS = pay.k === 'na' ? 'بدون رسوم' : pay.k === 'ok' ? 'مسدد بالكامل' : `متبقي ${money(Math.max(0, pay.fee - pay.paid))}`;
  let rec = a.tips[0] || 'مستوى مستقر، نشجعه على الاستمرار والمذاكرة المنتظمة.';
  if (a.level === 'good') rec = 'أداء متميز، نشجعه على الاستمرار وحل مسائل أصعب.';
  return { p, params: [s.name, monthName(m), attS, exS, payS, rec, S().center], rec };
}
const monthStudents = g => activeStudents().filter(s => !g || s.groupId === g).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
function queueMonthly(m, list) {
  const r = { review: 0, queued: 0, skip: 0, dup: 0, cap: 0 };
  list.forEach(s => { const k = qWA('monthly', s, monthReport(s, m).params, 'mo_' + m + '_' + s.id); r[k] = (r[k] || 0) + 1; });
  return r;
}
V.monthly = () => {
  const m = V._mm || monthDefault();
  return `<div class="card"><h3>🗓 التقرير الشهري لولي الأمر</h3><div class="bar"><input type="month" id="mm" value="${m}" style="max-width:170px"><select id="mg">${groupOpts(V._mg || '', 'كل المجموعات')}</select><button class="btn" data-act="queueMonthly">جهّز رسائل الشهر</button></div>
  <small style="color:var(--mu)">الرسائل بتظهر في «رسائل الأهالي» للمراجعة قبل الإرسال (حسب نمط الإرسال في الإعدادات). الطالب ياخد رسالة واحدة للشهر.</small></div><div class="card" id="mlist"></div>`;
};
M.monthly = () => {
  const draw = () => {
    const m = $('#mm').value || monthDefault(), g = $('#mg').value; V._mm = m; V._mg = g;
    $('#mlist').innerHTML = monthStudents(g).slice(0, 200).map(s => {
      const r = monthReport(s, m), sent = mem.outbox.get('wa_mo_' + m + '_' + s.id), txt = waText('monthly', r.params), wa = waLink(s.parentPhone || s.phone, txt);
      return `<div class="row" style="align-items:flex-start"><div class="g"><b>${esc(s.name)}</b><small>${esc(r.params[2])} · ${esc(r.params[3])} · ${esc(r.params[4])}</small><small style="color:var(--pr)">💡 ${esc(r.rec)}</small>${sent ? `<small>الرسالة: ${esc(OB_ST[sent.status] || sent.status)}</small>` : ''}</div>${wa ? `<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">يدوي</a>` : ''}</div>`;
    }).join('') || '<div class="empty">لا يوجد طلاب</div>';
  };
  $('#mm').onchange = $('#mg').onchange = draw; draw();
};
A.queueMonthly = () => {
  const m = $('#mm').value || monthDefault(), g = $('#mg').value;
  if (!S().waUrl) return toast('اضبط واتساب من الإعدادات الأول (أو استخدم زر «يدوي» لكل طالب)', true);
  const r = queueMonthly(m, monthStudents(g));
  toast(`تم تجهيز ${r.review + r.queued} رسالة${r.dup ? ' · موجودة قبل كده ' + r.dup : ''}${r.skip ? ' · مستبعد ' + r.skip : ''}`); ui.render();
};
setInterval(() => {
  try {
    const c = S(); if (!idb || !c.monthlyAuto || !waHere()) return;
    const t = today(), pm = prevMonth(curMonth()), k = 'moauto_' + pm;
    if (+t.slice(8) !== +c.monthlyDay || nowTime() < (c.monthlyTime || '10:00') || localStorage.getItem(k)) return;
    localStorage.setItem(k, '1'); queueMonthly(pm, activeStudents());
  } catch (e) { }
}, 60000);
setInterval(() => { try { flushWA(); } catch (e) { } }, 20000);

/* ---------- مركز رسائل الأهالي ---------- */
const OB_ST = { review: 'تنتظر موافقتك', pending: 'في الإرسال', sent: 'اتبعتت ✅', failed: 'فشلت', cancelled: 'ملغية' };
const KIND_T = Object.fromEntries(WA_KINDS.map(([k, t]) => [k.toLowerCase(), t]));
V.messages = () => {
  const ob = [...mem.outbox.values()].filter(o => !o.deleted), by = s => ob.filter(o => o.status === s).sort((a, b) => b.at - a.at);
  const row = (o, acts) => `<div class="row" style="align-items:flex-start"><div class="g"><b>${esc(o.name || o.to)}</b> <span class="pill">${esc(KIND_T[o.kind] || o.kind)}</span><small style="white-space:normal">${esc(o.text || '')}</small><small>${new Date(o.at).toLocaleString('ar-EG')}${o.error ? ' · ' + esc(o.error) : ''}</small></div><div class="acts">${acts}</div></div>`;
  const rev = by('review'), pen = by('pending'), fail = by('failed'), sent = by('sent').slice(0, 25);
  const excl = activeStudents().filter(s => s.noWA);
  return `<div class="card"><h3>📨 تنتظر موافقتك (${rev.length})</h3>
    ${rev.length ? `<div class="bar"><button class="btn" data-act="waOkAll">✅ وافق على الكل</button><button class="btn er" data-act="waNoAll">إلغاء الكل</button></div>` : ''}
    ${rev.slice(0, 100).map(o => row(o, `<button class="btn sm" data-act="waOk" data-id="${o.id}">إرسال</button><button class="btn sm er" data-act="waNo" data-id="${o.id}">إلغاء</button>`)).join('') || '<div class="empty">مفيش رسائل منتظرة</div>'}
    <small style="color:var(--mu)">الرسائل بعد موافقتك بتتبعت من جهاز السنتر (المفعّل عليه الإرسال).${waHere() ? '' : ' <b>الجهاز ده مش جهاز الإرسال.</b>'}</small></div>
  ${pen.length ? `<div class="card"><h3>⏳ في الإرسال (${pen.length})</h3>${pen.slice(0, 30).map(o => row(o, `<button class="btn sm er" data-act="waNo" data-id="${o.id}">إلغاء</button>`)).join('')}</div>` : ''}
  ${fail.length ? `<div class="card"><h3>⚠️ فشلت (${fail.length})</h3>${fail.slice(0, 30).map(o => row(o, '')).join('')}<button class="btn sm ghost" data-act="retryWA">إعادة المحاولة</button></div>` : ''}
  <div class="card"><h3>📣 إعلان لأولياء الأمور</h3>
    <div class="bar"><select id="nt_g">${groupOpts('', 'كل المجموعات')}</select></div>
    <div class="f"><label>نص الإعلان (سطر واحد)</label><input id="nt_t" maxlength="300" placeholder="مثال: الحصة بكرة هتبدأ الساعة 5 بدل 4"></div>
    <button class="btn" data-act="sendNotice">جهّز الإعلان</button><small style="display:block;color:var(--mu);margin-top:4px">لازم قالب «center_notice» معتمد من Meta (راجع WHATSAPP-SETUP.md).</small></div>
  <div class="card"><h3>🚫 طلاب مستثنون من الرسائل (${excl.length})</h3>
    <div class="bar"><select id="ex_s">${optList(activeStudents().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(s => ({ v: s.id, t: s.name + ' — ' + s.code })), '', 'اختار طالب')}</select><button class="btn" data-act="exAdd">استثناء</button></div>
    ${excl.map(s => `<div class="row"><div class="g"><b>${esc(s.name)}</b></div><button class="btn sm ghost" data-act="exDel" data-id="${s.id}">رجّعه</button></div>`).join('')}</div>
  ${sent.length ? `<div class="card"><h3>✅ آخر ما اتبعت</h3>${sent.map(o => row(o, '')).join('')}</div>` : ''}`;
};
const setOb = (id, st) => { const o = mem.outbox.get(id); if (o) save('outbox', { ...o, status: st }); };
A.waOk = (id, el) => { setOb(el?.dataset?.id || id, 'pending'); flushWA(); ui.render(); };
A.waNo = (id, el) => { setOb(el?.dataset?.id || id, 'cancelled'); ui.render(); };
A.waOkAll = () => confirmBox('إرسال كل الرسائل المنتظرة؟', () => { [...mem.outbox.values()].filter(o => o.status === 'review').forEach(o => save('outbox', { ...o, status: 'pending' })); flushWA(); ui.render(); }, 'إرسال');
A.waNoAll = () => confirmBox('إلغاء كل الرسائل المنتظرة؟ (مش هتتبعت)', () => { [...mem.outbox.values()].filter(o => o.status === 'review').forEach(o => save('outbox', { ...o, status: 'cancelled' })); ui.render(); }, 'إلغاء الكل');
A.sendNotice = () => {
  const t = $('#nt_t').value.trim(), g = $('#nt_g').value; if (!t) return toast('اكتب نص الإعلان', true); if (!S().waUrl) return toast('اضبط واتساب من الإعدادات', true);
  const id = uid(), list = activeStudents().filter(s => !g || s.groupId === g), r = { review: 0, queued: 0 };
  list.forEach(s => { const k = qWA('notice', s, [S().center, t], 'nt_' + id + '_' + s.id); if (r[k] !== undefined) r[k]++; });
  toast(`تم تجهيز ${r.review + r.queued} رسالة`); ui.render();
};
A.exAdd = () => { const id = $('#ex_s').value; if (!id) return; const s = get('students', id); save('students', { ...s, noWA: true }); ui.render(); };
A.exDel = (id, el) => { const s = get('students', el?.dataset?.id || id); if (s) save('students', { ...s, noWA: false }); ui.render(); };

/* ---------- متفوق الأسبوع ---------- */
function weekRank(end, g) {
  const from = addDays(end, -6);
  return activeStudents().filter(s => !g || s.groupId === g).map(s => {
    const p = perf(s, from, end); if (!p.sessions || p.present === 0) return null;
    const ex = p.exam, a = p.rate, sc = ex != null ? 0.65 * ex + 0.35 * a : 0.7 * a;
    return { s, p, ex, att: a, score: sc - p.late * 1.5 };
  }).filter(Boolean).sort((a, b) => b.score - a.score || (b.att - a.att));
}
function drawCert(name, week, note) {
  const W = 1600, H = 1131, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.direction = 'rtl'; x.textAlign = 'center';
  const F = (w, sz) => `${w} ${sz}px Tajawal, Tahoma, "Segoe UI", sans-serif`, gold = '#b8860b', navy = '#14305c';
  x.fillStyle = '#fffdf6'; x.fillRect(0, 0, W, H);
  x.strokeStyle = navy; x.lineWidth = 14; x.strokeRect(40, 40, W - 80, H - 80); x.strokeStyle = gold; x.lineWidth = 4; x.strokeRect(68, 68, W - 136, H - 136);
  [[68, 68], [W - 68, 68], [68, H - 68], [W - 68, H - 68]].forEach(([a, b]) => { x.fillStyle = gold; x.beginPath(); x.arc(a, b, 16, 0, 7); x.fill(); });
  x.fillStyle = navy; x.font = F('700', 44); x.fillText(S().center || '', W / 2, 190);
  x.fillStyle = gold; x.font = F('800', 120); x.fillText('شهادة تقدير', W / 2, 340);
  x.fillStyle = '#444'; x.font = F('500', 44); x.fillText('تتشرف إدارة السنتر بمنح هذه الشهادة للطالب المتفوق', W / 2, 450);
  x.fillStyle = navy; let sz = 100; x.font = F('800', sz); while (x.measureText(name).width > W - 300 && sz > 40) { sz -= 4; x.font = F('800', sz); } x.fillText(name, W / 2, 600);
  x.strokeStyle = gold; x.lineWidth = 3; x.beginPath(); x.moveTo(400, 640); x.lineTo(W - 400, 640); x.stroke();
  x.fillStyle = '#333'; x.font = F('500', 46); x.fillText(note || 'تقديرًا لتفوقه والتزامه', W / 2, 740);
  x.fillStyle = gold; x.font = F('700', 44); x.fillText('متفوق الأسبوع — ' + week, W / 2, 830);
  x.fillStyle = navy; x.font = F('600', 40); x.fillText('مستر ' + (S().teacher || ''), W - 360, 990); x.fillText('التوقيع', 360, 990);
  x.strokeStyle = '#999'; x.lineWidth = 2; x.beginPath(); x.moveTo(W - 560, 1010); x.lineTo(W - 160, 1010); x.moveTo(160, 1010); x.lineTo(560, 1010); x.stroke();
  return c;
}
V.star = () => `<div class="card"><h3>🏆 متفوق الأسبوع</h3><div class="bar"><input type="date" id="sd" value="${V._sd || today()}" style="max-width:170px"><select id="sg">${groupOpts(V._sg || '', 'كل المجموعات')}</select></div>
  <small style="color:var(--mu)">الترتيب بيعتمد على امتحانات وحضور آخر 7 أيام (التأخير بيخصم شوية). اختار الطالب واكتب عبارة التقدير.</small><div id="srank"></div></div>
  <div class="card"><div class="f"><label>عبارة التقدير</label><input id="sn" value="تقديرًا لتفوقه والتزامه وحسن أخلاقه"></div><canvas id="scv" style="width:100%;border:1px solid var(--br);border-radius:10px"></canvas>
  <div class="bar" style="margin-top:10px"><button class="btn" data-act="starDl">⬇️ تنزيل الصورة</button><button class="btn ghost" data-act="starPrint">🖨 طباعة</button><button class="btn" data-act="starSend">📲 إرسال لولي الأمر</button><a class="btn ghost" id="swa" target="_blank" rel="noopener">واتساب يدوي</a></div></div>`;
let STAR = { sid: '' };
M.star = () => {
  const paint = async () => {
    const s = get('students', STAR.sid), cv = $('#scv'); if (!cv) return;
    if (!s) { cv.width = 10; cv.height = 10; return; }
    try { await document.fonts?.ready; } catch (e) { }
    const end = V._sd || today(), wk = addDays(end, -6) + ' إلى ' + end, c = drawCert(s.name, wk, $('#sn').value); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0);
    const wa = waLink(s.parentPhone || s.phone, waText('star', [s.name, wk, $('#sn').value])), a = $('#swa'); if (a) { a.href = wa || '#'; a.style.display = wa ? '' : 'none'; }
  };
  const draw = () => {
    const end = $('#sd').value || today(), g = $('#sg').value; V._sd = end; V._sg = g;
    const r = weekRank(end, g).slice(0, 8); if (!r.find(x => x.s.id === STAR.sid)) STAR.sid = r[0]?.s.id || '';
    $('#srank').innerHTML = r.map((x, i) => `<label class="row" style="cursor:pointer"><input type="radio" name="sp" value="${x.s.id}" ${x.s.id === STAR.sid ? 'checked' : ''} style="width:auto"><div class="g"><b>${i + 1}. ${esc(x.s.name)}</b><small>${esc(groupName(x.s.groupId))} · امتحانات ${pct(x.ex)} · حضور ${pct(x.att)}</small></div><span class="pill ok">${Math.round(x.score)}</span></label>`).join('') || '<div class="empty">مفيش بيانات حضور في الأسبوع ده</div>';
    $$('input[name=sp]').forEach(e => e.onchange = () => { STAR.sid = e.value; paint(); }); paint();
  };
  $('#sd').onchange = $('#sg').onchange = draw; $('#sn').oninput = paint; draw();
};
const certBlob = (type = 'image/jpeg') => new Promise(r => $('#scv').toBlob(r, type, 0.92));
A.starDl = async () => { const s = get('students', STAR.sid); if (!s) return; const b = await certBlob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'شهادة_' + s.name + '.jpg'; a.click(); };
A.starPrint = () => { const s = get('students', STAR.sid); if (!s) return; printHtml(`<img src="${$('#scv').toDataURL('image/jpeg', .92)}" style="width:100%">`, 'A4 landscape'); };
A.starSend = async () => {
  const s = get('students', STAR.sid); if (!s) return toast('اختار طالب', true);
  const c = S(); if (!c.waUrl || !c.waSecret) return toast('اضبط رابط الـ Worker والرمز السري في الإعدادات', true);
  if (!intlPhone(s.parentPhone || s.phone)) return toast('مفيش رقم لولي الأمر', true);
  const end = V._sd || today(), week = addDays(end, -6) + ' إلى ' + end, note = $('#sn').value;
  toast('جاري رفع الشهادة...');
  try {
    const b = await certBlob(), data = await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); });
    const r = await fetch(c.waUrl.replace(/\/+$/, '') + '/media', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Secret': c.waSecret }, body: JSON.stringify({ mime: 'image/jpeg', data }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.id) throw new Error(j.error?.message || r.status);
    const k = qWA('star', s, [s.name, week, note], 'star_' + end + '_' + s.id, { mediaId: j.id });
    toast(k === 'review' ? 'الرسالة في «رسائل الأهالي» تنتظر موافقتك ✅' : k === 'queued' ? 'في الإرسال ✅' : k === 'dup' ? 'اتبعتت قبل كده لنفس الطالب والأسبوع' : 'الرسالة مستبعدة (راجع إعدادات الإرسال)', k === 'skip');
  } catch (e) { toast('تعذر رفع الشهادة: ' + (e.message || e), true); }
};

/* ---------- الإعدادات: الصلاحيات + التحكم في الرسائل ---------- */
const _vSet2 = V.settings;
V.settings = () => {
  const s = S(), m = k => s['waMode' + k] || 'auto';
  return _vSet2() + `
  <div class="card"><h3>👥 المدرس والمساعدين</h3>
    <p style="color:var(--mu);font-size:13px;margin-bottom:8px">المدرس: كل الصلاحيات. المساعد: يضيف ويعدّل بس — <b>أي مسح</b> للمدرس فقط، وصفحات الإعدادات والمنصة ورسائل الأهالي مخفية عنه.</p>
    <div class="row"><div class="g"><b>الرقم السري للمدرس</b><small>${localStorage.pin ? 'مفعّل ✅' : 'غير مفعّل — فعّله من «القفل» الأول'}</small></div></div>
    <div class="grid2">${fld('الرقم السري للمساعد', 'pa', '', 'password', 'placeholder="' + (localStorage.pinA ? '•••• (اكتب جديد للتغيير)' : 'اتركه فاضي لو مفيش') + '" autocomplete="new-password"')}<div class="f"><label>&nbsp;</label><button class="btn" data-act="setPinA">حفظ رقم المساعد</button></div></div>
    <div>${chkb('as_nm', s.asstNoMobile !== false, 'منع المساعد من الدخول من الموبايل (التطبيق للمدرس فقط)')}</div>
    <small style="color:var(--mu)">الأرقام السرية محفوظة على كل جهاز لوحده: اضبط رقم المساعد على جهازه وإنت مسجّل دخول كمدرس.</small>
    <hr style="margin:10px 0;border:0;border-top:1px solid var(--br)">
    <b style="font-size:13px">حماية حقيقية على السحابة (Firebase)</b>
    <div class="grid2">${fld('إيميل المدرس', 'te', s.teacherEmail, 'email')}${fld('إيميلات المساعدين (مفصولة بفاصلة)', 'ae', s.asstEmails)}</div>
    <div class="bar"><button class="btn" data-act="saveRoles">حفظ</button><button class="btn ghost" data-act="genRules">توليد قواعد Firestore</button></div></div>
  <div class="card"><h3>🎛 التحكم في رسائل الأهالي</h3>
    <p style="color:var(--mu);font-size:13px;margin-bottom:8px">لكل نوع رسالة: <b>تلقائي</b> (تتبعت فورًا) · <b>بعد موافقتي</b> (تظهر في «رسائل الأهالي») · <b>مقفول</b>.</p>
    ${WA_KINDS.filter(([k]) => k !== 'Daily').map(([k, t]) => `<div class="row"><div class="g"><b>${t}</b></div><select id="cm_${k}" style="max-width:150px">${['auto|تلقائي', 'approve|بعد موافقتي', 'off|مقفول'].map(o => { const [v, l] = o.split('|'); return `<option value="${v}"${m(k) === v ? ' selected' : ''}>${l}</option>`; }).join('')}</select></div>`).join('')}
    <div style="margin-top:8px">${chkb('cq_on', s.waQuiet, 'ساعات هدوء (مفيش إرسال فيها، وبتتبعت بعدها)')}</div>
    <div class="grid2">${fld('من', 'cq_f', s.waQuietFrom, 'time')}${fld('إلى', 'cq_t', s.waQuietTo, 'time')}</div>
    ${fld('أقصى عدد رسائل حضور/دفع للطالب في اليوم (0 = بدون حد)', 'cc_cap', s.waCapDay, 'number')}
    <b style="font-size:13px">مجموعات مستثناة من الرسائل:</b><div>${all('groups').map(g => chkb('cx_' + g.id, (s.waExclGroups || []).includes(g.id), esc(g.name))).join('') || '<small>لا توجد مجموعات</small>'}</div>
    <hr style="margin:10px 0;border:0;border-top:1px solid var(--br)"><b style="font-size:13px">التقرير الشهري التلقائي</b>
    <div>${chkb('cm_auto', s.monthlyAuto, 'جهّز تقرير الشهر اللي فات تلقائي (على جهاز الإرسال)')}</div>
    <div class="grid2">${fld('يوم الشهر', 'cm_day', s.monthlyDay, 'number')}${fld('الوقت', 'cm_time', s.monthlyTime, 'time')}</div>
    <button class="btn" data-act="saveCtl">حفظ التحكم</button></div>`;
};
A.setPinA = () => {
  const p = $('#pa').value; if (!p) { localStorage.removeItem('pinA'); toast('تم إلغاء رقم المساعد'); return; }
  if (!localStorage.pin) return toast('فعّل رقم المدرس الأول (القفل)', true);
  if (hashPin(p) === localStorage.pin) return toast('لازم يختلف عن رقم المدرس', true);
  localStorage.pinA = hashPin(p); $('#pa').value = ''; toast('تم حفظ رقم المساعد ✅');
};
A.saveRoles = () => { setS({ asstNoMobile: $('#as_nm').checked, teacherEmail: $('#te').value.trim(), asstEmails: $('#ae').value.trim() }); toast('تم الحفظ ✅'); };
A.saveCtl = () => {
  const p = { waQuiet: $('#cq_on').checked, waQuietFrom: $('#cq_f').value || '22:00', waQuietTo: $('#cq_t').value || '07:00', waCapDay: num($('#cc_cap').value), waExclGroups: all('groups').filter(g => $('#cx_' + g.id)?.checked).map(g => g.id), monthlyAuto: $('#cm_auto').checked, monthlyDay: num($('#cm_day').value) || 1, monthlyTime: $('#cm_time').value || '10:00' };
  WA_KINDS.filter(([k]) => k !== 'Daily').forEach(([k]) => { p['waMode' + k] = $('#cm_' + k).value; });
  setS(p); toast('تم الحفظ ✅'); flushWA();
};
function rulesText() {
  const s = S(), q = e => "'" + String(e).trim().toLowerCase().replace(/'/g, '') + "'", T = q(s.teacherEmail || 'teacher@example.com');
  const A_ = String(s.asstEmails || '').split(',').map(x => x.trim()).filter(Boolean).map(q).join(', ');
  const col = t => `    match /edu_${t}/{id} {
      allow read: if isTeacher() || isAsst();
      allow create: if isTeacher() || isAsst();
      allow update: if isTeacher() || (isAsst() && request.resource.data.get('deleted', false) == false);
      allow delete: if isTeacher();
    }`;
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isTeacher() { return request.auth != null && request.auth.token.email.lower() == ${T}; }
    function isAsst() { return request.auth != null && request.auth.token.email.lower() in [${A_}]; }
${SYNC.map(col).join('\n')}
  }
}`;
}
A.genRules = () => {
  if (!S().teacherEmail) return toast('اكتب إيميل المدرس واحفظ الأول', true);
  modal('قواعد Firestore', `<p style="font-size:13px;margin-bottom:6px">انسخها في Firebase ← Firestore ← Rules ← Publish. بتمنع المساعد من المسح أو تعليم أي سجل «محذوف» حتى لو فتح أدوات المتصفح.</p><textarea readonly id="rtxt" style="width:100%;height:260px;direction:ltr;font-family:monospace;font-size:12px">${esc(rulesText())}</textarea>`, [{ t: 'نسخ', f: () => { $('#rtxt').select(); document.execCommand('copy'); toast('تم النسخ ✅'); return false; } }, { t: 'إغلاق', cls: 'ghost' }]);
};

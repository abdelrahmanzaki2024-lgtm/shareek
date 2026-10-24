/* ============================================================
   كلّمنا: رسائل التاجر لفريق الأمن الحيوي (داخل التطبيق فقط)
   ============================================================ */
(function () {
  'use strict';
  var A = window.APP, S = A.S, esc = A.esc, ic = A.ic, $ = A.$, call = A.call, H = A.handlers, V = A.V;

  var STAT = { open: ['مفتوحة — بانتظار الرد', 'warn'], answered: ['تم الرد', 'ok'], resolved: ['اتحلّت', 'ok'] };
  function slaText(h) { return h <= 2 ? 'ساعتين' : h < 24 ? h + ' ساعات' : h === 24 ? 'يوم' : h === 48 ? 'يومين' : Math.round(h / 24) + ' أيام'; }
  A.slaText = slaText;

  V.talk = function () {
    var out = ['<div class="notice">' + ic('lock') + '<div><b>رسالتك بتوصل للمسؤول جوه التطبيق.</b> مفيش أرقام بتظهر، ورقمك مش بيظهر ليه غير لو قرر يتصل بيك. أرقام المسؤولين محمية.</div></div>', '<button class="btn" data-act="new_ticket">' + ic('plus') + 'رسالة جديدة</button>'];
    if (!S.tickets) return out.join('') + A.loading();
    var list = S.tickets.tickets;
    if (!list.length) out.push('<div class="card tc"><div style="color:var(--mut)">' + ic('chat', 'lg') + '</div><b>لسه ماعندكش رسائل</b><div class="mut sm">لو عندك عائق، شكوى، اقتراح أو بلاغ عاجل ابعته من هنا.</div></div>');
    else {
      out.push('<div class="sec-t">رسائلك</div>');
      list.forEach(function (t) {
        var s = STAT[t.status] || ['', ''];
        out.push('<button class="tkt ' + (t.unread ? 'un' : '') + '" data-act="open_ticket" data-id="' + t.id + '"><div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap"><span class="chip dk">' + esc(t.typeLabel) + '</span><span class="chip ' + s[1] + '">' + s[0] + '</span>' + (t.unread ? '<span class="chip red">رد جديد</span>' : '') + '</div><b style="display:block;margin-top:6px">' + esc(t.subject) + '</b><div class="xs mut">' + esc(t.id) + ' · ' + A.ago(t.lastTs) + '</div></div>' + ic('fwd') + '</button>');
      });
    }
    return out.join('');
  };
  A.post.talk = function () {
    call('ticketList', {}, { quiet: true }).then(function (d) { if (d) { var first = !S.tickets; S.tickets = d; if (S.tab === 'talk' && !S.sub) A.renderView(true); } });
  };

  H.new_ticket = function () { A.openSub({ type: 'newticket', title: 'رسالة جديدة', hidePts: true, tsel: 'obstacle' }); };
  A.subs.newticket = function (sub) {
    var types = (S.tickets && S.tickets.types) || A.ST.ticketTypes || [], cur = types.filter(function (t) { return t.id === sub.tsel; })[0] || types[0] || {};
    var farms = ''; for (var i = 1; i <= 10; i++) farms += '<option value="' + i + '"' + (String(S.me.farmId) === String(i) ? ' selected' : '') + '>مزرعة ' + i + '</option>';
    var extra = cur.id === 'complaint' ? '<div class="notice">' + ic('lock') + '<div>الشكوى بتوصل <b>للمشرف مباشرة</b> ومحدش من موظفي المزرعة بيشوفها.</div></div>' : cur.id === 'urgent' ? '<div class="notice">' + ic('warn') + '<div>لو الموقف خطر فوري في الموقع، كلّم معاون البوابة مباشرة كمان. وده بيتصعّد تلقائي لو ماتردش عليه.</div></div>' : '';
    return '<div class="col"><div class="fld"><label>نوع الرسالة</label><div class="row" style="flex-wrap:wrap;gap:8px">' + types.map(function (t) { return '<button class="chip ' + (t.id === cur.id ? 'sel' : '') + '" data-act="tsel" data-id="' + t.id + '">' + esc(t.label) + '</button>'; }).join('') + '</div><span class="help">' + esc(cur.hint || '') + (cur.sla ? ' · بنستهدف الرد خلال ' + slaText(cur.sla) : '') + '</span></div>' + extra +
      A.fld('nt_farm', 'المزرعة المعنية', '<select id="nt_farm" class="in"><option value="">مش متعلقة بمزرعة</option>' + farms + '</select>') +
      A.fld('nt_sub', 'العنوان', '<input id="nt_sub" class="in" maxlength="80" placeholder="جملة قصيرة تلخص الموضوع">') +
      A.fld('nt_body', 'التفاصيل', '<textarea id="nt_body" class="in" maxlength="1200" placeholder="اكتب اللي حصل بالتفصيل: إمتى وفين، ولو فيه رقم عربية أو وقت."></textarea>') +
      '<div class="err" id="nt_err"></div><button class="btn" data-act="send_ticket">إرسال</button></div>';
  };
  H.tsel = function (el) { S.sub.tsel = el.dataset.id; var s = [$('#nt_sub'), $('#nt_body'), $('#nt_farm')].map(function (e) { return e ? e.value : ''; }); A.renderView(); $('#nt_sub').value = s[0]; $('#nt_body').value = s[1]; $('#nt_farm').value = s[2]; };
  H.send_ticket = function (el) {
    var p = { type: S.sub.tsel, farmId: $('#nt_farm').value, subject: $('#nt_sub').value, body: $('#nt_body').value };
    $('#nt_err').textContent = ''; el.disabled = true;
    call('ticketCreate', p, { keepErr: true }).then(function (d) {
      el.disabled = false;
      if (d && d.__err) return ($('#nt_err').textContent = d.__err.msg);
      if (!d) return;
      S.tickets = null; A.toast('وصلت رسالتك لفريق الأمن الحيوي', 'ok');
      S.sub = { type: 'thread', id: d.id, title: 'رسالتك', hidePts: true, from: null }; S.tab = 'talk'; A.screens.trader();
    });
  };

  H.open_ticket = function (el) { A.openSub({ type: 'thread', id: el.dataset.id, title: 'رسالتك', hidePts: true }); };
  A.subs.thread = function (sub) {
    if (!sub.data) { loadThread(sub); return A.loading(); }
    var t = sub.data.ticket, msgs = sub.data.msgs, s = STAT[t.status] || ['', ''];
    var bubbles = msgs.map(function (m) {
      return m.from === 'trader' ? '<div class="bub me">' + esc(m.text) + '<small>' + A.fdt(m.ts) + '</small></div>' : '<div class="bub st"><b class="who">' + esc(m.who || 'فريق الأمن الحيوي') + '</b>' + esc(m.text) + '<small>' + A.fdt(m.ts) + '</small></div>';
    }).join('');
    var rate = sub.data.canRate ? '<div class="card tc"><b>الرد كان مفيد؟ قيّمه (+2 نقطة)</b><div class="stars" style="margin-top:6px">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-act="rate" data-n="' + n + '" aria-label="' + n + '">' + ic('star', 'lg').replace('fill:none', '') + '</button>'; }).join('') + '</div></div>' : '';
    return '<div class="card"><div class="row" style="flex-wrap:wrap;gap:6px"><span class="chip dk">' + esc(t.typeLabel) + '</span><span class="chip ' + s[1] + '">' + s[0] + '</span>' + (t.stars ? '<span class="chip warn">' + ic('star', 'sm') + t.stars + '</span>' : '') + '</div><h3 style="margin-top:8px">' + esc(t.subject) + '</h3><div class="xs mut">' + esc(t.id) + '</div></div><div class="col" style="gap:8px">' + bubbles + '</div>' + rate +
      '<div class="card col"><textarea id="rp_text" class="in" maxlength="1200" placeholder="اكتب ردك أو سؤالك…" style="min-height:80px"></textarea><div class="err" id="rp_err"></div><button class="btn" data-act="reply">إرسال</button></div>';
  };
  function loadThread(sub) {
    call('ticketGet', { id: sub.id }).then(function (d) {
      if (!d) { S.sub = null; return A.screens.trader(); }
      var was = sub.wasUnread;
      sub.data = d; S.tickets = null;
      if (S.me.unread > 0 && d.ticket) S.me.unread = Math.max(0, S.me.unread - 1);
      if (S.sub === sub) { var hdr = $('.hdr'); A.renderView(); }
    });
  }
  H.reply = function (el) {
    var t = $('#rp_text').value; $('#rp_err').textContent = '';
    if (t.trim().length < 2) return ($('#rp_err').textContent = 'اكتب ردك الأول');
    el.disabled = true;
    call('ticketReply', { id: S.sub.id, text: t }, { keepErr: true }).then(function (d) {
      el.disabled = false;
      if (d && d.__err) return ($('#rp_err').textContent = d.__err.msg);
      if (d) { S.sub.data = d; S.tickets = null; A.toast('اتبعتت', 'ok'); A.renderView(); window.scrollTo(0, document.body.scrollHeight); }
    });
  };
  H.rate = function (el) {
    call('ticketRate', { id: S.sub.id, stars: Number(el.dataset.n) }).then(function (d) {
      if (!d) return;
      A.setMe(d.me); A.popPts(d.pts); A.toast('شكرًا على تقييمك', 'ok');
      S.sub.data.canRate = false; S.sub.data.ticket.stars = Number(el.dataset.n); A.renderView();
    });
  };

  /* تحديث الإشعارات عند العودة للتطبيق */
  var lastPing = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || S.role !== 'trader' || !S.tok) return;
    if (Date.now() - lastPing < 60000) return; lastPing = Date.now();
    call('me', {}, { quiet: true }).then(function (m) { if (m && S.role === 'trader') { var changed = m.unread !== S.me.unread; A.setMe(m); if (changed && !S.sub) A.screens.trader(); } });
  });
})();

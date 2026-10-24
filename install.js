/* تثبيت التطبيق (النسخة المستضافة على GitHub Pages فقط).
   1) بطاقة «ثبّت التطبيق» دايمًا ظاهرة في شاشة الدخول وفي حسابي، بخطوات تناسب الجهاز (أندرويد، آيفون، لابتوب، أو متصفح تطبيق مثل واتساب).
      لا تعتمد على ظهور زر المتصفح نفسه، لأن المتصفح لا يعرضه في كل الحالات.
   2) شريط تثبيت سفلي يظهر فقط لما المتصفح يسمح بالتثبيت المباشر (أندرويد وكروم وإيدج)، ويتذكر الإخفاء.
   البطاقة والشريط مخفيان تمامًا لو التطبيق متثبّت بالفعل ويشتغل كتطبيق مستقل. */
(function () {
  'use strict';
  var A = window.APP, H = A.handlers;
  var KEY = 'c3a_install_hide';
  var deferred = null, bar = null;

  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function dismissed() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } }
  function platform() {
    var ua = window.navigator.userAgent || '';
    var mac = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
    return {
      ios: /iphone|ipad|ipod/i.test(ua) || mac,
      android: /android/i.test(ua),
      inApp: /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|TikTok/i.test(ua)
    };
  }
  function stepsText(p) {
    if (p.inApp) return 'الصفحة اتفتحت من تطبيق تاني (واتساب أو فيسبوك). اضغط القايمة واختار «فتح في المتصفح» (Chrome أو Safari)، وبعدين ثبّته من هنا.';
    if (p.ios) return 'افتح الرابط في Safari. اضغط زر المشاركة (المربع اللي فيه سهم لفوق) ← «إضافة إلى الشاشة الرئيسية» ← «إضافة».';
    if (p.android) return 'اضغط النقط التلاتة فوق يمين الشاشة ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». (في Samsung Internet: القايمة ← إضافة الصفحة إلى ← الشاشة الرئيسية.)';
    return 'في Chrome أو Edge: اضغط أيقونة التثبيت جوه شريط العنوان، أو من القايمة ← «تثبيت شريك الدفاع».';
  }
  function promptBtn() {
    return deferred ? '<button class="btn dk" data-act="inst_prompt">ثبّت دلوقتي</button>' : '';
  }
  /* البطاقة: لا تتوقف على ظهور زر المتصفح، والخطوات جاهزة دايمًا */
  function cardHtml() {
    if (standalone()) return '';
    return '<div class="card col" id="inst-card" role="region" aria-label="بطاقة تثبيت التطبيق على موبايلك" style="margin:12px 16px">' +
      '<b>ثبّت التطبيق على موبايلك</b>' +
      '<p class="mut sm" style="margin:0">بيفتح من الشاشة الرئيسية زي أي تطبيق، ومن غير ما تدور على الرابط كل مرة.</p>' +
      '<div id="inst-slot" class="col">' + promptBtn() + '</div>' +
      '<p class="sm" style="margin:0">' + stepsText(platform()) + '</p>' +
      '<button class="lnk" data-act="inst_copy">انسخ رابط التطبيق عشان تبعته لزمايلك</button>' +
      '</div>';
  }
  A.authExtra = cardHtml;

  /* في حسابي: البطاقة تحت الحساب */
  var prevAcc = A.subs && A.subs.account;
  if (prevAcc) A.subs.account = function (sub) { return prevAcc(sub) + cardHtml(); };

  H.inst_copy = function () {
    A.copyText(window.location.origin + window.location.pathname);
  };
  H.inst_prompt = function () {
    var d = deferred;
    if (!d) { A.toast('الزر ده مش متاح على المتصفح ده، اتبع الخطوات اللي تحت', 'err'); return; }
    deferred = null;
    removeCardPrompt();
    try {
      d.prompt();
      d.userChoice.then(function (c) { if (c && c.outcome === 'accepted') close(); }, function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  };

  function removeCardPrompt() {
    var b = document.querySelector('[data-act="inst_prompt"]');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  function addCardPrompt() {
    var slot = document.getElementById('inst-slot');
    if (!slot || slot.querySelector('[data-act="inst_prompt"]')) return;
    slot.innerHTML = promptBtn();
  }

  /* شريط سفلي للمتصفحات التي تدعم التثبيت المباشر */
  function show(text) {
    if (bar || standalone() || dismissed()) return;
    bar = document.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'تثبيت التطبيق');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:9999;' +
      'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#242424;color:#fff;' +
      'font:600 14px/1.6 Cairo,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    var span = document.createElement('span');
    span.style.cssText = 'flex:1;min-width:0';
    span.textContent = text;
    bar.appendChild(span);
    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'تثبيت';
    go.style.cssText = 'font:700 13px Cairo,system-ui,sans-serif;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;white-space:nowrap;background:#EA2329;color:#fff';
    go.onclick = function () { H.inst_prompt(); };
    bar.appendChild(go);
    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', 'إخفاء');
    x.style.cssText = 'font:700 16px Cairo,system-ui,sans-serif;border:0;background:transparent;color:#fff;padding:6px 8px;cursor:pointer';
    x.onclick = function () { remember(); hideBar(); };
    bar.appendChild(x);
    document.body.appendChild(bar);
  }
  function hideBar() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }
  function close() {
    hideBar();
    removeCardPrompt();
    var c = document.getElementById('inst-card');
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    addCardPrompt();
    show('ثبّت «شريك الدفاع» على موبايلك أو لابتوبك وافتحه زي أي تطبيق');
  });
  window.addEventListener('appinstalled', function () { deferred = null; remember(); close(); });
})();

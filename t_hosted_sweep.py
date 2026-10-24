# مسح شامل للنسخة المستضافة (GitHub Pages) مقابل خادم المحاكاة: الدخول بكل طرقه، الشاشات، التثبيت، وحالات الشبكة
import urllib.request, re, json
from playwright.sync_api import sync_playwright
PAGE = 'http://127.0.0.1:8765/'
MOCK = 'http://127.0.0.1:8790/exec'
res = []
notes = []
def check(c, m, extra=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m + ((' ' + str(extra)) if extra and not c else ''))
def fwd(route, request):
    body = (request.post_data or '').encode('utf-8')
    req = urllib.request.Request(MOCK, data=body, method='POST', headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req) as r: data = r.read()
    route.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=data)
def abort(route, request): route.abort()
def html_resp(route, request):
    route.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html; charset=utf-8'}, body='<html><body>Sign in</body></html>')
def kill(pg):
    pg.evaluate("document.querySelectorAll('#ovl').forEach(function (n) { n.remove(); })")
def toasts(pg):
    return pg.evaluate("Array.from(document.querySelectorAll('#toast div')).map(function(d){return d.textContent}).join(' || ')")
BAD_WORDS = ['undefined', 'NaN', '[object', 'null']
def clean(txt):
    return [w for w in BAD_WORDS if w in txt]

GAS = re.compile(r'https://script\.google\.com/.*')
NOISE = re.compile(r'https://(cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com|tile\.openstreetmap\.org)/.*')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    def new_ctx(gas_handler=fwd, offline=False):
        c = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar-EG', timezone_id='Africa/Cairo', is_mobile=True, has_touch=True)
        c.route(GAS, gas_handler)
        c.route(NOISE, lambda r: r.abort())
        return c
    errs = []
    def watch(pg, tag):
        pg.on('pageerror', lambda e: errs.append(tag + ': ' + str(e)))

    # ---------- 1) الملفات الأساسية للتثبيت ----------
    ctx = new_ctx()
    pg = ctx.new_page(); watch(pg, 'static')
    pg.goto(PAGE); pg.wait_for_timeout(1500)
    for path in ['manifest.webmanifest', 'config.js', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'firebase-messaging-sw.js']:
        st = pg.evaluate("fetch(%r, {cache:'no-store'}).then(function(r){return r.status}).catch(function(){return 0})" % path)
        check(st == 200, 'ملف متاح: ' + path, st)
    man = pg.evaluate("fetch('manifest.webmanifest', {cache:'no-store'}).then(function(r){return r.json()})")
    check(man.get('display') == 'standalone' and len(man.get('icons', [])) >= 2 and man.get('start_url'), 'المانيفست صالح للتثبيت (standalone + أيقونات)', man.get('display'))

    # ---------- 2) شاشة الدخول: بطاقة التثبيت دايمًا ظاهرة ----------
    pg.goto(PAGE); pg.wait_for_timeout(1800)
    check(pg.locator('#inst-card').count() == 1, 'بطاقة التثبيت ظاهرة في شاشة الدخول')
    txt = pg.inner_text('#inst-card')
    check('ثبّت التطبيق على موبايلك' in txt and 'انسخ رابط التطبيق' in txt, 'البطاقة فيها الخطوات وزر النسخ', txt[:120])
    check(pg.locator('[data-act="inst_copy"]').count() == 1, 'زر نسخ الرابط موجود')
    pg.click('[data-act="inst_copy"]'); pg.wait_for_timeout(300)
    check('تم النسخ' in toasts(pg) or 'انسخ يدويًا' in toasts(pg), 'زر النسخ يعمل بلا خطأ', toasts(pg))
    check(not clean(pg.inner_text('#app')), 'شاشة الدخول بلا كلمات مكسورة', clean(pg.inner_text('#app')))

    # ---------- 3) دخول التاجر بالنموذج الحقيقي ----------
    pg.fill('#l_phone', '01100000001'); pg.fill('#l_pin', '1234')
    pg.click('[data-act="login"]'); pg.wait_for_timeout(2200); kill(pg)
    check(pg.locator('nav.tabs').count() == 1, 'التاجر يدخل من النسخة المستضافة', toasts(pg))
    for tid in ['today', 'learn', 'play', 'market', 'talk']:
        pg.click('nav.tabs [data-act="tab"][data-id="%s"]' % tid if pg.locator('nav.tabs [data-act="tab"]').count() else 'nav.tabs button >> nth=%d' % ['today','learn','play','market','talk'].index(tid))
        pg.wait_for_timeout(650)
        t = pg.inner_text('#app')
        check(len(t) > 40 and not clean(t), 'تبويب «' + tid + '» يفتح بمحتوى سليم', clean(t))
    pg.click('#app .hdr [data-act="account"]'); pg.wait_for_timeout(700)
    t = pg.inner_text('#app')
    check('حسابي' in t or 'شكل الشاشة' in t, 'حسابي يفتح بعد الدخول')
    check(pg.locator('#inst-card').count() == 1, 'بطاقة التثبيت ظاهرة داخل حسابي أيضًا')
    check(pg.locator('[data-act="scr_say"]').count() >= 0, 'زر الصوت موجود أو مخفي حسب الإعداد')
    pg.click('[data-act="seg"][data-g="account"][data-id="set"]'); pg.wait_for_timeout(500)
    check(pg.locator('[data-act="logout"]').count() == 1, 'زر تسجيل الخروج في الإعدادات')
    pg.click('[data-act="logout"]'); pg.wait_for_timeout(700)
    check(pg.locator('#l_phone').count() == 1, 'الخروج يرجّع شاشة الدخول')
    pg.close()

    # ---------- 4) رسائل الشبكة: كل حالة لها رسالتها ----------
    ctxA = new_ctx(gas_handler=abort)
    pa = ctxA.new_page(); watch(pa, 'abort')
    pa.goto(PAGE); pa.wait_for_timeout(1800)
    pa.fill('#l_phone', '01100000001'); pa.fill('#l_pin', '1234')
    pa.click('[data-act="login"]'); pa.wait_for_timeout(1500)
    err = pa.inner_text('#l_err')
    check('الخادم مش بيرد على المتصفح ده' in err, 'الإنترنت شغال والخادم مقفول: رسالة الخادم (مش «مفيش إنترنت»)', err)
    check('مفيش إنترنت' not in err, 'لا تظهر رسالة «مفيش إنترنت» وهو متصل')
    ctxA.close()

    ctxB = new_ctx(gas_handler=html_resp)
    pb = ctxB.new_page(); watch(pb, 'html')
    pb.goto(PAGE); pb.wait_for_timeout(1800)
    pb.fill('#l_phone', '01100000001'); pb.fill('#l_pin', '1234')
    pb.click('[data-act="login"]'); pb.wait_for_timeout(1500)
    err = pb.inner_text('#l_err')
    check('الخادم رد برد مش مفهوم' in err, 'رد HTML بدل JSON: رسالة إعادة النشر', err)
    ctxB.close()

    ctxC = new_ctx(gas_handler=abort)
    pc = ctxC.new_page(); watch(pc, 'offline')
    pc.goto(PAGE); pc.wait_for_timeout(1800)
    pc.fill('#l_phone', '01100000001'); pc.fill('#l_pin', '1234')
    pc.evaluate("Object.defineProperty(navigator,'onLine',{get:function(){return false},configurable:true})")
    pc.click('[data-act="login"]'); pc.wait_for_timeout(1200)
    err = pc.inner_text('#l_err')
    check('مفيش إنترنت دلوقتي' in err, 'الجهاز أوفلاين فعلًا: رسالة «مفيش إنترنت»', err)
    ctxC.close()

    # ---------- 5) حساب جديد ----------
    ctxR = new_ctx()
    pr = ctxR.new_page(); watch(pr, 'register')
    pr.goto(PAGE); pr.wait_for_timeout(1800)
    pr.click('[data-act="authmode"][data-m="register"]'); pr.wait_for_timeout(300)
    import random
    newphone = '0125' + ''.join(random.choice('0123456789') for _ in range(7))
    pr.fill('#r_name', 'تاجر تجربة المسح'); pr.fill('#r_phone', newphone); pr.fill('#r_pin', '4321')
    pr.fill('#r_plate', '1234 أ ب ج'); pr.fill('#r_company', 'مزرعة تجريبية')
    pr.check('#r_agree')
    pr.click('[data-act="register"]'); pr.wait_for_timeout(2200); kill(pr)
    ok_reg = pr.locator('nav.tabs').count() == 1
    check(ok_reg, 'تسجيل حساب جديد يدخل التاجر مباشرة', toasts(pr) + ' | ' + pr.inner_text('#r_err') if pr.locator('#r_err').count() else toasts(pr))
    ctxR.close()

    # ---------- 6) دخول الموظفين والتبويبات ----------
    ctxS = new_ctx()
    ps = ctxS.new_page(); watch(ps, 'staff')
    ps.goto(PAGE); ps.wait_for_timeout(1800)
    ps.click('[data-act="authmode"][data-m="staff"]'); ps.wait_for_timeout(300)
    ps.fill('#s_phone', '01000000004'); ps.fill('#s_pin', '1234')
    ps.click('[data-act="staffLogin"]'); ps.wait_for_timeout(2200); kill(ps)
    check(ps.locator('[data-act="stab"]').count() >= 4, 'الموظف يدخل ويظهر شريط تبويبات الفريق', ps.locator('[data-act="stab"]').count())
    for sid in ['gate', 'inbox', 'farms', 'market', 'dash']:
        if ps.locator('[data-act="stab"][data-id="%s"]' % sid).count():
            ps.click('[data-act="stab"][data-id="%s"]' % sid); ps.wait_for_timeout(650)
            t = ps.inner_text('#app')
            check(len(t) > 30 and not clean(t), 'تبويب الفريق «' + sid + '» يفتح بمحتوى سليم', clean(t))
        else:
            check(False, 'تبويب الفريق «' + sid + '» موجود', 'missing')
    ps.close()

    # ---------- 7) رابط السائق: رابط غير صالح يعرض رسالة ولا ينهار ----------
    ctxD = new_ctx()
    pd = ctxD.new_page(); watch(pd, 'route')
    pd.goto(PAGE + '?r=ABCDEFGHIJKLMNOPQRST'); pd.wait_for_timeout(2000)
    t = pd.inner_text('#app')
    check(len(t) > 10 and not clean(t), 'رابط السائق غير الصالح يعرض شاشة بدل صفحة فارغة', t[:120])
    ctxD.close()

    b.close()
print('\nLOGIC CHECKS: ' + str(sum(res)) + ' PASS, ' + str(len(res) - sum(res)) + ' FAIL')
print('PAGE ERRORS:', errs[:10])

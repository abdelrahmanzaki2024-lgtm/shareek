# فحص حاجز الأخطاء في الواجهة: شاشة تنهار تعرض بطاقة استرداد، ثم «حاول تاني» يعيد الشاشة سليمة
import re
from playwright.sync_api import sync_playwright

URL = 'file:///tmp/claude-0/work/app/out/demo_full.html'
res = []

def check(c, m, extra=''):
    res.append(bool(c))
    print(('PASS ' if c else 'FAIL ') + m + ((' ' + str(extra)) if extra and not c else ''))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar-EG', timezone_id='Africa/Cairo', is_mobile=True, has_touch=True)
    ctx.route(re.compile(r'https://(cdnjs\.cloudflare\.com|tile\.openstreetmap\.org|fonts\.(googleapis|gstatic)\.com)/.*'), lambda r: r.abort())
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.click('[data-act="quickstaff"][data-p="01000000004"]'); pg.wait_for_timeout(900)

    pg.evaluate("window.__origStaff = APP.screens.staff; APP.screens.staff = function () { throw new Error('فشل اختباري'); }; APP.render();")
    pg.wait_for_timeout(300)
    check(pg.locator('[data-act="recover"]').count() == 1, 'a crashing screen shows the recovery card instead of a blank page')
    check('مفيش حاجة اتمسحت' in pg.inner_text('#app'), 'recovery card reassures the user nothing was erased')
    pg.evaluate("APP.screens.staff = window.__origStaff;")
    pg.wait_for_timeout(4200)   # الرسائل المنبثقة تغطي أعلى الشاشة ثم تختفي
    if pg.locator('[data-act="recover"]').count():
        pg.click('[data-act="recover"]'); pg.wait_for_timeout(700)
    check(pg.locator('[data-act="recover"]').count() == 0 and pg.locator('nav.tabs').count() == 1, 'the working staff screen comes back (by retry or automatically)')

    # عدم وجود أخطاء صفحة غير مُعالجة بعد الاسترداد
    check(not errs, 'no unhandled page errors', errs)
    b.close()

print('\nSTAB UI PASS', sum(res), 'FAIL', len(res) - sum(res))

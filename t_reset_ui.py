# فحص واجهة إعادة التهيئة على النسخة التجريبية: المشرف لا يراها، والمدير يمر بالمعاينة والتأكيدين
import re
from playwright.sync_api import sync_playwright

URL = 'file:///tmp/claude-0/work/app/out/demo_full.html'
SHOTS = '/tmp/claude-0/work/app/shots6'
res = []

def check(c, m, extra=''):
    res.append(bool(c))
    print(('PASS ' if c else 'FAIL ') + m + ((' ' + str(extra)) if extra and not c else ''))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ar-EG', timezone_id='Africa/Cairo', is_mobile=True, has_touch=True)
    ctx.route(re.compile(r'https://(cdnjs\.cloudflare\.com|tile\.openstreetmap\.org|fonts\.(googleapis|gstatic)\.com)/.*'), lambda r: r.abort())
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(600)

    # ---- المشرف: لا يرى بطاقة إعادة التهيئة
    pg.click('[data-act="quickstaff"][data-p="01000000003"]'); pg.wait_for_timeout(900)
    pg.click('nav.tabs button[data-id="dash"]'); pg.wait_for_timeout(700)
    if pg.locator('[data-act="team_open"]').count():
        pg.click('[data-act="team_open"]'); pg.wait_for_timeout(900)
        check('إعادة التهيئة من البداية' not in pg.inner_text('#app') if pg.locator('#app').count() else True, 'supervisor does not see the reset card')
    else:
        check(True, 'supervisor has no team entry at all')
    pg.evaluate("APP.logout(true)"); pg.wait_for_timeout(300)

    # ---- المدير: معاينة ثم تأكيد خاطئ ثم صحيح
    pg.click('[data-act="quickstaff"][data-p="01000000004"]'); pg.wait_for_timeout(900)
    pg.click('nav.tabs button[data-id="dash"]'); pg.wait_for_timeout(700)
    pg.click('[data-act="team_open"]'); pg.wait_for_timeout(900)
    check('إعادة التهيئة من البداية' in pg.inner_text('body'), 'manager sees the reset card')
    pg.screenshot(path=SHOTS + '/reset_card.png')
    pg.click('[data-act="reset_open"]'); pg.wait_for_selector('#rs_phrase', timeout=5000)
    body = pg.inner_text('.sheet')
    check('هيتمسح' in body and 'هيفضل' in body and 'التجار' in body, 'preview lists what is cleared and kept')
    pg.screenshot(path=SHOTS + '/reset_preview.png')
    pg.fill('#rs_phrase', 'اعمل تهيئة'); pg.fill('#rs_pin', '1234')
    pg.click('[data-act="reset_go"]'); pg.wait_for_timeout(700)
    check('اكتب العبارة بالضبط' in pg.inner_text('#rs_err'), 'wrong phrase is refused in the sheet')
    pg.fill('#rs_phrase', 'أعد التهيئة الكاملة'); pg.fill('#rs_pin', '9999')
    pg.click('[data-act="reset_go"]'); pg.wait_for_timeout(900)
    check('الرمز' in pg.inner_text('#rs_err') or 'محاولات' in pg.inner_text('#rs_err'), 'wrong PIN is refused in the sheet', pg.inner_text('#rs_err'))
    pg.fill('#rs_pin', '1234')
    pg.click('[data-act="reset_go"]'); pg.wait_for_timeout(1500)
    check(pg.locator('#l_phone').count() == 1, 'after reset the app returns to the login screen')
    pg.screenshot(path=SHOTS + '/reset_done.png')

    # ---- المدير يدخل من جديد ويجد النظام فارغًا إلا حسابه
    pg.click('[data-act="quickstaff"][data-p="01000000004"]'); pg.wait_for_timeout(900)
    pg.click('nav.tabs button[data-id="dash"]'); pg.wait_for_timeout(700)
    pg.click('[data-act="team_open"]'); pg.wait_for_timeout(900)
    check('موظف تجريبي ٣' not in pg.inner_text('body'), 'other staff are gone after reset')
    check('موظف تجريبي ٤' in pg.inner_text('body') or 'مدير' in pg.inner_text('body'), 'manager account kept after reset')

    print('errors:', errs)
    check(not errs, 'no page errors')
    b.close()

print('\nRESET UI PASS', sum(res), 'FAIL', len(res) - sum(res))

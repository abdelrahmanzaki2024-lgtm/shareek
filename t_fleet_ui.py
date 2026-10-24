# فحص الواجهة لأسطول التجار على النسخة التجريبية: المشرف يرى الخريطة والخطوط،
# المدير ينشئ خطًا ويشاركه، السائق يبدأ الرحلة ويرسل طوارئ، والمشرف يراها ويحلّها.
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
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ar-EG', timezone_id='Africa/Cairo',
                        is_mobile=True, has_touch=True, geolocation={'latitude': 30.0, 'longitude': 31.0}, permissions=['geolocation'])
    # الخرائط والخطوط الخارجية محجوبة في بيئة الاختبار؛ الواجهة يجب أن تعمل بدونها
    ctx.route(re.compile(r'https://(cdnjs\.cloudflare\.com|tile\.openstreetmap\.org|fonts\.(googleapis|gstatic)\.com)/.*'), lambda r: r.abort())
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_' not in m.text else None)
    pg.goto(URL)
    pg.wait_for_timeout(600)

    # ---- مساعد لا يرى الأسطول
    pg.click('[data-act="quickstaff"][data-p="01000000001"]'); pg.wait_for_timeout(900)
    check(pg.locator('nav.tabs button[data-id="fleet"]').count() == 0, 'assistant does not see the fleet tab')
    pg.evaluate("APP.logout(true)"); pg.wait_for_timeout(300)

    # ---- المشرف: يرى التبويب ولا يرى زر إنشاء الخط
    pg.click('[data-act="quickstaff"][data-p="01000000003"]'); pg.wait_for_timeout(900)
    check(pg.locator('nav.tabs button[data-id="fleet"]').count() == 1, 'supervisor sees the fleet tab')
    pg.click('nav.tabs button[data-id="fleet"]')
    pg.wait_for_selector('#fl-list', timeout=6000)
    pg.wait_for_timeout(400)
    check(pg.locator('[data-act="fl_new"]').count() == 0, 'supervisor cannot create routes')
    check('الخريطة مش متاحة' in pg.inner_text('#fmap') or 'الخريطة بتتحمل' in pg.inner_text('#fmap'), 'map shows an honest fallback when offline')
    pg.screenshot(path=SHOTS + '/sup_fleet.png')
    pg.evaluate("APP.logout(true)"); pg.wait_for_timeout(300)

    # ---- المدير: ينشئ الخط ويشاركه
    pg.click('[data-act="quickstaff"][data-p="01000000004"]'); pg.wait_for_timeout(900)
    pg.click('nav.tabs button[data-id="fleet"]')
    pg.wait_for_selector('#fl-list', timeout=6000)
    pg.wait_for_timeout(500)
    check(pg.locator('[data-act="fl_new"]').count() == 1, 'manager sees the new route button')
    pg.click('[data-act="fl_new"]'); pg.wait_for_selector('.sheet #fl_title', timeout=4000)
    pg.evaluate("""() => {
      APP.S.fl.draft = {id:'', title:'', traderId:'', corridorM:150, points:[
        {lat:30.0,lng:31.0,name:'البوابة'},{lat:30.0,lng:31.01,name:'المخزن'},{lat:30.01,lng:31.01,name:'المزرعة 5'}]};
      APP.closeSheet(); APP.flOpenDraft();
    }""")
    pg.wait_for_selector('.sheet #fl_title', timeout=4000)
    pg.fill('#fl_title', 'خط المزرعة 5')
    pg.select_option('#fl_trader', index=1)
    check(pg.locator('.sheet [data-pn]').count() == 3, 'route sheet lists the three stops in order')
    pg.screenshot(path=SHOTS + '/mgr_route_sheet.png')
    pg.click('.sheet [data-act="fl_save"]'); pg.wait_for_timeout(900)
    check('خط المزرعة 5' in pg.inner_text('#fl-list'), 'saved route appears in the list')
    pg.click('#fl-list [data-act="fl_share"]'); pg.wait_for_selector('.sheet a[href*="wa.me"]', timeout=4000)
    href = pg.get_attribute('.sheet a[href*="wa.me"]', 'href')
    check(href.startswith('https://wa.me/20'), 'share opens a WhatsApp link to the trader', href[:30])
    msg = pg.input_value('.sheet textarea')
    m = re.search(r'r=([0-9a-f]{32})', msg)
    check(m is not None, 'WhatsApp message carries the route link')
    token = m.group(1) if m else ''
    check('خط المزرعة 5' in msg and 'البوابة' in msg, 'message lists the route name and stops')
    pg.screenshot(path=SHOTS + '/mgr_share_sheet.png')
    pg.evaluate("APP.closeSheet()")

    # ---- السائق بالرابط: يبدأ الرحلة، ويرسل طوارئ بضغطة
    pg.evaluate("t => APP.startRoute(t)", token); pg.wait_for_timeout(500)
    pg.wait_for_selector('[data-act="rt_start"]', timeout=5000)
    check('ابدأ الرحلة' in pg.inner_text('.rt-main'), 'driver sees the start button on a planned route')
    check('محمود السيد' not in pg.inner_text('.rt-main'), 'driver page never shows the trader name')
    pg.screenshot(path=SHOTS + '/driver_planned.png')
    pg.click('[data-act="rt_start"]')
    pg.wait_for_selector('[data-act="rt_consent_ok"]', timeout=5000)
    check('الموافقة' in pg.inner_text('.sheet') or 'وافق' in pg.inner_text('.sheet'), 'driver sees the tracking consent sheet before the first trip')
    pg.click('[data-act="rt_consent_ok"]')
    pg.wait_for_selector('.rt-status .chip', timeout=25000)
    check('الرحلة شغالة' in pg.inner_text('.rt-main'), 'trip starts and shows as running')
    pg.wait_for_timeout(800)
    check('الموقع اتبعت' in pg.inner_text('#rt-gps') or 'بيتبع' in pg.inner_text('#rt-gps'), 'GPS line reports location is being sent')
    pg.screenshot(path=SHOTS + '/driver_running.png')
    pg.click('[data-act="rt_sos_open"]'); pg.wait_for_selector('.sheet [data-act="rt_reason"]', timeout=4000)
    check(pg.locator('.sheet [data-act="rt_reason"]').count() == 5, 'emergency sheet offers the five reasons')
    pg.click('.sheet [data-act="rt_reason"][data-r="حادثة"]')
    pg.click('.sheet [data-act="rt_sos_go"]')
    pg.wait_for_selector('.rt-alarm', timeout=5000)
    check('طوارئ مُرسلة' in pg.inner_text('.rt-main'), 'emergency sent: driver sees confirmation')
    pg.screenshot(path=SHOTS + '/driver_sos.png')

    # ---- المشرف يرى الطوارئ ويحلّها
    pg.evaluate("APP.logout(true)"); pg.wait_for_timeout(300)
    pg.click('[data-act="quickstaff"][data-p="01000000003"]'); pg.wait_for_timeout(900)
    pg.click('nav.tabs button[data-id="fleet"]')
    pg.wait_for_selector('#fl-sos .fl-sos', timeout=8000)
    check('طوارئ:' in pg.inner_text('#fl-sos'), 'supervisor sees the emergency banner with the route')
    pg.screenshot(path=SHOTS + '/sup_sos.png')
    pg.click('#fl-sos [data-act="fl_resolve"]'); pg.wait_for_selector('.sheet #fl_note', timeout=4000)
    pg.fill('#fl_note', 'وصلنا للسائق واطمأننا')
    pg.click('.sheet [data-act="fl_resolve_go"]'); pg.wait_for_timeout(900)
    check('طوارئ:' not in pg.inner_text('#fl-sos') or pg.locator('#fl-sos .fl-sos').count() == 0, 'resolved emergency leaves the banner')
    pg.screenshot(path=SHOTS + '/sup_resolved.png')

    print('errors:', errs)
    check(not errs, 'no page errors')
    b.close()

print('\nFLEET UI PASS', sum(res), 'FAIL', len(res) - sum(res))

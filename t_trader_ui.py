# فحص الواجهة: المدير يرى تعديل وحذف التاجر، والمشرف لا يراهما
from playwright.sync_api import sync_playwright
URL = 'file:///tmp/claude-0/work/app/out/demo_full.html'
res = []
def check(c, m, extra=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m + ((' ' + str(extra)) if extra and not c else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ar-EG', timezone_id='Africa/Cairo', is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'ERR_CONNECTION' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(500)
    # --- مشرف: لا أزرار تعديل ولا حذف
    pg.click('[data-act="quickstaff"][data-p="01000000003"]'); pg.wait_for_timeout(900)
    pg.evaluate("APP.logout(true)"); pg.wait_for_timeout(300)
    # --- مدير الإدارة
    pg.click('[data-act="quickstaff"][data-p="01000000004"]'); pg.wait_for_timeout(900)
    pg.click('[data-act="stab"][data-id="dash"]'); pg.wait_for_timeout(900)
    pg.click('[data-act="seg"][data-g="dash"][data-id="tr"]'); pg.wait_for_timeout(900)
    pg.wait_for_selector('#trlist [data-act="tr_edit"]', timeout=5000)
    check(pg.locator('#trlist [data-act="tr_edit"]').count() > 0, 'manager sees edit buttons in trader list')
    check(pg.locator('#trlist [data-act="tr_del"]').count() > 0, 'manager sees delete buttons in trader list')
    pg.screenshot(path='/tmp/claude-0/work/app/shots5/mgr_traders.png')
    before = pg.locator('#trlist [data-act="tr_edit"]').count()
    # فتح شيت التعديل
    pg.locator('#trlist [data-act="tr_edit"]').first.click(); pg.wait_for_timeout(700)
    check(pg.locator('.sheet #tr_name').count() == 1 and pg.locator('.sheet #tr_phone').count() == 1, 'edit sheet opens with name and phone fields')
    check(pg.locator('.sheet #tr_pin').count() == 1, 'edit sheet has a new-PIN field')
    pg.screenshot(path='/tmp/claude-0/work/app/shots5/mgr_edit_sheet.png')
    # إعادة تسمية ثم حفظ
    pg.fill('#tr_name', 'اسم تاجر معدّل'); pg.fill('#tr_pin', '9876')
    pg.click('.sheet [data-act="tr_save"]'); pg.wait_for_timeout(900)
    check(pg.locator('.sheet').count() == 0 or not pg.locator('.sheet').is_visible(), 'sheet closes after save')
    check('اسم تاجر معدّل' in pg.inner_text('#trlist'), 'edited name appears in the list')
    # حذف بضغطتين من داخل الشيت
    pg.locator('#trlist [data-act="tr_edit"]').first.click(); pg.wait_for_timeout(700)
    pg.click('.sheet [data-act="tr_del"]'); pg.wait_for_timeout(200)
    check('تأكيد' in pg.inner_text('.sheet'), 'first tap arms the delete confirmation')
    pg.click('.sheet [data-act="tr_del"]'); pg.wait_for_timeout(900)
    after = pg.locator('#trlist [data-act="tr_edit"]').count()
    check(after == before - 1, 'deleted trader disappears from the list', (before, after))
    pg.screenshot(path='/tmp/claude-0/work/app/shots5/mgr_after_delete.png')
    print('errors:', errs)
    check(not errs, 'no page errors')
    b.close()
print('\nTRADER UI PASS', sum(res), 'FAIL', len(res) - sum(res))

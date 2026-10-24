# يحاكي إطار Apps Script حيث google.script.run يفشل: يجب أن تظهر رسالة واضحة توجّه للرابط الجديد، لا «مفيش إنترنت»
import re
from playwright.sync_api import sync_playwright
PAGE = 'http://127.0.0.1:8765/'
STUB = """
window.google = { script: { run: {
  withSuccessHandler: function () { return this; },
  withFailureHandler: function (f) { this._f = f; return this; },
  api: function () { var f = this._f; setTimeout(function () { f(new Error('denied')); }, 50); }
} } };
"""
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='ar-EG', timezone_id='Africa/Cairo', is_mobile=True, has_touch=True)
    ctx.route(re.compile(r'https://(cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com)/.*'), lambda r: r.abort())
    ctx.add_init_script(STUB)
    pg = ctx.new_page()
    pg.goto(PAGE); pg.wait_for_timeout(1500)
    pg.fill('#l_phone', '01100000001'); pg.fill('#l_pin', '1234')
    pg.click('[data-act="login"]'); pg.wait_for_timeout(800)
    err = pg.inner_text('#l_err')
    print('error text:', err)
    good = 'افتح رابط التطبيق الجديد' in err and 'مفيش إنترنت' not in err
    print('PASS' if good else 'FAIL', 'رسالة الإطار الداخلي توجّه للرابط الجديد')
    b.close()

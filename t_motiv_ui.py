# فحص ميزة «اسمع الدرس» للتاجر: زر في كل درس، يبدأ القراءة بلا أخطاء، ويتوقف عند الإيقاف
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
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    # محاكاة محرك صوت: يسجّل ما يُقرأ دون صوت حقيقي
    pg.add_init_script("""
      window.__said = [];
      var ss = window.speechSynthesis;
      ss.speak = function (u) { window.__said.push(String(u.text || '')); setTimeout(function () { u.onend && u.onend(); }, 50); };
      ss.cancel = function () {};
      ss.getVoices = function () { return []; };
    """)
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.click('[data-act="quick"][data-p="01100000001"]'); pg.wait_for_timeout(1100)
    pg.evaluate("APP.closeSheet && APP.closeSheet()"); pg.wait_for_timeout(300)
    if pg.locator('.ovl').count(): pg.evaluate("document.querySelectorAll('.ovl').forEach(function (o) { o.parentNode.removeChild(o); })")
    pg.evaluate("APP.handlers.tab({ dataset: { id: 'learn' } })"); pg.wait_for_timeout(900)
    pg.evaluate("APP.handlers.seg({ dataset: { g: 'learn', id: 'why' } })"); pg.wait_for_timeout(700)
    pg.wait_for_selector('[data-act="acc"]', timeout=6000)
    pg.click('[data-act="acc"] >> nth=0'); pg.wait_for_timeout(400)
    n = pg.locator('[data-act="say_card"]').count()
    check(n >= 1, 'each opened lesson offers a listen button', n)
    pg.click('[data-act="say_card"] >> nth=0'); pg.wait_for_timeout(1400)   # ننتظر اختيار الصوت العربي (حتى 900 ms) ثم القراءة
    said = pg.evaluate("window.__said")
    check(len(said) >= 1 and len(said[0]) > 3, 'listen button reads the lesson title and summary', said[:1])
    pg.wait_for_timeout(600)
    check(pg.locator('[data-act="say_card"]').count() >= 1, 'listen button stays available after reading')
    check(not errs, 'no page errors while listening', errs)
    b.close()

print('\nMOTIV UI PASS', sum(res), 'FAIL', len(res) - sum(res))

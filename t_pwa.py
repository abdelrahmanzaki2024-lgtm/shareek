# اختبار المتصفح للنسخة المستضافة (GitHub Pages): تحميل، عامل الخدمة، زر التثبيت، تسجيل دخول فعلي، وضع بلا إنترنت
import json, os, shutil, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = '/tmp/claude-0/work/app'
API = 'https://script.google.com/macros/s/TEST/exec'
results = []

def check(cond, msg, extra=''):
    results.append(bool(cond))
    print(('PASS ' if cond else 'FAIL ') + msg + (' ' + str(extra) if extra and not cond else ''))

# نسخة اختبار من حزمة النشر مع رابط الخادم الوهمي
src, dst = ROOT + '/out/pwa', ROOT + '/out/pwa_test'
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(src, dst)
open(dst + '/config.js', 'w', encoding='utf-8').write("window.__API_URL = '%s';\n" % API)

srv = subprocess.Popen(['node', 't_pwa_server.js'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
line = srv.stdout.readline(); print('server:', line.strip())
web = subprocess.Popen(['python3', '-m', 'http.server', '8791', '-d', dst], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

calls = []
def api_route(route):
    body = route.request.post_data or ''
    calls.append(json.loads(body).get('action'))
    req = urllib.request.Request('http://localhost:8787/', data=body.encode('utf-8'), method='POST')
    out = urllib.request.urlopen(req).read().decode('utf-8')
    route.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8'}, body=out)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ar-EG', timezone_id='Africa/Cairo', is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'ERR_CONNECTION' not in m.text else None)
        pg.route(API, api_route)

        pg.goto('http://localhost:8791/index.html')
        pg.wait_for_timeout(1500)
        check(pg.locator('#app').inner_html().strip() != '', 'app renders on the installable page')
        check(not errs, 'no page or console errors on load', errs)

        name = pg.evaluate("async () => (await (await fetch('manifest.webmanifest')).json()).short_name")
        check(name == 'شريك الدفاع', 'manifest served and parsed', name)
        regs = 0
        for _ in range(20):
            regs = pg.evaluate("async () => (await navigator.serviceWorker.getRegistrations()).length")
            if regs: break
            pg.wait_for_timeout(300)
        check(regs >= 1, 'service worker registered', regs)

        pg.evaluate("""() => { const e = new Event('beforeinstallprompt', { cancelable: true });
            e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); }""")
        bar = pg.locator('[aria-label="تثبيت التطبيق"]')
        check(bar.count() == 1, 'install bar shows when the browser allows install')
        pg.screenshot(path=ROOT + '/shots4/pwa_install_bar.png')
        pg.get_by_role('button', name='تثبيت', exact=True).click()
        pg.wait_for_timeout(500)
        check(pg.locator('[aria-label="تثبيت التطبيق"]').count() == 0, 'install bar closes after the user accepts')

        pg.locator('#l_phone').fill('01299990001')
        pg.locator('#l_pin').fill('2468')
        pg.locator('[data-act="login"]').first.click()
        pg.wait_for_timeout(1500)
        tok = pg.evaluate("() => { try { return localStorage.getItem('c3a_tok') || ''; } catch (e) { return ''; } }")
        check(bool(tok) and 'login' in calls, 'trader login goes through the POST transport and stores the token', calls)
        pg.screenshot(path=ROOT + '/shots4/pwa_home.png')

        ctx.set_offline(True)
        pg.reload()
        pg.wait_for_timeout(1200)
        check(pg.locator('#app').inner_html().strip() != '', 'installed app shell still opens offline', errs[-2:])
        ctx.set_offline(False)
        b.close()
finally:
    web.terminate(); srv.terminate()

print('\nPWA PASS', sum(results), 'FAIL', len(results) - sum(results))

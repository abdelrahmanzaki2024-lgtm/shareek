#!/usr/bin/env python3
# يجمّع الواجهة والصور والمنطق في: نسخة العرض (مستند + قطعة للـ Artifact) وملفات Google Apps Script
import base64, json, os, subprocess, re, sys
ROOT = '/tmp/claude-0/work/app'
A = '/tmp/claude-0/work/assets'
M = '/tmp/claude-0/work/media'
os.chdir(ROOT)
subprocess.check_call(['./build_core.sh'])

def rd(p): return open(p, encoding='utf-8').read()
def b64(p, mime): return 'data:%s;base64,%s' % (mime, base64.b64encode(open(p, 'rb').read()).decode())

try:
    from PIL import Image
    import io
except Exception:
    Image = None

def b64img(p, mime):
    # تصغير الصور لتخفيف ملف الواجهة (يُلصق يدويًا في محرر Apps Script)
    if Image is None: return b64(p, mime)
    im = Image.open(p)
    if im.size[0] > 600: im = im.resize((600, round(im.size[1] * 600 / im.size[0])), Image.LANCZOS)
    buf = io.BytesIO()
    if mime == 'image/jpeg': im.convert('RGB').save(buf, 'JPEG', quality=74, optimize=True)
    else: im.save(buf, 'PNG', optimize=True)
    return 'data:%s;base64,%s' % (mime, base64.b64encode(buf.getvalue()).decode())

def imgjs(d, n=900):
    # كائن JavaScript بأسطر قصيرة (محرر Apps Script يبطؤ مع الأسطر الطويلة جدًا)
    parts = []
    for k, v in d.items():
        chunks = [v[i:i + n] for i in range(0, len(v), n)]
        parts.append(json.dumps(k) + ':' + '+\n'.join(json.dumps(c) for c in chunks))
    return '{\n' + ',\n'.join(parts) + '\n}'

IMGS = {
  'wordmark_dark': 'wordmark_dark.png', 'wordmark_light': 'wordmark_light.png', 'logo_company': 'logo_company.png', 'logo_company_dark': 'logo_company_dark.png',
  'icon1': 'icon1.png', 'icon2': 'icon2.png', 'icon3': 'icon3.png', 'icon4': 'icon4.png',
  'cv_shoe': 'cv_shoe.jpg', 'cv_wash': 'cv_wash.jpg', 'cv_spot': 'cv_spot.jpg', 'cv_tf': 'cv_tf.jpg', 'cv_defend': 'cv_defend.jpg', 'cv_clip': 'cv_clip.jpg', 'cv_gate': 'cv_gate.jpg',
  'ph_vehwash1': 'ph_vehwash1.jpg', 'ph_chickcrates': 'ph_chickcrates.jpg', 'ph_feedtruck': 'ph_feedtruck.jpg', 'ph_mudboots': 'ph_mudboots.jpg', 'ph_ppe': 'ph_ppe.jpg', 'ph_houses_ext': 'ph_houses_ext.jpg',
}
img = {k: b64img(os.path.join(A, v), 'image/png' if v.endswith('png') else 'image/jpeg') for k, v in IMGS.items()}
static = subprocess.check_output(['node', 'gen_static.js']).decode()
static = json.dumps(json.loads(static), indent=0, ensure_ascii=False)
css = rd('client/style.css')
FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">'
TITLE = 'شريك الدفاع | كايرو ثري ايه'

def js(files): return '\n'.join(rd('client/' + f) for f in files)
CLIENT = ['10_base.js', '11_secure.js', '20_shell.js', '30_trader.js', '40_play.js', '45_market.js', '46_welcome.js', '47_extras.js', '50_talk.js', '60_staff.js', '48_fleet.js', '44_picture.js', '49_voice.js', '62_ops.js', '63_push.js']

def page(core_js, extra_js, media, fragment):
    body = ('<style>' + css + '</style><div id="app"></div><div id="toast"></div>'
        '<script>window.__STATIC=' + static + ';\nwindow.__IMG=' + imgjs(img) + ';</script>')
    if media: body += '<script>window.__MEDIA=' + json.dumps(media) + ';</script>'
    body += '<script>' + core_js + '</script><script>' + js(CLIENT) + '</script>'
    if extra_js: body += '<script>' + extra_js + '</script>'
    body += '<script>APP.boot();</script>'
    if fragment: return FONT + body
    return ('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<meta name="theme-color" content="#242424"><title>' + TITLE + '</title>' + FONT + '</head><body>' + body + '</body></html>')

# ---- نسخة العرض: المنطق كاملًا (بما فيه مفاتيح الألعاب) + بيانات وهمية + فيديوهات مضمّنة ----
media = {'launch': b64(M + '/launch_360.mp4', 'video/mp4'), 'virus': b64(M + '/virus_360.mp4', 'video/mp4')}
core_full = rd('dist/core_nogas.js')
os.makedirs('out/gas', exist_ok=True)
open('out/demo_full.html', 'w', encoding='utf-8').write(page(core_full, rd('client/90_demo.js'), media, False))
open('out/demo_fragment.html', 'w', encoding='utf-8').write(page(core_full, rd('client/90_demo.js'), media, True))

# ---- النسخة الحقيقية: العميل لا يحوي مفاتيح الإجابات ولا منطق الخادم ----
core_client = rd('src/01_base.js') + '\n' + rd('src/05_extras.js')
open('out/gas/Index.html', 'w', encoding='utf-8').write(page(core_client, '', None, False))
open('out/gas/Code.gs', 'w', encoding='utf-8').write(rd('dist/core_gas.js'))
open('out/gas/appsscript.json', 'w', encoding='utf-8').write(json.dumps({
  'timeZone': 'Africa/Cairo', 'exceptionLogging': 'STACKDRIVER', 'runtimeVersion': 'V8',
  'webapp': {'executeAs': 'USER_DEPLOYING', 'access': 'ANYONE_ANONYMOUS'},
  'oauthScopes': ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/script.scriptapp', 'https://www.googleapis.com/auth/script.send_mail', 'https://www.googleapis.com/auth/script.external_request']
}, indent=2))
# ---- النسخة المستضافة (GitHub Pages): تُثبَّت كتطبيق على الموبايل واللابتوب ----
import hashlib, shutil
PWA = 'out/pwa'
os.makedirs(PWA + '/icons', exist_ok=True)
PWA_HEAD = ('<link rel="manifest" href="manifest.webmanifest">'
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">'
  '<link rel="apple-touch-icon" href="icons/icon-192.png">'
  '<meta name="apple-mobile-web-app-capable" content="yes">'
  '<meta name="apple-mobile-web-app-title" content="شريك الدفاع">'
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
  '<script src="config.js"></script>'
  "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});}</script>")
pwa_html = page(core_client, rd('pwa/install.js'), None, False).replace('</head>', PWA_HEAD + '</head>', 1)
open(PWA + '/index.html', 'w', encoding='utf-8').write(pwa_html)
build_id = hashlib.md5(pwa_html.encode('utf-8')).hexdigest()[:8]
open(PWA + '/sw.js', 'w', encoding='utf-8').write(rd('pwa/sw.js').replace('__BUILD__', build_id))
shutil.copy('pwa/manifest.webmanifest', PWA + '/manifest.webmanifest')
shutil.copy('pwa/config.js', PWA + '/config.js')
shutil.copy('pwa/firebase-messaging-sw.js', PWA + '/firebase-messaging-sw.js')
from PIL import Image as _I
logo = _I.open(A + '/logo_company.png').convert('RGBA')
def icon(size, fill):
    base = _I.new('RGBA', (size, size), (255, 255, 255, 255))
    w = round(size * fill); h = round(logo.size[1] * w / logo.size[0])
    base.alpha_composite(logo.resize((w, h), _I.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return base.convert('RGB')
icon(192, 0.72).save(PWA + '/icons/icon-192.png', optimize=True)
icon(512, 0.72).save(PWA + '/icons/icon-512.png', optimize=True)
icon(512, 0.5).save(PWA + '/icons/icon-maskable-512.png', optimize=True)

for f in ['out/demo_full.html', 'out/demo_fragment.html', 'out/gas/Index.html', 'out/gas/Code.gs', 'out/pwa/index.html', 'out/pwa/sw.js']:
    print(f, os.path.getsize(f) // 1024, 'KB')

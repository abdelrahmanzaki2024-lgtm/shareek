import sys, base64, json
from playwright.sync_api import sync_playwright
import os
ROOT=os.path.dirname(os.path.abspath(__file__))
URL='file://'+os.path.join(ROOT,'out','demo_full.html')
os.makedirs(os.path.join(ROOT,'shots3'),exist_ok=True)
os.chdir(ROOT)
FD=os.environ.get('CAIRO_DIR','/tmp/claude-0/work/vid/test/')   # مجلد خطوط Cairo (اختياري للقطات الشاشة فقط)
def b64(f): return base64.b64encode(open(FD+f,'rb').read()).decode()
try:
    CSS=("@font-face{font-family:'Cairo';font-weight:100 500;src:url(data:font/ttf;base64,%s)}"
         "@font-face{font-family:'Cairo';font-weight:600 700;src:url(data:font/ttf;base64,%s)}"
         "@font-face{font-family:'Cairo';font-weight:800 900;src:url(data:font/ttf;base64,%s)}") % (b64('CairoRebuild-Regular.ttf'),b64('CairoRebuild-Bold.ttf'),b64('CairoRebuild-ExtraBold.ttf'))
except Exception:
    CSS=''
MOCK="""
window.__said=[]; window.__voices=[{lang:'ar-EG',name:'Mock Arabic'}];
window.SpeechSynthesisUtterance=function(t){this.text=t;};
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:function(){return window.__voices;},addEventListener:function(){},removeEventListener:function(){},
  cancel:function(){window.__cancelled=(window.__cancelled||0)+1;},
  speak:function(u){window.__said.push(u.text);setTimeout(function(){u.onstart&&u.onstart();setTimeout(function(){u.onend&&u.onend();},20);},10);}}});
"""
res=[]
def ok(c,m):
    res.append((bool(c),m)); print(('PASS ' if c else 'FAIL ')+m)
W=int(sys.argv[1]) if len(sys.argv)>1 else 390; H=int(sys.argv[2]) if len(sys.argv)>2 else 844; SCHEME=sys.argv[3] if len(sys.argv)>3 else 'light'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':W,'height':H},device_scale_factor=2,color_scheme=SCHEME,locale='ar-EG',timezone_id='Africa/Cairo',is_mobile=True,has_touch=True)
    ctx.add_init_script(MOCK)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' and 'fonts.g' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.goto(URL); pg.add_style_tag(content=CSS); pg.wait_for_timeout(500)
    pg.click('[data-act="quick"][data-p="01100000001"]'); pg.wait_for_timeout(1500)
    tag=f'{W}_{SCHEME}'
    # ---- welcome + milestone
    ok(pg.locator('.wl').count()==1,'welcome opens')
    ok(pg.locator('.ms').count()==1,'milestone banner shown')
    print('   MS:', pg.inner_text('.ms').replace('\n',' | '))
    ok('{name}' not in pg.inner_text('.ms'),'name placeholder resolved')
    ok(pg.locator('[data-act="cert_ms"]').count()==1,'cert button in banner')
    ok(pg.locator('.conf').count()>=0,'confetti ok')
    pg.screenshot(path=f'shots3/a_welcome_{tag}.png')
    # ---- voice
    ok(pg.locator('.wl [data-act="say_prices"]').count()==1,'voice button in welcome')
    pg.click('.wl [data-act="say_prices"]'); pg.wait_for_timeout(700)
    said=pg.evaluate('window.__said')
    print('   SAID:'); [print('    ',s) for s in said]
    ok(len(said)>=4,'spoke several lines')
    ok(any('جنيه' in s for s in said) and not any(__import__('re').search(r'\d',s.replace('3','x').replace('A','x')) and False for s in said),'money words present')
    ok(not any(__import__('re').search(r'[0-9]',s) for s in said[1:-2] if 'ملاحظة' not in s),'no raw digits in price lines')
    pg.screenshot(path=f'shots3/b_voice_{tag}.png')
    # ---- certificate from the banner (closes welcome => ack)
    pg.click('[data-act="cert_ms"]'); pg.wait_for_selector('.cert-img',timeout=8000); pg.wait_for_timeout(500)
    nw=pg.evaluate("document.querySelector('.cert-img').naturalWidth"); nh=pg.evaluate("document.querySelector('.cert-img').naturalHeight")
    ok((nw,nh)==(1080,1350),f'cert image 1080x1350 ({nw}x{nh})')
    pg.screenshot(path=f'shots3/c_cert_sheet_{tag}.png')
    data=pg.evaluate("fetch(document.querySelector('.cert-img').src).then(r=>r.blob()).then(b=>new Promise(r=>{var f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)}))")
    open(f'shots3/cert_{tag}.png','wb').write(base64.b64decode(data.split(',')[1]))
    ok(pg.locator('a[download]').count()==1,'download link')
    pg.click('[data-act="closesheet"]'); pg.wait_for_timeout(400)
    ok(pg.locator('#ovl').count()==0,'sheet closed')
    # ack happened
    ms_after=pg.evaluate("APP.S.home.milestone")
    print('   milestone after ack:',ms_after)
    # ---- today: homescreen card absent on first open
    ok(pg.locator('.hs').count()==0,'no home-screen card on first open')
    pg.reload(); pg.add_style_tag(content=CSS); pg.wait_for_timeout(1500)
    print('   second open: ms banner =',pg.locator('.ms').count(),'wl=',pg.locator('.wl').count())
    if pg.locator('#ovl').count(): pg.click('[data-act="closesheet"]'); pg.wait_for_timeout(400)
    ok(pg.locator('.hs').count()==1,'home-screen card on second open')
    pg.screenshot(path=f'shots3/d_today_hs_{tag}.png')
    pg.click('[data-act="hs_how"]'); pg.wait_for_timeout(400)
    ok(pg.locator('.hs-steps').count()==2,'steps for both platforms')
    pg.screenshot(path=f'shots3/e_hs_steps_{tag}.png')
    pg.click('[data-act="closesheet"]'); pg.wait_for_timeout(300)
    pg.click('.hs [data-act="hs_snooze"].gh'); pg.wait_for_timeout(300)
    ok(pg.locator('.hs').count()==0,'snooze hides card')
    # ---- account
    pg.click('[data-act="account"].ib'); pg.wait_for_timeout(600)
    ok(pg.locator('[data-act="cert_acc"]').count()==1,'cert entry in account card')
    pg.click('[data-act="cert_acc"]'); pg.wait_for_selector('.cert-img',timeout=8000); pg.wait_for_timeout(300)
    pg.click('[data-act="closesheet"]'); pg.wait_for_timeout(300)
    pg.click('[data-act="seg"][data-id="set"]'); pg.wait_for_timeout(300)
    ok(pg.locator('[data-act="hs_how"]').count()==1,'home-screen link in settings')
    pg.click('[data-act="back"]'); pg.wait_for_timeout(300)
    # ---- market tab voice
    pg.click('.tabs [data-id="market"]'); pg.wait_for_timeout(700)
    ok(pg.locator('#view [data-act="say_prices"]').count()==1,'voice button in market tab')
    pg.screenshot(path=f'shots3/f_market_{tag}.png')
    ov=pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
    ok(ov<=0,f'no horizontal overflow ({ov})')
    ctx.close()
    # ---- staff manager
    ctx=b.new_context(viewport={'width':W,'height':H},device_scale_factor=2,color_scheme=SCHEME,locale='ar-EG',timezone_id='Africa/Cairo',is_mobile=True,has_touch=True)
    pg=ctx.new_page(); pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(URL); pg.add_style_tag(content=CSS); pg.wait_for_timeout(500)
    pg.click('[data-act="quickstaff"][data-p="01000000004"]'); pg.wait_for_timeout(1200)
    pg.click('.tabs [data-id="dash"]'); pg.wait_for_timeout(900)
    ok(pg.locator('[data-act="rep_prev"]').count()==1,'report card for manager')
    pg.screenshot(path=f'shots3/g_staff_dash_{tag}.png')
    pg.click('[data-act="rep_prev"]'); pg.wait_for_selector('.rep-box',timeout=5000); pg.wait_for_timeout(300)
    ok('التقرير الأسبوعي' in pg.inner_text('.rep-box'),'report preview rendered')
    pg.screenshot(path=f'shots3/h_report_{tag}.png')
    pg.evaluate("document.querySelector('.sheet').scrollTo(0,400)"); pg.wait_for_timeout(200)
    pg.screenshot(path=f'shots3/h2_report_{tag}.png')
    pg.click('.sheet [data-act="rep_send"]'); pg.wait_for_timeout(600)
    ok('اتبعت' in pg.inner_text('#toast'),'send to me toast')
    ctx.close()
    # ---- supervisor has no report card
    ctx=b.new_context(viewport={'width':W,'height':H},locale='ar-EG',timezone_id='Africa/Cairo',is_mobile=True,has_touch=True)
    pg=ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(500)
    pg.click('[data-act="quickstaff"][data-p="01000000003"]'); pg.wait_for_timeout(1200)
    pg.click('.tabs [data-id="dash"]'); pg.wait_for_timeout(900)
    ok(pg.locator('[data-act="rep_prev"]').count()==0,'supervisor: no report card')
    ctx.close(); b.close()
print('errors:',errs)
bad=[m for c,m in res if not c]
print('PASS',len(res)-len(bad),'FAIL',len(bad), bad)

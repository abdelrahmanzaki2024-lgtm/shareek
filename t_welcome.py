import sys
from playwright.sync_api import sync_playwright
URL='file:///tmp/claude-0/work/app/out/demo_full.html'
W=int(sys.argv[1]); H=int(sys.argv[2]); SCHEME=sys.argv[3]
users=sys.argv[4].split(',') if len(sys.argv)>4 else ['01100000001']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox'])
    for u in users:
        ctx=b.new_context(viewport={'width':W,'height':H},device_scale_factor=2,color_scheme=SCHEME,locale='ar-EG',timezone_id='Africa/Cairo',is_mobile=True,has_touch=True)
        pg=ctx.new_page(); logs=[]
        pg.on('pageerror',lambda e: logs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(500)
        pg.click(f'[data-act="quick"][data-p="{u}"]'); pg.wait_for_timeout(1200)
        tag=f'{W}_{SCHEME}_{u[-2:]}'
        print(u, 'wl:', pg.locator('.wl').count(), '| TX:', pg.inner_text('.wl-tx'), '|', pg.inner_text('.wl-h')[:120].replace('\n',' | '), '| chips:', pg.inner_text('.wl-chips').replace('\n',' · '))
        pg.screenshot(path=f'shots2/w_{tag}_top.png')
        pg.evaluate("document.querySelector('.sheet').scrollTo(0,99999)"); pg.wait_for_timeout(300)
        pg.screenshot(path=f'shots2/w_{tag}_bot.png')
        ov=pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
        print('  overflowX', ov, 'errs', logs)
        ctx.close()
    b.close()

"""E2E en modo servidor: login, conteo con guardado automático, sin conexión → cola → sincroniza."""
import re, sys, json, urllib.request
from playwright.sync_api import sync_playwright, expect
URL, API, PWD = sys.argv[1], sys.argv[2], sys.argv[3]

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    expect(page.get_by_text('Sartu behar da')).to_be_visible()
    page.get_by_role('button', name='Pasahitza sartu').click()
    page.locator('#c-pwd').fill(PWD)
    page.get_by_role('button', name='Konexioa gorde').click()
    page.wait_for_load_state('networkidle')
    expect(page.locator('.sync')).to_have_text('Gordeta')
    page.locator('nav.nav').get_by_role('button', name='Inbentarioa').click()
    page.locator('#ev-name').fill('Zerbitzari proba')
    page.get_by_role('button', name='Zenbatzen hasi').click()
    page.get_by_role('button', name='+24', exact=True).first.click(); page.get_by_role('button', name='+1', exact=True).first.click()
    page.wait_for_timeout(1500)
    expect(page.locator('.sync')).to_have_text('Gordeta')
    # sin conexión
    ctx.set_offline(True)
    page.get_by_role('button', name='Hurrengoa').click()
    page.get_by_role('button', name='+24', exact=True).first.click(); page.get_by_role('button', name='+1', exact=True).first.click()
    expect(page.locator('.sync')).to_contain_text('Konexiorik gabe')
    page.screenshot(path='/tmp/claude-0/-home-claude/2ecc9880-f150-5fca-baa0-c660ed133701/scratchpad/shots/20-offline.png')
    # konexiorik gabe aldaketak gailuan gordetzen dira eta gero bidaltzen dira
    ctx.set_offline(False)
    page.wait_for_timeout(500)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    expect(page.locator('.sync')).to_have_text('Gordeta', timeout=20000)
    tok = json.loads(page.evaluate("localStorage.getItem('gz-connection-v1')"))['token']
    req = urllib.request.Request(API + '/inventory-sessions', headers={'Authorization': 'Bearer ' + tok})
    sessions = json.loads(urllib.request.urlopen(req).read())
    s = next(x for x in sessions if x['eventName'] == 'Zerbitzari proba')
    assert s['lines']['p-sm']['quantity'] == 25, s['lines']
    second = [pid for pid, l in s['lines'].items() if pid != 'p-sm']
    assert second and s['lines'][second[0]]['quantity'] == 25, s['lines']
    assert not errors, errors
    print('E2E API OK')
    b.close()

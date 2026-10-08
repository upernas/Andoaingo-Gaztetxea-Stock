"""Interfazearen E2E proba (mugikorra, 'gailu honetan' modua): 1. ekitaldia → sarrera → 2. ekitaldia → eskaera → mezua."""
import re, sys
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    expect(page.get_by_text('Inbentarioa egin')).to_be_visible()
    page.screenshot(path=f'{SHOTS}/01-home.png')
    nav = lambda name: page.locator('nav.nav').get_by_role('button', name=name).click()

    nav('Ezarpenak'); page.get_by_text('Stock helburuak').click()
    page.locator('#par-p-sm').fill('100'); page.locator('#min-p-sm').fill('40')
    page.locator('#par-p-coca').fill('48'); page.locator('#par-p-agua').fill('70')

    def goto_product(name):
        page.get_by_role('button', name='Produktuen zerrenda').click()
        page.locator('.sheet .item', has_text=name).first.click()
    def type_qty(v):
        page.get_by_role('button', name='Kopurua idatzi').click()
        inp = page.get_by_label('Kopurua'); inp.fill(str(v)); inp.press('Enter')
    def finish():
        page.get_by_role('button', name='Produktuen zerrenda').click()
        page.locator('.sheet').get_by_role('button', name='Inbentarioa amaitu').click()
        # "dena zenbatu behar da": ez dago aurreko datua mantentzeko aukerarik
        assert page.get_by_text('aurreko datua', exact=False).count() == 0
        page.get_by_role('button', name=re.compile('0 gisa zenbatu')).click()
        expect(page.get_by_text('Inbentarioa osatuta.', exact=False)).to_be_visible()

    # 1. EKITALDIA: mota pertsonalizatua
    nav('Inbentarioa')
    expect(page.locator('.seg').first).to_contain_text('Reggaeton')
    page.get_by_role('button', name='Beste bat').click()
    page.get_by_label('Ekitaldi mota').fill('Bertso saioa')
    page.get_by_role('button', name='Zenbatzen hasi').click()
    expect(page.locator('.pname')).to_have_text('San Miguel')
    for _ in range(3): page.get_by_role('button', name='+30', exact=True).first.click()
    for _ in range(10): page.get_by_role('button', name='+1', exact=True).first.click()
    expect(page.locator('.bignum')).to_have_text('100')
    expect(page.locator('.sub')).to_contain_text('ud. · 3×30 + 10')
    page.screenshot(path=f'{SHOTS}/02-count-sm.png')
    page.get_by_role('button', name='Hurrengoa').click()
    expect(page.locator('.pname')).to_have_text('San Miguel 0,0')
    goto_product('Coca-Cola'); type_qty(60)
    page.screenshot(path=f'{SHOTS}/03-count-coca.png')
    goto_product('Ura (Font Vella)'); type_qty(70)
    expect(page.get_by_role('button', name='+35', exact=True)).to_be_visible()
    goto_product('Barceló'); type_qty(4)
    expect(page.get_by_role('button', name='+6', exact=True)).to_be_visible()
    page.get_by_role('button', name='Botila irekia ½').click()
    page.screenshot(path=f'{SHOTS}/04-count-bottle.png')
    finish()
    expect(page.get_by_text('Zenbatutakoa', exact=True)).to_be_visible()

    # mota berria hurrengorako gordeta
    nav('Inbentarioa')
    expect(page.locator('.seg').first.get_by_role('button', name='Bertso saioa')).to_be_visible()
    expect(page.get_by_text('Azken zenbaketa', exact=False)).to_be_visible()
    page.screenshot(path=f'{SHOTS}/05-inventory-home.png', full_page=True)

    nav('Ezarpenak'); page.get_by_text('Sarrerak', exact=True).click()
    page.locator('#pu-prod').select_option('p-coca'); page.locator('#pu-box').fill('1')
    page.get_by_role('button', name='Erregistratu', exact=True).click()
    page.wait_for_timeout(200)

    # 2. EKITALDIA: Reggaeton
    nav('Inbentarioa')
    page.locator('.seg').first.get_by_role('button', name='Reggaeton').click()
    page.get_by_role('button', name='Zenbatzen hasi').click()
    type_qty(38)
    panel = page.locator('.panel', has_text='Botila hutsak')
    for _ in range(3): panel.get_by_role('button', name='+30').click()
    for _ in range(6): panel.get_by_role('button', name='−1').click()
    expect(panel.locator('b')).to_have_text('84')
    goto_product('Coca-Cola'); type_qty(12)
    goto_product('Ura (Font Vella)'); type_qty(70)
    goto_product('Barceló'); type_qty(2); page.get_by_role('button', name='Botila irekia ¼').click()
    finish()
    body = page.locator('.page').inner_text()
    page.screenshot(path=f'{SHOTS}/06-summary.png', full_page=True)
    assert 'Salmenta' not in body and 'Marjina' not in body
    for t in ['96,33 €', '7,56 €', '79,02 €', 'Zenbatutakoa']:
        assert t in body, f'{t} falta da:\n{body}'

    # ESKAERA: ekitaldi motaren iragarpena
    nav('Eskaera')
    expect(page.locator('.seg button.on')).to_have_text('Reggaeton')
    row = lambda pid: page.locator('.orow', has=page.locator(f'select:has(option[value="{pid}"]:checked)'))
    expect(row('p-sm').locator('.stepper .v')).to_contain_text('2pack')   # ⌈62×1,25⌉=78 → 40 → 2 pack (30)
    expect(row('p-coca').locator('.stepper .v')).to_contain_text('4pack') # ⌈72×1,25⌉=90 → 78 → 4 pack (24)
    expect(row('p-sm')).to_contain_text('iragarpena (1)')
    page.screenshot(path=f'{SHOTS}/07-order-reggaeton.png', full_page=True)
    page.get_by_role('button', name='Orokorra').click()
    expect(row('p-sm').locator('.stepper .v')).to_contain_text('3')
    expect(row('p-coca').locator('.stepper .v')).to_contain_text('2')
    row('p-sm').get_by_role('button', name='Gehiago').click()
    expect(row('p-sm').locator('.stepper .v')).to_contain_text('4')
    n = page.locator('.orow').count()
    page.get_by_role('button', name='Gehitu').click()
    expect(page.locator('.orow')).to_have_count(n + 1)
    page.locator('.orow').last.locator('select').select_option('p-jd')
    page.get_by_role('button', name='Gehitu').click()
    page.locator('.orow').last.get_by_role('button', name='Kendu').click()
    expect(page.locator('.orow')).to_have_count(n + 1)
    page.screenshot(path=f'{SHOTS}/08-order.png', full_page=True)

    page.locator('#o-date').fill('2026-10-09')
    page.get_by_role('button', name='Mezua sortu').click()
    msg = page.get_by_label('Mezua').inner_text()
    page.screenshot(path=f'{SHOTS}/09-message.png', full_page=True)
    for t in ['Kaixo!', '09/10/26 fetxarako hurrengoa behar dugu:', '- San Miguel: 4 pack', '- Coca-Cola: 2 pack', "- Jack Daniel's: 1 pack", 'Eskerrik asko!']:
        assert t in msg, f'«{t}» falta da:\n{msg}'
    page.get_by_role('button', name='Kopiatu').click()
    expect(page.locator('.toast')).to_contain_text('Kopiatuta')
    assert '- San Miguel: 4 pack' in page.evaluate('navigator.clipboard.readText()')
    # bidalita → Eskaera pantailan iristeko zain
    nav('Eskaera')
    expect(page.get_by_text('Bidalitako eskaera, iristeko')).to_be_visible()
    expect(page.locator('.card', has_text='Bidalitako eskaera')).to_contain_text('09/10/26 fetxarako')
    # HARRERA: inbentarioaren pantaila bera, eskatutako produktuekin
    page.get_by_role('button', name='Iritsi da: zenbatu').click()
    expect(page.locator('.meta')).to_contain_text('1 / 3')
    expect(page.locator('.count')).to_contain_text('Eskatua: 120 ud.')
    type_qty(120); page.get_by_role('button', name='Hurrengoa').click()
    type_qty(24); page.get_by_role('button', name='Hurrengoa').click()   # Coca-Cola: 48 eskatu, 24 iritsi
    page.screenshot(path=f'{SHOTS}/09b-reception-count.png')
    type_qty(6); page.get_by_role('button', name='Amaitu').click()
    page.locator('.sheet').get_by_role('button', name='Egiaztatu').click()
    expect(page.locator('.notice.bad')).to_contain_text('1 produktutan falta da')
    expect(page.locator('tr', has_text='Coca-Cola')).to_contain_text('falta 24')
    expect(page.locator('tr', has_text='San Miguel')).to_contain_text('ados')
    page.screenshot(path=f'{SHOTS}/09c-receipt.png', full_page=True)
    page.get_by_role('button', name='Onartu', exact=True).click()
    page.locator('.sheet').get_by_role('button', name='Stockera gehitu').click()
    expect(page.locator('.toast')).to_contain_text('Stockera gehituta')
    nav('Eskaera')
    expect(page.get_by_text('Bidalitako eskaera, iristeko')).to_have_count(0)
    nav('Ezarpenak'); page.get_by_text('Sarrerak', exact=True).click()
    expect(page.locator('.page')).to_contain_text('120 ×')

    # produktua gehitu / editatu / desaktibatu / ordenatu
    nav('Ezarpenak'); page.get_by_text('Produktuak').first.click()
    page.get_by_role('button', name='Produktua gehitu').click()
    page.locator('#p-name').fill('Fanta Laranja'); page.locator('#p-fmt').fill('Lata 33 cl'); page.locator('#p-iu').fill('lata')
    page.locator('#p-boxp').fill('15,60')
    page.get_by_role('button', name='Gorde', exact=True).click()
    page.get_by_role('button', name=re.compile('Fanta Laranja')).click()
    assert page.locator('#p-pp').input_value() == '0,65', page.locator('#p-pp').input_value()
    page.get_by_role('button', name='Produktua desaktibatu').click()
    page.locator('.sheet').get_by_role('button', name='Desaktibatu').click()
    expect(page.get_by_text('Desaktibatuak (2)')).to_be_visible()
    page.get_by_role('button', name='Ordenatu').click()
    page.get_by_role('button', name='Jaitsi').first.click()
    page.wait_for_timeout(200)
    assert page.locator('.sortable .item .t').first.inner_text() == 'San Miguel 0,0'

    # ezarpenetan ez dago kategoriarik ez hornitzailerik
    nav('Ezarpenak')
    menu = page.locator('.page').inner_text()
    assert 'Kategoria' not in menu and 'Hornitzaile' not in menu, menu
    nav('Estatistikak'); page.screenshot(path=f'{SHOTS}/10-stats.png', full_page=True)
    nav('Hasiera'); page.screenshot(path=f'{SHOTS}/11-home-after.png', full_page=True)
    html = page.content()
    assert not re.search('[\U0001F300-\U0001FAFF]', html), 'emojiak daude oraindik'

    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark', device_scale_factor=2)
    p2 = ctx2.new_page(); p2.goto(URL); p2.wait_for_timeout(800); p2.screenshot(path=f'{SHOTS}/12-dark.png')
    assert not errors, errors
    print('E2E OK')
    b.close()

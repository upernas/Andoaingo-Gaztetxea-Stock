"""Prueba de integración del backend (requiere API en marcha). Uso: python3 tests/api_test.py http://localhost:3000/api kaixo123"""
import json, sys, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000/api'
PWD = sys.argv[2] if len(sys.argv) > 2 else ''
TOKEN = None

def call(method, path, body=None, expect=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + TOKEN} if TOKEN else {})})
    try:
        with urllib.request.urlopen(req) as r:
            code, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        code, raw = e.code, e.read()
    if expect is not None:
        assert code == expect, f'{method} {path} → {code} (esperado {expect}): {raw[:300]}'
    try: return json.loads(raw) if raw else None
    except Exception: return raw.decode()

assert call('GET', '/bootstrap', expect=401 if PWD else 200) is not None
call('POST', '/login', {'password': 'mal'}, expect=401)
TOKEN = call('POST', '/login', {'password': PWD}, expect=200)['token'] if PWD else None

d = call('GET', '/bootstrap', expect=200)
assert len(d['products']) == 22 and len(d['purchases']) == 0 and len(d['returns']) == 0, (len(d['products']), len(d['purchases']))
sm = next(p for p in d['products'] if p['id'] == 'p-sm')
assert sm['unitsPerBox'] == 30 and sm['inventoryUnit'] == 'ud.' and sm['color'] == '#1d5236' and sm['purchasePrice'] == 0.4965 and sm['returnValue'] == 0.09 and 'salePrice' not in sm['unconfirmed']

# configurar objetivos y precios
for pid, patch in {'p-sm': {'parLevel': 100, 'minStock': 40, 'reorderPoint': 60, 'salePrice': 1.5},
                   'p-coca': {'parLevel': 48, 'reorderPoint': 24, 'salePrice': 2}, 'p-agua': {'parLevel': 70}, 'p-barcelo': {'parLevel': 6}}.items():
    p = next(x for x in d['products'] if x['id'] == pid); p.update(patch)
    call('PUT', f'/products/{pid}', p, expect=200)

L = lambda q, part=0, e=0: {'quantity': q, 'partialQuantity': part, 'emptyContainers': e, 'counted': True}
# EVENTO 1 (líneas guardadas una a una, como hace la app)
call('PUT', '/inventory-sessions/e1', {'id': 'e1', 'date': '2026-10-01T22:00:00.000Z', 'eventName': 'Evento 1', 'eventType': 'Concierto', 'attendees': 150,
     'createdBy': '', 'notes': '', 'status': 'open', 'closedAt': None, 'lines': {}}, expect=200)
for pid, l in {'p-sm': L(100), 'p-coca': L(60), 'p-agua': L(70), 'p-barcelo': L(4, .5), 'p-vino': L(2, 2.3)}.items():
    call('PUT', f'/inventory-sessions/e1/lines/{pid}', l, expect=204)
s1 = call('GET', '/inventory-sessions/e1', expect=200); s1['status'] = 'closed'; s1['closedAt'] = '2026-10-01T23:00:00.000Z'
call('PUT', '/inventory-sessions/e1', s1, expect=200)
call('POST', '/purchases', {'date': '2026-10-02T10:00:00.000Z', 'supplierId': 'sup-distribuidor', 'productId': 'p-coca', 'quantity': 24,
     'unitPrice': 0.53, 'total': 12.72, 'orderId': None, 'invoiceRef': 'test', 'notes': ''}, expect=201)
# EVENTO 2 (sesión completa de golpe)
call('PUT', '/inventory-sessions/e2', {'id': 'e2', 'date': '2026-10-04T23:30:00.000Z', 'eventName': 'Evento 2', 'eventType': 'Fiesta', 'attendees': None,
     'createdBy': 'Jon', 'notes': '', 'status': 'closed', 'closedAt': '2026-10-05T00:30:00.000Z',
     'lines': {'p-sm': L(38, 0, 84), 'p-coca': L(12), 'p-agua': L(70), 'p-barcelo': L(2, .25), 'p-vino': L(1, 1.3)}}, expect=200)

r = call('GET', '/reports/summary', expect=200)
le = r['lastEvent']
assert le['consumptionCost'] == 96.33 and le['estimatedSales'] == 237 and le['margin'] == 140.67, le
assert le['stockCost'] == 79.02 and le['empties'] == 84 and le['refundValue'] == 7.56, le
recs = {x['productId']: x for x in r['recommendations']}
assert recs['p-sm']['quantity'] == 3 and recs['p-sm']['status'] == 'urgente', recs['p-sm']
assert recs['p-coca']['quantity'] == 2 and recs['p-barcelo']['quantity'] == 1
assert call('GET', '/events', expect=404)  # /events no es colección REST; es una vista SQL

# pedido con líneas
order = {'id': 'o1', 'date': '2026-10-05T10:00:00.000Z', 'supplierId': None, 'status': 'enviado', 'title': 'Pedido test', 'notes': '',
         'basedOnSessionId': 'e2', 'eventType': 'Reggaeton', 'neededBy': '2026-10-09', 'estimatedCost': 100.8, 'message': 'Kaixo!', 'receivedAt': None,
         'lines': [{'productId': 'p-sm', 'supplierId': 'sup-distribuidor', 'quantity': 4, 'purchaseUnit': 'caja', 'unitsPerPurchaseUnit': 30,
                    'unitPrice': 14.895, 'recommended': 3, 'manual': False, 'note': ''},
                   {'productId': 'p-jd', 'supplierId': 'sup-distribuidor', 'quantity': 1, 'purchaseUnit': 'unidad', 'unitsPerPurchaseUnit': 1,
                    'unitPrice': 15.78, 'recommended': 0, 'manual': True, 'note': 'Para el concierto del sábado'}]}
call('PUT', '/orders/o1', order, expect=200)
o = call('GET', '/orders/o1', expect=200)
assert o['eventType'] == 'Reggaeton' and o['neededBy'] == '2026-10-09', o
# harrera saioa: ez da inbentario gisa zenbatzen
call('PUT', '/inventory-sessions/r1', {'id': 'r1', 'date': '2026-10-08T10:00:00.000Z', 'eventName': 'Harrera', 'eventType': 'Harrera', 'attendees': None,
     'createdBy': '', 'notes': '', 'status': 'closed', 'closedAt': None, 'kind': 'reception', 'orderId': 'o1', 'lines': {'p-sm': L(120)}}, expect=200)
assert call('GET', '/reports/summary', expect=200)['lastEvent']['id'] == 'e2'
assert call('GET', '/inventory-sessions/r1', expect=200)['kind'] == 'reception'
assert len(o['lines']) == 2 and o['lines'][1]['note'] == 'Para el concierto del sábado'

# reglas
call('DELETE', '/products/p-sm', expect=409)                       # no se borran productos
call('PUT', '/inventory-sessions/zz/lines/p-sm', L(1), expect=409)  # sesión inexistente → 4xx (la app no se bloquea)
call('PUT', '/products/x', {'id': 'x'}, expect=422)
csv = call('GET', '/export/produktuak.csv', expect=200)
assert 'San Miguel' in csv and ';' in csv
backup = call('GET', '/export.json', expect=200)
call('POST', '/import', backup, expect=200)
d2 = call('GET', '/bootstrap', expect=200)
assert json.dumps(d2, sort_keys=True) == json.dumps(backup, sort_keys=True), 'el backup no es idéntico tras restaurar'
print('API OK')

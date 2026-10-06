# Gaztetxe Stock · Andoain

Andoaingo Gaztetxeko edarien stocka, kontsumoa eta eskaerak kontrolatzeko web aplikazioa (PWA), mugikorrerako pentsatua.

**ZENBATU → ULERTU → ESKATU → WHATSAPP-ERA KOPIATU**

---

## 1. Arkitektura

```
┌───────────────────────────┐      ┌──────────────────────────┐      ┌──────────────┐
│ FRONTEND (PWA)            │ HTTP │ BACKEND (REST APIa)      │  SQL │ DATU-BASEA   │
│ React + TypeScript + Vite │─────▶│ Node + Express + tsx     │─────▶│ PostgreSQL 16│
│ datu-geruza aldagarria    │      │ /api/products, /orders…  │      │ schema.sql   │
│ konexiorik gabeko ilara   │      │ pasahitz bidezko sarbidea│      │              │
└─────────────┬─────────────┘      └────────────┬─────────────┘      └──────────────┘
              └──────── shared/ ────────────────┘
                 motak + negozio-logika (kontsumoa, stocka, iragarpena, eskaera, mezua)
```

- **`shared/`**: `types.ts` (eredua), `domain.ts` (kalkulu guztiak), `seed.ts` (hasierako produktuak). Frontendak eta backendak formula berak erabiltzen dituzte.
- **`frontend/src/data/`**: interfazeak ez daki datuak non dauden. `DataStore`-ren hiru inplementazio:
  | Modua | Non | Noiz |
  |---|---|---|
  | `LocalStore` | nabigatzaile honetan | proba, zerbitzaririk gabe |
  | `ApiStore` | backend propioa + PostgreSQL | **gaztetxeko makina birtualean**. Konexiorik gabe aldaketak mugikorrean gordetzen dira eta konexioa itzultzean bidaltzen dira |
  | `ArtifactStore` | Claude artifactaren datu-base partekatua | orain argitaratutako bertsioa |
- **`backend/`**: REST APIa, sarbidea, esportazioa, inportazioa, fakturen irakurketa IArekin (aukerakoa).
- **`db/schema.sql`**: taulak eta `events` ikuspegia.

## 2. Teknologiak

React 18 · TypeScript · Vite 5 · PWA (manifest + service worker) · Node 22 · Express 4 · PostgreSQL 16 · Docker Compose · nginx · Vitest + Playwright.

## 3. Lokalean exekutatu

```bash
npm install && npx vitest run                       # kalkuluen probak
cd frontend && npm install && npm run dev           # http://localhost:5173 (gailu honetan modua)
cd backend && npm install
DATABASE_URL=postgres://gaztetxe:gaztetxe@localhost:5432/gaztetxe APP_PASSWORD=kaixo npm run dev
```

Datu-basea hutsik badago, backendak taulak sortzen ditu eta hasierako produktuak kargatzen ditu (`SEED_ON_EMPTY=false` hori saihesteko).

## 4. Frontenda argitaratu

- **GitHub Pages**: `.github/workflows/pages.yml` (Settings → Pages → GitHub Actions). Backenda badago, `API_URL` aldagaia definitu.
- **Edozein hosting estatiko**: `cd frontend && npx vite build` → `frontend/dist/`.
- **Claude artifacta**: `npx vite build --mode artifact` → `frontend/dist-artifact/index.html`.

## 5. Backenda konfiguratu

| Aldagaia | Zertarako |
|---|---|
| `DATABASE_URL` | PostgreSQL konexioa |
| `APP_PASSWORD` | taldearen pasahitza |
| `ADMIN_PASSWORD` | aukerakoa: produktuak/ezarpenak aldatu, ezabatu eta kopiak berreskuratu |
| `TOKEN_SECRET` | saioen sinadura (`openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY` | aukerakoa: fakturen irakurketa automatikoa |
| `STATIC_DIR` | aukerakoa: backendak PWA ere zerbitzatzen du |

APIa: `GET /api/health`, `POST /api/login`, `GET /api/bootstrap`, `GET|POST|PUT /api/products`, `/api/inventory-sessions` (+ `/:id/lines/:productId`), `/api/orders`, `/api/purchases`, `/api/returns`, `GET|PUT /api/settings`, `GET /api/reports/summary`, `GET /api/export.json`, `GET /api/export/{produktuak|zenbaketak|…}.csv`, `POST /api/import`, `POST /api/invoices/extract`.

## 6. Docker makina birtualean

```bash
cp .env.example .env && nano .env      # pasahitzak
docker compose up -d --build           # http://VM-IP:8080
```

Zerbitzuak: `db`, `backend`, `frontend` (nginx), `backup` (eguneroko kopia `./backups`-en, 30 egun).

- **Sare lokaleko mugikorrak**: VMari IP finkoa (routerrean DHCP erreserba), sarea *bridge* moduan, 8080 portua irekita. Mugikorrean `http://IP:8080` → *Hasierako pantailan gehitu*. Instalazio osoa eta offline erabateko funtzionamendurako HTTPS behar da (Caddy edo Tailscale).
- **Kanpotik**: Tailscale (gomendatua, portuak ireki gabe) edo Cloudflare Tunnel. Ez ireki portuak routerrean.
- **Docker aukerak**: compose osoa, edukiontzi bakarra (`STATIC_DIR`), edo Caddy gehitu HTTPSrako.

## 7. Babeskopiak

- Automatikoa: `./backups/` (pg_dump egunero). Kopiatu VMtik kanpora.
- Aplikaziotik: Ezarpenak → Datuak → *Dena esportatu (JSON)*; *Babeskopia berreskuratu*.
- Berreskuratu: `gunzip -c backups/FITXATEGIA.sql.gz | docker compose exec -T db psql -U gaztetxe gaztetxe`.

## 8. Produktu berriak

Ezarpenak → Produktuak → **Produktua gehitu**: izena, formatua, **kolorea** (zenbatzean atzealdea), mota, nola zenbatu (unitateak / botilak irekiarekin / litroka), inbentario-unitatea, erosketa-unitatea, kaxako unitateak, erosketa-prezioa (edo kaxaren prezioa), salmenta-prezioa (aukerakoa), helburua, gutxienekoa, itzulgarria. *Ordenatu* botoiarekin biltegiko ordena aldatzen da. Ez dira ezabatzen: desaktibatzen dira.

## 9. Erabilera

1. Ekitaldiaren ondoren → *Inbentarioa egin* → ekitaldi mota (Reggaeton, Tekno, Kontzertua edo *Beste bat*, hurrengorako gordetzen dena).
2. Produktu bakoitza bere kolorearekin: zenbaki handia (ud.), packaren araberako botoiak (San Miguel ±30, latak ±24, botilak ±6, ura ±35), zenbakia sakatu idazteko, botila irekia ¼ ½ ¾, San Miguel-en botila hutsak. *Hurrengoa* edo hatza lerratu. Dena zenbatu behar da.
3. Amaitzean: stockaren balioa (erosketa-prezioan), kontsumoa eta kostua, ontziak, gomendioa eta **zenbaketa osoa** (Inbentarioa fitxan ere bai).
4. *Eskaera*: **Noizko behar dugu?** (data) eta hurrengo ekitaldiaren mota → iragarpena. Zerrenda trinkoa: − + pack kopurua, produktua aldatu, ✕ kendu, **Gehitu**.
5. *Mezua sortu* → «dd/mm/uu fetxarako hurrengoa behar dugu:» → *Kopiatu* edo WhatsApp. Kopiatzean eskaera **bidalita** geratzen da, iristeko zain.
6. Eskaera iristean: *Iritsi da: zenbatu* → inbentarioaren pantaila bera, eskatutako produktuekin → **egiaztapena** (eskatua / iritsia / falta dena; falta dena WhatsApp-erako kopia daiteke) → *Onartu* → iritsitakoa stockera.

Salmenta-prezioak ez dira kontrolatzen (ez dago ticketik, gonbidapenak eta nahasketak daude): balioak erosketa-prezioan bakarrik.

Pack-tamainak: San Miguel 20 cl eta 0,0 → 30 · San Miguel glutenik gabe → 24 · Coca-Cola, Kas, Schweppes latak → 24 · ron, gin, whisky, vodka, txupitoak → 6 · ura → 35 · ardoa → solteak.

### Kalkuluak

- `kontsumoa = aurreko inbentarioa + sarrerak − oraingo inbentarioa`
- `stocka = azken inbentarioa + ondorengo sarrerak`
- **Iragarpena**: hurrengo ekitaldiaren motako batez besteko kontsumoa × (1 + %25). Mota horretako daturik ez badago: helburua; hura ere ez badago: ekitaldi guztietako batez bestekoa.
- `eskaera = ⌈(helburua − stocka) / kaxako unitateak⌉` kaxa. Premiazkoa: stocka ≤ gutxienekoa edo 0.
- Salmenta estimatuak ≠ benetako salmentak (gonbidapenak, hausturak, akatsak…).

## 10. Probak

```bash
npx vitest run                                                       # 11 kalkulu-proba
python3 tests/api_test.py http://localhost:3000/api <pasahitza>      # backend + PostgreSQL
python3 tests/e2e_ui.py http://localhost:4173/                       # interfaz osoa mugikorrean
python3 tests/e2e_api.py http://localhost:4174/ http://localhost:3000/api <pasahitza>   # zerbitzaria + offline
```

## 11. Segurtasuna

Taldearen pasahitza eta aukerako administratzaile-pasahitza; HTTPS kanpotik sartzeko; datu-baseak ez du porturik irekitzen; `.env` ez da repoan gordetzen; babeskopiak VMtik kanpo.

## 12. Egoera

**Eginda**: euskarazko interfaze teknikoa, eskaeraren data, harreraren zenbaketa eta egiaztapena, produktuen koloreak, kaxa-tamainak (24/6/35), inbentario derrigorrezko osoa, zenbaketaren ikuspegia, kontsumoa, stockaren balioa, ontziak, ekitaldi motaren araberako iragarpena, eskaera trinkoa, WhatsApp mezua, sarrerak, fakturak IArekin (berrikuspenarekin), estatistikak, esportazioa, PWA, backend + PostgreSQL + Docker, probak.

**Etorkizunerako**: iragarpena jende kopuruaren arabera ere; zonaka zenbatzea pertsona batek baino gehiagok; barra-kodeen eskanerra; prezioen historia.

Prezioak 2026ko albaranetatik daude eta **berretsi gabe** markatuta (albaranak ez daude eguneratuta). Erosketen historia ez da kargatu.
#   A n d o a i n g o - G a z t e t x e a - S t o c k  
 
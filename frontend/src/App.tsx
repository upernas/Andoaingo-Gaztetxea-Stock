import type { ReactNode } from 'react';
import { AppProvider, TAB_OF, Tab, useApp } from './state';
import { Toast } from './ui/kit';
import { IconBox, IconCart, IconChart, IconGear, IconHome } from './ui/icons';
import { Home } from './screens/Home';
import { Count, InvDone, InventoryHome } from './screens/Inventory';
import { OrderMessage, OrderScreen, Targets } from './screens/Order';
import { Stats } from './screens/Stats';
import { ReceiptCheck } from './screens/Receipt';
import { MessageSettings, SettingsMenu } from './screens/SettingsMenu';
import { ProductEdit, ProductsList } from './screens/Products';
import { Purchases, Returns } from './screens/Records';
import { Invoices } from './screens/Invoices';
import { DataSettings } from './screens/DataSettings';

const TABS: [Tab, ReactNode, string][] = [
  ['home', <IconHome />, 'Hasiera'], ['inventory', <IconBox />, 'Inbentarioa'], ['order', <IconCart />, 'Eskaera'],
  ['stats', <IconChart />, 'Estatistikak'], ['settings', <IconGear />, 'Ezarpenak'],
];

function Screen() {
  const { route: r } = useApp();
  switch (r.name) {
    case 'home': return <Home />;
    case 'inventory': return <InventoryHome />;
    case 'count': return <Count key={r.sessionId} sessionId={r.sessionId} index={r.index} />;
    case 'invDone': return <InvDone sessionId={r.sessionId} />;
    case 'receiptCheck': return <ReceiptCheck sessionId={r.sessionId} />;
    case 'order': return <OrderScreen />;
    case 'orderMessage': return <OrderMessage orderId={r.orderId} />;
    case 'targets': return <Targets />;
    case 'stats': return <Stats />;
    case 'settings': return <SettingsMenu />;
    case 'products': return <ProductsList />;
    case 'productEdit': return <ProductEdit key={r.productId ?? 'new'} productId={r.productId} />;
    case 'messageSettings': return <MessageSettings />;
    case 'returns': return <Returns />;
    case 'purchases': return <Purchases />;
    case 'invoices': return <Invoices />;
    case 'dataSettings': return <DataSettings />;
  }
}

function Shell() {
  const { route, go } = useApp();
  const tab = TAB_OF[route.name];
  const counting = route.name === 'count';
  return (
    <div className={'app' + (counting ? ' no-nav' : '')}>
      <Screen />
      {!counting && (
        <nav className="nav" aria-label="Atalak">
          <div className="in">
            {TABS.map(([t, icon, label]) => (
              <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => go({ name: t } as any)}>
                {icon}{label}
              </button>
            ))}
          </div>
        </nav>
      )}
      <Toast />
    </div>
  );
}

export function App() {
  return (
    <AppProvider fallback={<div className="splash">Kargatzen…</div>}>
      <Shell />
    </AppProvider>
  );
}

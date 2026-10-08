import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TARGET } from './data';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// PWA: service worker solo en la versión web (en el artifact no está permitido)
if (TARGET === 'web' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// mantener la pantalla encendida mientras se cuenta (si el navegador lo permite)
document.addEventListener('visibilitychange', () => { if (!document.hidden) (navigator as any).wakeLock?.request?.('screen').catch(() => {}); });

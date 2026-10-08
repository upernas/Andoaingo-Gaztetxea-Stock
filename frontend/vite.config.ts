import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode "artifact": HTML bakarra (service workerrik gabe) Claude artifact gisa argitaratzeko.
// mode "pages": GitHub Pages (datuak mugikor bakoitzean gordetzen dira).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'artifact' ? [viteSingleFile()] : [])],
  define: { __TARGET__: JSON.stringify(mode === 'artifact' ? 'artifact' : 'web') },
  server: { fs: { allow: ['..'] }, proxy: { '/api': 'http://localhost:3000' } },
  build: {
    // mode "pages": GitHub Pages-erako, repoaren /docs karpetan (Settings → Pages → main /docs)
    outDir: mode === 'artifact' ? 'dist-artifact' : mode === 'pages' ? '../docs' : 'dist',
    emptyOutDir: mode !== 'pages', // docs/ karpetan beste fitxategi batzuk daude
    copyPublicDir: mode !== 'artifact',
  },
}));

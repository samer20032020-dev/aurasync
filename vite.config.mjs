import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' ws://localhost:5173 http://localhost:5173",
  "object-src 'none'"
].join('; ');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/ crossorigin(=("[^"]*"|'[^']*'|[^ >]+))?/g, '');
      }
    },
    {
      name: 'inject-csp',
      transformIndexHtml(html, ctx) {
        const isDev = ctx && ctx.server;
        const csp = (isDev ? DEV_CSP : PROD_CSP).replace(/"/g, '&quot;');
        const meta = `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n`;
        // Inject as early as possible so the policy is enforced before any resource loads
        if (html.includes('<meta charset="UTF-8" />')) {
          return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n${meta}`);
        }
        return html.replace('<head>', `<head>\n${meta}`);
      }
    }
  ],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

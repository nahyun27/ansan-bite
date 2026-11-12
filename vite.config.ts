/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { handlePlaces } from './api/places';
import { handlePreview } from './api/preview';

/** 로컬(dev/preview)에서도 /api/*가 동작하도록 Vercel 함수와 같은 핸들러를 연결 */
function localApi(): Plugin {
  let apiKey: string | undefined;
  const routes: Record<string, (req: Request) => Promise<Response>> = {
    '/api/places': (req) => handlePlaces(req, apiKey),
    '/api/preview': (req) => handlePreview(req),
  };
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL((req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/', 'http://localhost');
    const handler = routes[url.pathname];
    if (!handler) return next();
    const response = await handler(new Request(url));
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(await response.text());
  };
  return {
    name: 'ansan-bite-local-api',
    configResolved(config) {
      apiKey = loadEnv(config.mode, process.cwd(), '').KAKAO_REST_API_KEY;
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
      manifest: {
        name: 'Ansan Bite',
        short_name: 'Ansan Bite',
        description: '오늘은 어디서 먹지? 지금 상황에 맞는 안산 맛집 3곳을 골라드려요.',
        lang: 'ko',
        theme_color: '#f97316',
        background_color: '#fff7ed',
        display: 'standalone',
        start_url: '/',
        // 안드로이드: 설치한 앱이 지도 앱의 공유 메뉴에 나타남 → /?title=&text=&url= 로 열림
        share_target: {
          action: '/',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});

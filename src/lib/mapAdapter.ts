/**
 * 지도 그리는 부분만 갈아끼우기: 카카오 지도(키가 있을 때) / 무료 지도 Leaflet + OpenStreetMap
 * 핀·팝업 모양(HTML)과 동작은 둘이 같다.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Restaurant } from '../types';
import { isCafeCategory } from '../data/defaults';
import { ANSAN_CENTER } from './geocode';
import { naverMapSearchUrl, priceText } from './utils';
import type { KakaoNS, KMap, KOverlay } from './kakaoSdk';

export interface PinHandlers {
  onEdit: (r: Restaurant) => void;
  onMove: (r: Restaurant) => void;
}

export interface MapAdapter {
  setPins(rs: Restaurant[], h: PinHandlers): void;
  /** 모든 핀이 보이게 */
  fit(rs: Restaurant[]): void;
  /** 지도 빈 곳을 눌렀을 때 (직접 위치 지정용) */
  onClick(cb: (p: { x: number; y: number }) => void): void;
  closePopup(): void;
  relayout(): void;
  destroy(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function pinHtml(r: Restaurant): string {
  const cafe = isCafeCategory(r.category);
  const approx = r.coordsSource === 'approx';
  const label = r.stars ? `★${r.stars}` : esc(r.category.slice(0, 1));
  return `<div class="ab-pin ${cafe ? 'ab-pin-cafe' : ''} ${approx ? 'ab-pin-approx' : ''}"><span>${label}</span></div>`;
}

export function popupElement(r: Restaurant, h: PinHandlers, close: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ab-popup';
  el.innerHTML = `
    <b>${esc(r.name)}</b>${r.stars ? ` <span class="ab-star">★${r.stars}</span>` : ''}
    <div class="ab-meta">${esc([r.category, r.menus.slice(0, 2).join(', '), priceText(r)].filter(Boolean).join(' · '))}</div>
    ${r.coordsSource === 'approx' ? '<div class="ab-approx">대략적인 위치예요</div>' : ''}
    <div class="ab-actions">
      <a href="${esc(r.mapUrl || r.kakaoUrl || naverMapSearchUrl(r.name))}" target="_blank" rel="noreferrer">지도 앱</a>
      <button data-act="move">위치 고치기</button>
      <button data-act="edit">수정</button>
    </div>`;
  el.querySelector('[data-act="edit"]')!.addEventListener('click', () => h.onEdit(r));
  el.querySelector('[data-act="move"]')!.addEventListener('click', () => {
    close();
    h.onMove(r);
  });
  return el;
}

// ---- 무료 지도 (Leaflet + OpenStreetMap) ----
export function leafletAdapter(el: HTMLElement): MapAdapter {
  const m = L.map(el).setView([ANSAN_CENTER.y, ANSAN_CENTER.x], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(m);
  const layer = L.layerGroup().addTo(m);
  return {
    setPins(rs, h) {
      layer.clearLayers();
      for (const r of rs) {
        const icon = L.divIcon({ className: '', html: pinHtml(r), iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36] });
        L.marker([r.coords!.y, r.coords!.x], { icon, title: r.name })
          .bindPopup(popupElement(r, h, () => m.closePopup()))
          .addTo(layer);
      }
    },
    fit(rs) {
      if (rs.length) m.fitBounds(L.latLngBounds(rs.map((r) => [r.coords!.y, r.coords!.x])), { padding: [36, 36], maxZoom: 16 });
    },
    onClick(cb) {
      m.on('click', (e: L.LeafletMouseEvent) => cb({ x: e.latlng.lng, y: e.latlng.lat }));
    },
    closePopup: () => m.closePopup(),
    relayout: () => m.invalidateSize(),
    destroy: () => m.remove(),
  };
}

// ---- 카카오 지도 ----
export function kakaoAdapter(el: HTMLElement, kakao: KakaoNS): MapAdapter {
  const { maps } = kakao;
  const m: KMap = new maps.Map(el, { center: new maps.LatLng(ANSAN_CENTER.y, ANSAN_CENTER.x), level: 4 });
  try {
    (m as unknown as { addControl(c: unknown, p: unknown): void }).addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
  } catch {
    /* 확대 버튼은 없어도 됨 */
  }
  let pins: KOverlay[] = [];
  let popup: KOverlay | null = null;
  const closePopup = () => {
    popup?.setMap(null);
    popup = null;
  };
  return {
    setPins(rs, h) {
      closePopup();
      pins.forEach((p) => p.setMap(null));
      pins = rs.map((r) => {
        const pos = new maps.LatLng(r.coords!.y, r.coords!.x);
        const content = document.createElement('div');
        content.className = 'ab-pin-wrap';
        content.title = r.name;
        content.innerHTML = pinHtml(r);
        content.addEventListener('click', (e) => {
          e.stopPropagation();
          closePopup();
          popup = new maps.CustomOverlay({ position: pos, content: popupElement(r, h, closePopup), yAnchor: 1.32, zIndex: 10, clickable: true });
          popup.setMap(m);
        });
        const o = new maps.CustomOverlay({ position: pos, content, yAnchor: 1, clickable: true });
        o.setMap(m);
        return o;
      });
    },
    fit(rs) {
      if (rs.length === 1) {
        m.setCenter(new maps.LatLng(rs[0].coords!.y, rs[0].coords!.x));
        m.setLevel(4);
      } else if (rs.length > 1) {
        const b = new maps.LatLngBounds();
        rs.forEach((r) => b.extend(new maps.LatLng(r.coords!.y, r.coords!.x)));
        m.setBounds(b, 48, 36, 36, 36);
      }
    },
    onClick(cb) {
      maps.event.addListener(m, 'click', (e) => {
        closePopup();
        cb({ x: e.latLng.getLng(), y: e.latLng.getLat() });
      });
    },
    closePopup,
    relayout: () => m.relayout(),
    destroy() {
      closePopup();
      pins.forEach((p) => p.setMap(null));
      el.innerHTML = '';
    },
  };
}

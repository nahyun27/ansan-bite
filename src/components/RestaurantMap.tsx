import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Loader, MapPin, X } from 'lucide-react';
import type { Restaurant } from '../types';
import type { Actions } from '../lib/useAppData';
import { isCafeCategory } from '../data/defaults';
import { ANSAN_CENTER, geocodeRestaurant } from '../lib/geocode';
import { naverMapSearchUrl, priceText } from '../lib/utils';

interface Props {
  /** 필터가 적용된 식당 목록 */
  restaurants: Restaurant[];
  actions: Actions;
  onEdit: (r: Restaurant) => void;
  /** 지금 화면에 보이는지 (숨겨진 탭이면 위치 찾기를 멈춤) */
  active: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pinIcon(r: Restaurant) {
  const cafe = isCafeCategory(r.category);
  const approx = r.coordsSource === 'approx';
  const label = r.stars ? `★${r.stars}` : esc(r.category.slice(0, 1));
  return L.divIcon({
    className: '',
    html: `<div class="ab-pin ${cafe ? 'ab-pin-cafe' : ''} ${approx ? 'ab-pin-approx' : ''}"><span>${label}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
  });
}

export function RestaurantMap({ restaurants, actions, onEdit, active }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const [picking, setPicking] = useState<Restaurant | null>(null);
  const pickingRef = useRef<Restaurant | null>(null);
  pickingRef.current = picking;
  // actions·onEdit은 화면을 그릴 때마다 새로 만들어지므로 최신 값만 담아두고 지도는 한 번만 만든다
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const placed = useMemo(() => restaurants.filter((r) => r.coords), [restaurants]);
  const missing = useMemo(() => restaurants.filter((r) => !r.coords), [restaurants]);
  const approx = useMemo(() => restaurants.filter((r) => r.coords && r.coordsSource === 'approx'), [restaurants]);

  // 지도 만들기 (한 번)
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([ANSAN_CENTER.y, ANSAN_CENTER.x], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const r = pickingRef.current;
      if (!r) return;
      actionsRef.current.setLocation(r.id, { x: e.latlng.lng, y: e.latlng.lat }, 'manual');
      setPicking(null);
    });
    // 숨겨졌다 보이거나 크기가 바뀌면 다시 맞춤
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    map.current = m;
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // 핀 다시 그리기
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const r of placed) {
      const popup = document.createElement('div');
      popup.className = 'ab-popup';
      popup.innerHTML = `
        <b>${esc(r.name)}</b>${r.stars ? ` <span class="ab-star">★${r.stars}</span>` : ''}
        <div class="ab-meta">${esc([r.category, r.menus.slice(0, 2).join(', '), priceText(r)].filter(Boolean).join(' · '))}</div>
        ${r.coordsSource === 'approx' ? '<div class="ab-approx">대략적인 위치예요</div>' : ''}
        <div class="ab-actions">
          <a href="${esc(r.mapUrl || naverMapSearchUrl(r.name))}" target="_blank" rel="noreferrer">지도 앱</a>
          <button data-act="move">위치 고치기</button>
          <button data-act="edit">수정</button>
        </div>`;
      popup.querySelector('[data-act="edit"]')!.addEventListener('click', () => onEditRef.current(r));
      popup.querySelector('[data-act="move"]')!.addEventListener('click', () => {
        m.closePopup();
        setPicking(r);
      });
      L.marker([r.coords!.y, r.coords!.x], { icon: pinIcon(r), title: r.name }).bindPopup(popup).addTo(g);
    }
    // 처음 한 번은 모든 핀이 보이게
    if (!fitted.current && placed.length) {
      m.fitBounds(L.latLngBounds(placed.map((r) => [r.coords!.y, r.coords!.x])), { padding: [36, 36], maxZoom: 16 });
      fitted.current = true;
    }
  }, [placed]);

  // 위치 없는 식당은 주소로 자동 찾기 (1초에 1곳, 못 찾은 건 다시 안 찾음)
  // 최신 목록을 보면서 이번에 시도한 식당은 건너뛰어, 위치가 채워질 때마다 처음부터 다시 돌지 않게
  const latest = useRef(restaurants);
  latest.current = restaurants;
  const tried = useRef(new Set<string>());
  const pendingCount = restaurants.filter((r) => !r.coords && r.coordsSource !== 'none' && !tried.current.has(r.id)).length;
  useEffect(() => {
    if (!active || pendingCount === 0) return;
    let cancelled = false;
    (async () => {
      let done = 0;
      for (;;) {
        const next = latest.current.find((r) => !r.coords && r.coordsSource !== 'none' && !tried.current.has(r.id));
        if (!next || cancelled) break;
        const left = latest.current.filter((r) => !r.coords && r.coordsSource !== 'none' && !tried.current.has(r.id)).length;
        setProgress({ done, total: done + left });
        tried.current.add(next.id);
        try {
          const found = await geocodeRestaurant(next);
          actionsRef.current.setLocation(next.id, found?.coords, found ? found.source : 'none');
        } catch {
          tried.current.delete(next.id); // 네트워크 오류: 다음에 지도를 열 때 다시
          break;
        }
        done += 1;
      }
      setProgress(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, pendingCount > 0]);

  const fixList = [...missing, ...approx];

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-2xl shadow-sm ${picking ? 'ab-picking' : ''}`}>
        {/* Leaflet이 이 칸에 class를 붙이므로 React가 className을 바꾸지 않게 고정 */}
        <div ref={box} className="h-[58vh] min-h-80 w-full" />
        {picking && (
          <div className="absolute inset-x-3 top-3 z-[1000] flex items-center gap-2 rounded-xl bg-stone-900/90 px-3 py-2 text-sm text-white">
            <Crosshair className="size-4 shrink-0" />
            <span className="flex-1"><b>{picking.name}</b> 위치를 지도에서 눌러주세요</span>
            <button onClick={() => setPicking(null)} aria-label="위치 지정 취소" className="rounded-full p-1"><X className="size-4" /></button>
          </div>
        )}
        {progress && !picking && (
          <div className="absolute inset-x-3 bottom-3 z-[1000] flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs text-stone-600 shadow">
            <Loader className="size-3.5 animate-spin" /> 주소로 위치 찾는 중 {progress.done}/{progress.total}
          </div>
        )}
      </div>

      {fixList.length > 0 && (
        <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">위치 확인이 필요한 곳 <span className="font-normal text-stone-400">{fixList.length}</span></h3>
          <p className="text-xs text-stone-500">[위치 지정]을 누르고 지도에서 식당 자리를 콕 찍어주세요. 같이 쓰는 사람들에게도 저장돼요.</p>
          <ul className="divide-y divide-stone-100">
            {fixList.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                <MapPin className={`size-4 shrink-0 ${r.coords ? 'text-amber-500' : 'text-stone-300'}`} />
                <span className="min-w-0 flex-1 truncate">
                  {r.name}{' '}
                  <span className="text-xs text-stone-400">
                    {r.coords ? '대략 위치' : r.coordsSource === 'none' ? '못 찾음' : '찾는 중'}
                  </span>
                </span>
                <button
                  onClick={() => {
                    setPicking(r);
                    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="shrink-0 rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700"
                >
                  위치 지정
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

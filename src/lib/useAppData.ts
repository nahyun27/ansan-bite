import { useCallback, useEffect, useState } from 'react';
import type { AppData, AreaCenter, Restaurant } from '../types';
import { createInitialData } from '../data/defaults';
import { loadData, saveData } from './storage';
import { newId, toDateStr } from './utils';

export type Actions = ReturnType<typeof useAppData>['actions'];

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);

  useEffect(() => saveData(data), [data]);

  const addVisit = useCallback((restaurantId: string): string => {
    const id = newId();
    setData((d) => ({ ...d, visits: [...d.visits, { id, restaurantId, date: toDateStr() }] }));
    return id;
  }, []);

  /** 그날 별점 남기기 → 방문 기록에 남기고, 식당 별점도 이 값으로 */
  const rateVisit = useCallback((visitId: string, stars: number | undefined) => {
    setData((d) => {
      const visit = d.visits.find((v) => v.id === visitId);
      if (!visit) return d;
      return {
        ...d,
        visits: d.visits.map((v) => (v.id === visitId ? { ...v, stars, ratingSkipped: undefined } : v)),
        restaurants: stars
          ? d.restaurants.map((r) => (r.id === visit.restaurantId ? { ...r, stars } : r))
          : d.restaurants,
      };
    });
  }, []);

  const skipRating = useCallback((visitId: string) => {
    setData((d) => ({ ...d, visits: d.visits.map((v) => (v.id === visitId ? { ...v, ratingSkipped: true } : v)) }));
  }, []);

  const deleteVisit = useCallback((visitId: string) => {
    setData((d) => ({ ...d, visits: d.visits.filter((v) => v.id !== visitId) }));
  }, []);

  const saveRestaurant = useCallback((r: Restaurant) => {
    setData((d) => {
      const exists = d.restaurants.some((x) => x.id === r.id);
      return {
        ...d,
        areas: d.areas.includes(r.area) ? d.areas : [...d.areas, r.area],
        restaurants: exists ? d.restaurants.map((x) => (x.id === r.id ? r : x)) : [...d.restaurants, r],
      };
    });
  }, []);

  const addRestaurants = useCallback((list: Restaurant[]) => {
    setData((d) => ({
      ...d,
      areas: [...d.areas, ...[...new Set(list.map((r) => r.area))].filter((a) => !d.areas.includes(a))],
      restaurants: [...d.restaurants, ...list],
    }));
  }, []);

  const setAreaCenter = useCallback((area: string, center: AreaCenter) => {
    setData((d) => ({ ...d, areaCenters: { ...d.areaCenters, [area]: center } }));
  }, []);

  const deleteRestaurant = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      restaurants: d.restaurants.filter((x) => x.id !== id),
      visits: d.visits.filter((v) => v.restaurantId !== id),
    }));
  }, []);

  const addArea = useCallback((area: string) => {
    const a = area.trim();
    if (!a) return;
    setData((d) => (d.areas.includes(a) ? d : { ...d, areas: [...d.areas, a] }));
  }, []);

  const removeArea = useCallback((area: string) => {
    setData((d) =>
      d.restaurants.some((r) => r.area === area) ? d : { ...d, areas: d.areas.filter((a) => a !== area) },
    );
  }, []);

  const replaceData = useCallback((next: AppData) => setData(next), []);
  const resetAll = useCallback(() => setData(createInitialData()), []);

  return {
    data,
    actions: {
      addVisit, rateVisit, skipRating, deleteVisit,
      saveRestaurant, addRestaurants, deleteRestaurant,
      addArea, removeArea, setAreaCenter,
      replaceData, resetAll,
    },
  };
}

import type { DayData, LongTermPlan } from '../types';

const DAY_PREFIX = 'listo_day_';
const PLAN_PREFIX = 'listo_plan_';

export const saveDay = (day: DayData): void => {
  localStorage.setItem(DAY_PREFIX + day.id, JSON.stringify(day));
};

export const getDay = (dateStr: string): DayData | null => {
  const raw = localStorage.getItem(DAY_PREFIX + dateStr);
  return raw ? (JSON.parse(raw) as DayData) : null;
};

export const getHistory = (): DayData[] => {
  const days: DayData[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DAY_PREFIX)) {
      const raw = localStorage.getItem(key);
      if (raw) days.push(JSON.parse(raw) as DayData);
    }
  }
  return days.sort((a, b) => b.id.localeCompare(a.id));
};

export const savePlan = (plan: LongTermPlan): void => {
  localStorage.setItem(PLAN_PREFIX + plan.id, JSON.stringify(plan));
};

export const getPlan = (id: string): LongTermPlan | null => {
  const raw = localStorage.getItem(PLAN_PREFIX + id);
  return raw ? (JSON.parse(raw) as LongTermPlan) : null;
};

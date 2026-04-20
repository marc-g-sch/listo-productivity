import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc, collection, getDocs, query } from 'firebase/firestore';
import type { DayData, LongTermPlan } from '../types';

const isGuest = (userId: string) => userId === 'guest';

const getLocalDays = (): DayData[] => {
  try {
    const stored = localStorage.getItem('guest_days');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
};

const saveLocalDays = (days: DayData[]) => {
  localStorage.setItem('guest_days', JSON.stringify(days));
};

const getLocalPlans = (): LongTermPlan[] => {
  try {
    const stored = localStorage.getItem('guest_plans');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
};

const saveLocalPlans = (plans: LongTermPlan[]) => {
  localStorage.setItem('guest_plans', JSON.stringify(plans));
};

export const saveDayToCloud = async (userId: string, dayData: DayData) => {
  if (isGuest(userId)) {
    const days = getLocalDays();
    saveLocalDays([...days.filter(d => d.id !== dayData.id), dayData]);
    return;
  }
  try {
    await setDoc(doc(db, 'users', userId, 'days', dayData.id), dayData);
  } catch (e) {
    console.error('Error saving day:', e);
    throw e;
  }
};

export const getDayFromCloud = async (userId: string, dateId: string): Promise<DayData | null> => {
  if (isGuest(userId)) {
    return getLocalDays().find(d => d.id === dateId) || null;
  }
  try {
    const docSnap = await getDoc(doc(db, 'users', userId, 'days', dateId));
    return docSnap.exists() ? (docSnap.data() as DayData) : null;
  } catch {
    return null;
  }
};

export const getHistoryFromCloud = async (userId: string): Promise<DayData[]> => {
  if (isGuest(userId)) {
    return getLocalDays().sort((a, b) => b.id.localeCompare(a.id));
  }
  try {
    const q = query(collection(db, 'users', userId, 'days'));
    const snap = await getDocs(q);
    const days: DayData[] = [];
    snap.forEach(doc => days.push(doc.data() as DayData));
    return days.sort((a, b) => b.id.localeCompare(a.id));
  } catch {
    return [];
  }
};

export const savePlanToCloud = async (userId: string, plan: LongTermPlan) => {
  if (isGuest(userId)) {
    const plans = getLocalPlans();
    saveLocalPlans([...plans.filter(p => p.id !== plan.id), plan]);
    return;
  }
  try {
    await setDoc(doc(db, 'users', userId, 'plans', plan.id), plan);
  } catch (e) {
    console.error('Error saving plan:', e);
    throw e;
  }
};

export const getPlanFromCloud = async (userId: string, planId: string): Promise<LongTermPlan | null> => {
  if (isGuest(userId)) {
    return getLocalPlans().find(p => p.id === planId) || null;
  }
  try {
    const docSnap = await getDoc(doc(db, 'users', userId, 'plans', planId));
    return docSnap.exists() ? (docSnap.data() as LongTermPlan) : null;
  } catch {
    return null;
  }
};

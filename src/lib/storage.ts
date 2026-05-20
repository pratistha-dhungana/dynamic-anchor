import type { AppData, Profile } from '../types';

const DATA_KEY = 'dynamic-anchor:data';
const PROFILE_KEY = 'dynamic-anchor:profile';

export const defaultData: AppData = {
  routine: {
    wakeTime: '07:00',
    sleepTime: '23:00',
  },
  events: [],
  tasks: [],
};

export function loadLocalData(): AppData {
  const stored = localStorage.getItem(DATA_KEY);
  if (!stored) return defaultData;

  try {
    return { ...defaultData, ...JSON.parse(stored) } as AppData;
  } catch {
    return defaultData;
  }
}

export function saveLocalData(data: AppData) {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function loadLocalProfile(): Profile | null {
  const stored = localStorage.getItem(PROFILE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as Profile;
  } catch {
    return null;
  }
}

export function saveLocalProfile(profile: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

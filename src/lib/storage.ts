import type { AppData, Profile } from '../types';

const DATA_KEY = 'dynamic-anchor:data';
const PROFILE_KEY = 'dynamic-anchor:profile';

export const defaultData: AppData = {
  routine: {
    wakeTime: '07:00',
    sleepTime: '23:00',
    restMinutes: 15,
  },
  routineEvents: [],
  routineCompletions: {},
  events: [],
  tasks: [],
};

function normalizeData(data: Partial<AppData>): AppData {
  return {
    ...defaultData,
    ...data,
    routine: {
      ...defaultData.routine,
      ...data.routine,
    },
    routineEvents: data.routineEvents || [],
    routineCompletions: data.routineCompletions || {},
    events: data.events || [],
    tasks: data.tasks || [],
  };
}

export function loadLocalData(): AppData {
  const stored = localStorage.getItem(DATA_KEY);
  if (!stored) return defaultData;

  try {
    return normalizeData(JSON.parse(stored));
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

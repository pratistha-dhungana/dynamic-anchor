import type { AppData, Profile } from '../types';
import { supabase } from './supabase';

export async function loadCloudData(userId: string): Promise<AppData | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('app_data')
    .select('routine, events, tasks')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as AppData | null;
}

export async function saveCloudData(userId: string, appData: AppData) {
  if (!supabase) return;

  const { error } = await supabase.from('app_data').upsert({
    user_id: userId,
    routine: appData.routine,
    events: appData.events,
    tasks: appData.tasks,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, first_name, nickname_asked')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    nickname: data.nickname,
    firstName: data.first_name,
    nicknameAsked: data.nickname_asked,
  };
}

export async function saveProfile(profile: Profile) {
  if (!supabase) return;

  const { error } = await supabase.from('profiles').upsert({
    id: profile.id,
    nickname: profile.nickname,
    first_name: profile.firstName,
    nickname_asked: profile.nicknameAsked,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

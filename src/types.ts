export type ImportanceLevel = 'important' | 'not-important';
export type UrgencyLevel = 'urgent' | 'not-urgent';
export type TaskStatus = 'pending' | 'scheduled' | 'complete' | 'incomplete';

export type EisenhowerCategory =
  | 'Important + Urgent'
  | 'Important + Not Urgent'
  | 'Not Important + Urgent'
  | 'Not Important + Not Urgent';

export interface Routine {
  wakeTime: string;
  sleepTime: string;
}

export interface WeeklyEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  completed?: boolean;
  completedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  estimateMinutes: number;
  dueDate: string;
  dueTime?: string;
  importance: ImportanceLevel;
  urgency: UrgencyLevel;
  category: EisenhowerCategory;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface Profile {
  id: string;
  nickname?: string | null;
  firstName?: string | null;
  nicknameAsked?: boolean;
}

export interface AppData {
  routine: Routine;
  events: WeeklyEvent[];
  tasks: Task[];
}

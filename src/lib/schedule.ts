import {
  addDays,
  addMinutes,
  compareAsc,
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from 'date-fns';
import type { AppData, EisenhowerCategory, ImportanceLevel, Task, UrgencyLevel, WeeklyEvent } from '../types';

export function getCategory(
  importance: ImportanceLevel,
  urgency: UrgencyLevel,
): EisenhowerCategory {
  if (importance === 'important' && urgency === 'urgent') return 'Important + Urgent';
  if (importance === 'important') return 'Important + Not Urgent';
  if (urgency === 'urgent') return 'Not Important + Urgent';
  return 'Not Important + Not Urgent';
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function dateWithTime(date: Date, time: string) {
  const next = startOfDay(date);
  return addMinutes(next, minutesFromTime(time));
}

function eventBounds(event: WeeklyEvent) {
  const day = parseISO(`${event.date}T00:00:00`);
  return {
    start: dateWithTime(day, event.startTime),
    end: dateWithTime(day, event.endTime),
  };
}

function priorityScore(task: Task) {
  const matrixScore: Record<EisenhowerCategory, number> = {
    'Important + Urgent': 400,
    'Important + Not Urgent': 300,
    'Not Important + Urgent': 200,
    'Not Important + Not Urgent': 100,
  };
  const due = parseISO(`${task.dueDate}T${task.dueTime || '23:59'}:00`);
  const duePressure = Math.max(0, 90 - differenceInMinutes(due, new Date()) / 60);
  return matrixScore[task.category] + duePressure;
}

function overlaps(start: Date, end: Date, blockStart: Date, blockEnd: Date) {
  return isBefore(start, blockEnd) && isAfter(end, blockStart);
}

function laterDate(first: Date, second: Date) {
  return isAfter(first, second) ? first : second;
}

function findEarliestSlot({
  dayEnd,
  dayStart,
  due,
  estimateMinutes,
  scheduledBlocks,
}: {
  dayEnd: Date;
  dayStart: Date;
  due: Date;
  estimateMinutes: number;
  scheduledBlocks: Array<{ start: Date; end: Date }>;
}) {
  let cursor = dayStart;

  while (differenceInMinutes(dayEnd, cursor) >= estimateMinutes) {
    const proposedEnd = addMinutes(cursor, estimateMinutes);
    if (isAfter(proposedEnd, due)) break;

    const conflict = scheduledBlocks.find((block) => overlaps(cursor, proposedEnd, block.start, block.end));
    if (!conflict) return cursor;

    cursor = addMinutes(conflict.end, 10);
  }

  return null;
}

export function buildWeeklySchedule(data: AppData): Task[] {
  const now = new Date();
  const weekStart = startOfDay(now);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const scheduledBlocks = data.events.map(eventBounds);

  const candidates = data.tasks
    .filter((task) => task.status !== 'complete')
    .filter((task) => !task.scheduledStart || !isBefore(parseISO(task.scheduledStart), weekStart))
    .map((task) => ({
      ...task,
      status: task.status === 'incomplete' ? 'pending' : task.status,
      scheduledStart: undefined,
      scheduledEnd: undefined,
    }))
    .sort((a, b) => {
      const dueDelta = compareAsc(
        parseISO(`${a.dueDate}T${a.dueTime || '23:59'}:00`),
        parseISO(`${b.dueDate}T${b.dueTime || '23:59'}:00`),
      );
      if (dueDelta !== 0) return dueDelta;

      const priorityDelta = priorityScore(b) - priorityScore(a);
      if (priorityDelta !== 0) return priorityDelta;
      return compareAsc(parseISO(a.dueDate), parseISO(b.dueDate));
    });

  const placed = candidates.map((task) => {
    const due = parseISO(`${task.dueDate}T${task.dueTime || '23:59'}:00`);

    for (const day of weekDays) {
      if (isAfter(startOfDay(day), startOfDay(due))) break;

      const routineDayStart = dateWithTime(day, data.routine.wakeTime);
      const dayStart = isSameDay(day, now) ? laterDate(routineDayStart, now) : routineDayStart;
      const dayEnd = dateWithTime(day, data.routine.sleepTime);
      if (!isBefore(dayStart, dayEnd)) continue;

      const slot = findEarliestSlot({
        dayEnd,
        dayStart,
        due,
        estimateMinutes: task.estimateMinutes,
        scheduledBlocks,
      });

      if (slot) {
        const proposedEnd = addMinutes(slot, task.estimateMinutes);
        const bufferEnd = addMinutes(proposedEnd, 10);
        scheduledBlocks.push({ start: slot, end: bufferEnd });
        return {
          ...task,
          status: 'scheduled' as const,
          scheduledStart: slot.toISOString(),
          scheduledEnd: proposedEnd.toISOString(),
        };
      }
    }

    return { ...task, status: 'pending' as const };
  });

  return data.tasks.map((task) => {
    if (task.status === 'complete') return task;
    if (task.scheduledStart && isBefore(parseISO(task.scheduledStart), weekStart)) return task;
    return placed.find((candidate) => candidate.id === task.id) ?? task;
  });
}

export function formatDateTime(value?: string) {
  if (!value) return 'Unscheduled';
  return format(parseISO(value), 'EEE, MMM d • h:mm a');
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

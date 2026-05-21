import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutGrid,
  ListTodo,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { addDays, addHours, format, isAfter, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns';
import { loadCloudData, loadProfile, saveCloudData, saveProfile } from './lib/db';
import { buildWeeklySchedule, formatDateTime, formatDuration, getCategory } from './lib/schedule';
import { defaultData, loadLocalData, loadLocalProfile, saveLocalData, saveLocalProfile } from './lib/storage';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { AppData, EisenhowerCategory, ImportanceLevel, Profile, Task, UrgencyLevel, WeeklyEvent } from './types';

type TabId = 'schedule' | 'tasks' | 'routine' | 'matrix';
type ScheduleAlert =
  | { taskId: string; type: 'no-time' }
  | { taskId: string; type: 'high-priority' };
type DeleteConfirmation = { id: string; title: string; type: 'event' | 'task' };

const tabs: Array<{ id: TabId; label: string; icon: typeof CalendarDays }> = [
  { id: 'schedule', label: 'Today', icon: CalendarDays },
  { id: 'tasks', label: 'Add Tasks', icon: ListTodo },
  { id: 'routine', label: 'Routine', icon: Clock3 },
  { id: 'matrix', label: 'Matrix', icon: LayoutGrid },
];

const categories: EisenhowerCategory[] = [
  'Important + Urgent',
  'Important + Not Urgent',
  'Not Important + Urgent',
  'Not Important + Not Urgent',
];

const categoryHints: Record<EisenhowerCategory, string> = {
  'Important + Urgent': 'Do first. High consequence and time-sensitive.',
  'Important + Not Urgent': 'Schedule. Meaningful progress before it becomes urgent.',
  'Not Important + Urgent': 'Contain or delegate. Time-sensitive but lower impact.',
  'Not Important + Not Urgent': 'Reduce. Nice-to-have, low consequence work.',
};

const emptyTask = {
  title: '',
  description: '',
  estimateMinutes: 45,
  dueDate: new Date().toISOString().slice(0, 10),
  dueTime: '17:00',
  importance: 'important' as ImportanceLevel,
  urgency: 'urgent' as UrgencyLevel,
};

const emptyEvent = {
  title: '',
  date: new Date().toISOString().slice(0, 10),
  startTime: '09:00',
  endTime: '10:00',
  location: '',
};

function makeId() {
  return crypto.randomUUID();
}

function getFirstName(session: Session | null) {
  const metadata = session?.user.user_metadata;
  const name = metadata?.full_name || metadata?.name || session?.user.email?.split('@')[0] || 'there';
  return String(name).split(' ')[0];
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function dateWithTime(date: Date, time: string) {
  const next = startOfDay(date);
  next.setHours(0, 0, 0, 0);
  next.setMinutes(minutesFromTime(time));
  return next;
}

function rangesOverlap(start: Date, end: Date, blockStart: Date, blockEnd: Date) {
  return isBefore(start, blockEnd) && isAfter(end, blockStart);
}

function findScheduleConflict(data: AppData, start: Date, end: Date) {
  const eventConflict = data.events.find((event) => {
    const eventStart = dateWithTime(parseISO(`${event.date}T00:00:00`), event.startTime);
    const eventEnd = dateWithTime(parseISO(`${event.date}T00:00:00`), event.endTime);
    return rangesOverlap(start, end, eventStart, eventEnd);
  });

  if (eventConflict) {
    const eventStart = dateWithTime(parseISO(`${eventConflict.date}T00:00:00`), eventConflict.startTime);
    const eventEnd = dateWithTime(parseISO(`${eventConflict.date}T00:00:00`), eventConflict.endTime);
    return {
      title: eventConflict.title,
      range: `${format(eventStart, 'h:mm a')}-${format(eventEnd, 'h:mm a')}`,
    };
  }

  const taskConflict = data.tasks.find((task) => {
    if (!task.scheduledStart || !task.scheduledEnd || task.status === 'pending') return false;
    return rangesOverlap(start, end, parseISO(task.scheduledStart), parseISO(task.scheduledEnd));
  });

  if (taskConflict?.scheduledStart && taskConflict.scheduledEnd) {
    return {
      title: taskConflict.title,
      range: `${format(parseISO(taskConflict.scheduledStart), 'h:mm a')}-${format(parseISO(taskConflict.scheduledEnd), 'h:mm a')}`,
    };
  }

  return null;
}

function toDateInputValue(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function toTimeInputValue(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatClockTime(time: string) {
  return format(dateWithTime(new Date(), time), 'h:mm a');
}

function formatDue(task: Task) {
  return `${task.dueDate}${task.dueTime ? ` ${formatClockTime(task.dueTime)}` : ''}`;
}

function shouldOfferPlanningOptions(task: Task) {
  const now = new Date();
  const due = parseISO(`${task.dueDate}T${task.dueTime || '23:59'}:00`);
  return task.importance === 'important' && isAfter(startOfDay(due), startOfDay(now)) && isAfter(due, now);
}

function isTaskPastDue(task: Task) {
  if (task.status === 'complete') return false;
  const due = parseISO(`${task.dueDate}T${task.dueTime || '23:59'}:00`);
  return isBefore(due, new Date());
}

function getAuthRedirectUrl() {
  return `${window.location.origin}/`;
}

const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  const value = toTimeInputValue(minutes);
  return [value, formatClockTime(value)] as const;
});

function taskToForm(task: Task) {
  return {
    title: task.title,
    description: task.description || '',
    estimateMinutes: task.estimateMinutes,
    dueDate: task.dueDate,
    dueTime: task.dueTime || '17:00',
    importance: task.importance,
    urgency: task.urgency,
  };
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => loadLocalProfile());
  const [data, setData] = useState<AppData>(() => loadLocalData());
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [guestMode, setGuestMode] = useState(true);
  const [showGuestNudge, setShowGuestNudge] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState(emptyTask);
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [eventError, setEventError] = useState('');
  const [scheduleAlert, setScheduleAlert] = useState<ScheduleAlert | null>(null);
  const [dismissedScheduleAlerts, setDismissedScheduleAlerts] = useState<string[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);

  const displayName = profile?.nickname || profile?.firstName || getFirstName(session);
  const selectedDateObject = parseISO(`${selectedDate}T00:00:00`);
  const scheduledTasks = useMemo(
    () =>
      data.tasks
        .filter((task) => (task.status === 'scheduled' || task.status === 'complete') && task.scheduledStart)
        .sort((a, b) => String(a.scheduledStart).localeCompare(String(b.scheduledStart))),
    [data.tasks],
  );
  const selectedScheduledTasks = scheduledTasks.filter(
    (task) => task.scheduledStart && isSameDay(parseISO(task.scheduledStart), selectedDateObject),
  );
  const pendingTasks = data.tasks.filter((task) => task.status !== 'complete');
  const completedTasks = data.tasks
    .filter((task) => task.status === 'complete')
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const selectedCompletedTasks = completedTasks.filter(
    (task) =>
      (task.completedAt && isSameDay(parseISO(task.completedAt), selectedDateObject)) ||
      (task.scheduledStart && isSameDay(parseISO(task.scheduledStart), selectedDateObject)),
  );
  const pastDueTasks = pendingTasks
    .filter(isTaskPastDue)
    .sort((a, b) => `${a.dueDate}${a.dueTime || ''}`.localeCompare(`${b.dueDate}${b.dueTime || ''}`));
  const activeTasks = pendingTasks.filter((task) => !isTaskPastDue(task));

  useEffect(() => {
    if (!supabase) {
      setCloudLoaded(true);
      return;
    }

    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setGuestMode(!authData.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setGuestMode(!nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setCloudLoaded(true);
      return;
    }

    const currentSession = session;
    let cancelled = false;
    async function loadUser() {
      const firstName = getFirstName(currentSession);
      const [remoteProfile, remoteData] = await Promise.all([
        loadProfile(currentSession.user.id),
        loadCloudData(currentSession.user.id),
      ]);

      if (cancelled) return;

      const nextProfile =
        remoteProfile ??
        ({
          id: currentSession.user.id,
          firstName,
          nickname: null,
          nicknameAsked: false,
        } satisfies Profile);

      setProfile(nextProfile);
      saveLocalProfile(nextProfile);
      if (remoteData) setData({ ...defaultData, ...remoteData });
      setCloudLoaded(true);
    }

    loadUser().catch(() => setCloudLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    saveLocalData(data);
    if (session?.user.id && cloudLoaded) {
      saveCloudData(session.user.id, data).catch(() => undefined);
    }
  }, [data, session?.user.id, cloudLoaded]);

  useEffect(() => {
    if (profile) saveLocalProfile(profile);
  }, [profile]);

  function updateData(next: AppData) {
    setData(next);
  }

  function applySchedule(nextData: AppData, watchedTaskId?: string, showAlerts = true, previousData?: AppData) {
    const scheduledTasksNext = buildWeeklySchedule(nextData);
    const scheduledData = { ...nextData, tasks: scheduledTasksNext };
    updateData(scheduledData);

    if (!showAlerts) return;

    const newlyUnscheduledTask = previousData
      ? scheduledTasksNext.find((task) => {
          const previousTask = previousData.tasks.find((item) => item.id === task.id);
          return previousTask?.scheduledStart && task.status === 'pending' && !isTaskPastDue(task);
        })
      : undefined;
    const watchedTask = watchedTaskId
      ? scheduledTasksNext.find((task) => task.id === watchedTaskId)
      : newlyUnscheduledTask;

    if (!watchedTask || watchedTask.status !== 'pending' || dismissedScheduleAlerts.includes(watchedTask.id)) return;

    setScheduleAlert({
      taskId: watchedTask.id,
      type: shouldOfferPlanningOptions(watchedTask) ? 'high-priority' : 'no-time',
    });
  }

  function refitSchedule() {
    applySchedule(data);
  }

  function addTaskFromForm(form: typeof emptyTask) {
    if (!form.title.trim()) return;

    const task: Task = {
      id: makeId(),
      title: form.title.trim(),
      description: form.description.trim(),
      estimateMinutes: Number(form.estimateMinutes),
      dueDate: form.dueDate,
      dueTime: form.dueTime,
      importance: form.importance,
      urgency: form.urgency,
      category: getCategory(form.importance, form.urgency),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setDismissedScheduleAlerts((taskIds) => taskIds.filter((taskId) => taskId !== task.id));
    const nextData = { ...data, tasks: [...data.tasks, task] };
    applySchedule(nextData, task.id);
    setTaskForm({ ...emptyTask, dueDate: form.dueDate });
    if (guestMode && data.tasks.length >= 2) setShowGuestNudge(true);
  }

  function addTask() {
    addTaskFromForm(taskForm);
  }

  function openTaskEditor(task: Task) {
    setEditingTask(task);
    setEditForm(taskToForm(task));
  }

  function saveEditedTask() {
    if (!editingTask || !editForm.title.trim()) return;
    const editingTaskId = editingTask.id;

    const nextData = {
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === editingTask.id
          ? {
              ...task,
              title: editForm.title.trim(),
              description: editForm.description.trim(),
              estimateMinutes: Number(editForm.estimateMinutes),
              dueDate: editForm.dueDate,
              dueTime: editForm.dueTime,
              importance: editForm.importance,
              urgency: editForm.urgency,
              category: getCategory(editForm.importance, editForm.urgency),
              status: task.status === 'complete' ? task.status : ('pending' as const),
              scheduledStart: undefined,
              scheduledEnd: undefined,
            }
          : task,
      ),
    };

    setDismissedScheduleAlerts((taskIds) => taskIds.filter((taskId) => taskId !== editingTaskId));
    applySchedule(nextData, editingTaskId);
    setEditingTask(null);
  }

  function addEvent() {
    if (!eventForm.title.trim()) return;

    setEventError('');
    const eventStart = dateWithTime(parseISO(`${eventForm.date}T00:00:00`), eventForm.startTime);
    const eventEnd = dateWithTime(parseISO(`${eventForm.date}T00:00:00`), eventForm.endTime);
    if (!isAfter(eventEnd, eventStart)) {
      setEventError('The event end time needs to be after the start time.');
      return;
    }
    if (isBefore(eventStart, new Date())) {
      setEventError('That time has already passed. Choose a remaining time slot.');
      return;
    }
    const conflict = findScheduleConflict(data, eventStart, eventEnd);
    if (conflict) {
      setEventError(`That time overlaps with "${conflict.title}" from ${conflict.range}. Choose an open focus time.`);
      return;
    }

    const event: WeeklyEvent = {
      id: makeId(),
      title: eventForm.title.trim(),
      date: eventForm.date,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      location: eventForm.location.trim(),
    };

    const nextData = { ...data, events: [...data.events, event] };
    applySchedule(nextData, undefined, true, data);
    setEventForm({ ...emptyEvent, date: eventForm.date });
    setShowEventModal(false);
  }

  function openEventModal(date: string, startTime: string) {
    const startMinutes = minutesFromTime(startTime);
    setEventError('');
    setEventForm({
      ...emptyEvent,
      date,
      startTime,
      endTime: toTimeInputValue(startMinutes + 60),
    });
    setShowEventModal(true);
  }

  function completeTask(taskId: string) {
    const nextData = {
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === taskId
          ? { ...task, status: 'complete' as const, completedAt: new Date().toISOString() }
          : task,
      ),
    };

    updateData(nextData);
    setShowConfetti(true);
    window.setTimeout(() => setShowConfetti(false), 1200);
  }

  function toggleEventComplete(eventId: string) {
    const event = data.events.find((item) => item.id === eventId);
    const nextData = {
      ...data,
      events: data.events.map((item) =>
        item.id === eventId
          ? {
              ...item,
              completed: !item.completed,
              completedAt: !item.completed ? new Date().toISOString() : undefined,
            }
          : item,
      ),
    };

    updateData(nextData);
    if (!event?.completed) {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 1200);
    }
  }

  function deleteEvent(eventId: string) {
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return;

    setDeleteConfirmation({ id: event.id, title: event.title, type: 'event' });
  }

  function confirmDeleteEvent(eventId: string) {
    const nextData = {
      ...data,
      events: data.events.filter((item) => item.id !== eventId),
    };

    applySchedule(nextData, undefined, false);
    setDeleteConfirmation(null);
  }

  function deleteTask(taskId: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;

    setDeleteConfirmation({ id: task.id, title: task.title, type: 'task' });
  }

  function confirmDeleteTask(taskId: string) {
    const nextData = {
      ...data,
      tasks: data.tasks.filter((item) => item.id !== taskId),
    };

    setDismissedScheduleAlerts((taskIds) => taskIds.filter((dismissedTaskId) => dismissedTaskId !== taskId));
    if (scheduleAlert?.taskId === taskId) setScheduleAlert(null);
    applySchedule(nextData, undefined, false);
    setDeleteConfirmation(null);
  }

  function confirmDelete() {
    if (!deleteConfirmation) return;
    if (deleteConfirmation.type === 'event') {
      confirmDeleteEvent(deleteConfirmation.id);
      return;
    }
    confirmDeleteTask(deleteConfirmation.id);
  }

  function refitTaskToDate(taskId: string, date: string) {
    const now = new Date();
    const targetDate = parseISO(`${date}T00:00:00`);
    const fallbackDueTime = isSameDay(targetDate, now) ? toTimeInputValue(minutesFromTime(format(now, 'HH:mm')) + 90) : '17:00';
    const nextData = {
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              dueDate: date,
              dueTime: fallbackDueTime,
              status: 'pending' as const,
              scheduledStart: undefined,
              scheduledEnd: undefined,
            }
          : task,
      ),
    };

    setDismissedScheduleAlerts((taskIds) => taskIds.filter((dismissedTaskId) => dismissedTaskId !== taskId));
    applySchedule(nextData, taskId);
  }

  function markIncomplete(taskId: string) {
    const nextData = {
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'incomplete' as const,
              scheduledStart: undefined,
              scheduledEnd: undefined,
            }
          : task,
      ),
    };

    setDismissedScheduleAlerts((taskIds) => taskIds.filter((dismissedTaskId) => dismissedTaskId !== taskId));
    applySchedule(nextData, taskId);
  }

  function dismissScheduleAlert() {
    if (scheduleAlert) {
      setDismissedScheduleAlerts((taskIds) =>
        taskIds.includes(scheduleAlert.taskId) ? taskIds : [...taskIds, scheduleAlert.taskId],
      );
    }
    setScheduleAlert(null);
  }

  function adjustWakeEarlier(taskId: string) {
    const nextData = {
      ...data,
      routine: {
        ...data.routine,
        wakeTime: toTimeInputValue(minutesFromTime(data.routine.wakeTime) - 60),
      },
    };
    setScheduleAlert(null);
    applySchedule(nextData, taskId);
  }

  function adjustSleepLater(taskId: string) {
    const nextData = {
      ...data,
      routine: {
        ...data.routine,
        sleepTime: toTimeInputValue(minutesFromTime(data.routine.sleepTime) + 60),
      },
    };
    setScheduleAlert(null);
    applySchedule(nextData, taskId);
  }

  function moveLowPriorityToTomorrow(taskId: string) {
    const blockedTask = data.tasks.find((task) => task.id === taskId);
    if (!blockedTask) return;

    const lowPriorityIds = data.tasks
      .filter(
        (task) =>
          task.id !== taskId &&
          task.status !== 'complete' &&
          task.category === 'Not Important + Not Urgent' &&
          task.scheduledStart &&
          isSameDay(parseISO(task.scheduledStart), parseISO(`${blockedTask.dueDate}T00:00:00`)),
      )
      .slice(0, 3)
      .map((task) => task.id);

    if (!lowPriorityIds.length) {
      setScheduleAlert({ taskId, type: 'no-time' });
      return;
    }

    const nextData = {
      ...data,
      tasks: data.tasks.map((task) =>
        lowPriorityIds.includes(task.id)
          ? {
              ...task,
              dueDate: toDateInputValue(addDays(parseISO(`${task.dueDate}T00:00:00`), 1)),
              status: 'pending' as const,
              scheduledStart: undefined,
              scheduledEnd: undefined,
            }
          : task,
      ),
    };

    setScheduleAlert(null);
    applySchedule(nextData, taskId);
  }

  async function signInWithGoogle() {
    setAuthMessage('');
    if (!supabase) {
      setAuthMessage('Google sign-in needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the dev server.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });
    if (error) setAuthMessage(error.message);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setGuestMode(true);
    setProfile(loadLocalProfile());
  }

  async function saveNickname() {
    if (!session?.user.id) return;

    const nextProfile: Profile = {
      id: session.user.id,
      firstName: getFirstName(session),
      nickname: nicknameInput.trim() || null,
      nicknameAsked: true,
    };

    setProfile(nextProfile);
    await saveProfile(nextProfile);
  }

  const shouldAskNickname = Boolean(session && profile && !profile.nicknameAsked);

  return (
    <div className="min-h-screen bg-ink text-zinc-800">
      <div className="fixed inset-0 bg-ink" />
      {showConfetti ? <Confetti /> : null}
      {deleteConfirmation ? (
        <DeleteConfirmationModal
          item={deleteConfirmation}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
      {showGuestNudge ? (
        <GuestNudge onClose={() => setShowGuestNudge(false)} onSignIn={signInWithGoogle} />
      ) : null}
      {shouldAskNickname ? (
        <NicknameModal
          value={nicknameInput}
          onChange={setNicknameInput}
          onSkip={saveNickname}
          onSave={saveNickname}
        />
      ) : null}
      {editingTask ? (
        <TaskEditModal
          form={editForm}
          onChange={setEditForm}
          onClose={() => setEditingTask(null)}
          onSave={saveEditedTask}
        />
      ) : null}
      {scheduleAlert ? (
        <ScheduleAlertModal
          alert={scheduleAlert}
          task={data.tasks.find((task) => task.id === scheduleAlert.taskId)}
          onClose={dismissScheduleAlert}
          onDropLowPriority={moveLowPriorityToTomorrow}
          onSleepLater={adjustSleepLater}
          onWakeEarlier={adjustWakeEarlier}
        />
      ) : null}
      {showEventModal ? (
        <EventModal
          eventError={eventError}
          eventForm={eventForm}
          onAddEvent={addEvent}
          onClose={() => setShowEventModal(false)}
          onEventFormChange={setEventForm}
        />
      ) : null}

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blush">
              <Sparkles className="h-4 w-4" />
              Dynamic Anchor
            </div>
            <h1 className="text-2xl font-bold tracking-normal text-zinc-900 sm:text-3xl">
              Welcome back, {displayName}.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Turn priorities into a realistic week that respects sleep, events, and the work that matters.
            </p>
            {authMessage ? <p className="mt-2 max-w-2xl text-sm font-medium text-flame">{authMessage}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={refitSchedule}>
              <RefreshCw className="h-4 w-4" />
              Refit week
            </button>
            {session ? (
              <button className="btn-secondary" onClick={signOut}>
                <UserRound className="h-4 w-4" />
                Sign out
              </button>
            ) : (
              <button className="btn-primary" onClick={signInWithGoogle}>
                <LogIn className="h-4 w-4" />
                {isSupabaseConfigured ? 'Google sign-in' : 'Set up sign-in'}
              </button>
            )}
          </div>
        </header>

        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={`tab-button ${activeTab === tab.id ? 'tab-active' : ''}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === 'schedule' ? (
          <ScheduleView
            events={data.events}
            onComplete={completeTask}
            onDelete={deleteTask}
            onDeleteEvent={deleteEvent}
            onIncomplete={markIncomplete}
            onOpenEventModal={openEventModal}
            onRefitPastDue={refitTaskToDate}
            onToggleEventComplete={toggleEventComplete}
            pastDueTasks={pastDueTasks}
            routine={data.routine}
            selectedCompletedTasks={selectedCompletedTasks}
            selectedDate={selectedDate}
            selectedScheduledTasks={selectedScheduledTasks}
            setSelectedDate={setSelectedDate}
            scheduledTasks={scheduledTasks}
          />
        ) : null}

        {activeTab === 'tasks' ? (
          <TaskView
            form={taskForm}
            onAdd={addTask}
            onComplete={completeTask}
            onDelete={deleteTask}
            onEdit={openTaskEditor}
            onFormChange={setTaskForm}
            pastDueTasks={pastDueTasks}
            pendingTasks={activeTasks}
            selectedDate={selectedDate}
            onRefitPastDue={refitTaskToDate}
          />
        ) : null}

        {activeTab === 'routine' ? (
          <RoutineView
            data={data}
            onDataChange={updateData}
          />
        ) : null}

        {activeTab === 'matrix' ? <MatrixView tasks={activeTasks} /> : null}
      </main>
    </div>
  );
}

function ScheduleView({
  events,
  onComplete,
  onDelete,
  onDeleteEvent,
  onIncomplete,
  onOpenEventModal,
  onRefitPastDue,
  onToggleEventComplete,
  pastDueTasks,
  routine,
  selectedCompletedTasks,
  selectedDate,
  selectedScheduledTasks,
  setSelectedDate,
  scheduledTasks,
}: {
  events: WeeklyEvent[];
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onIncomplete: (taskId: string) => void;
  onOpenEventModal: (date: string, startTime: string) => void;
  onRefitPastDue: (taskId: string, date: string) => void;
  onToggleEventComplete: (eventId: string) => void;
  pastDueTasks: Task[];
  routine: AppData['routine'];
  selectedCompletedTasks: Task[];
  selectedDate: string;
  selectedScheduledTasks: Task[];
  setSelectedDate: (date: string) => void;
  scheduledTasks: Task[];
}) {
  const visibleDate = parseISO(`${selectedDate}T00:00:00`);
  const wake = dateWithTime(visibleDate, routine.wakeTime);
  const sleep = dateWithTime(visibleDate, routine.sleepTime);
  const hourCount = Math.max(1, Math.ceil((sleep.getTime() - wake.getTime()) / 3_600_000));
  const hours = Array.from({ length: hourCount }, (_, index) => addHours(wake, index));
  const selectedEvents = events.filter((event) => isSameDay(parseISO(`${event.date}T00:00:00`), visibleDate));
  const selectedUpcomingEvents = selectedEvents.filter((event) => !event.completed);
  const selectedCompletedEvents = selectedEvents.filter((event) => event.completed);
  const selectedOpenScheduledTasks = selectedScheduledTasks.filter((task) => task.status !== 'complete');
  const changeDateBy = (days: number) => setSelectedDate(toDateInputValue(addDays(visibleDate, days)));

  return (
    <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionTitle
            eyebrow="Schedule"
            title={selectedScheduledTasks.length ? 'Hour-by-hour anchors' : 'No tasks scheduled for this date'}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="icon-action" title="Previous day" onClick={() => changeDateBy(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Input label="Date" type="date" value={selectedDate} onChange={setSelectedDate} />
            <button className="icon-action" title="Next day" onClick={() => changeDateBy(1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn-secondary" onClick={() => setSelectedDate(toDateInputValue(new Date()))}>
              Today
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          {hours.map((hour) => {
            const nextHour = addHours(hour, 1);
            const hourTasks = selectedScheduledTasks.filter((task) => {
              if (!task.scheduledStart || !task.scheduledEnd) return false;
              const start = parseISO(task.scheduledStart);
              const end = parseISO(task.scheduledEnd);
              return rangesOverlap(start, end, hour, nextHour);
            });
            const hourEvents = selectedEvents.filter((event) => {
              const start = dateWithTime(parseISO(`${event.date}T00:00:00`), event.startTime);
              const end = dateWithTime(parseISO(`${event.date}T00:00:00`), event.endTime);
              return rangesOverlap(start, end, hour, nextHour);
            });
            const routineMarkers = [
              { id: 'wake', label: 'Wake up', time: routine.wakeTime },
              { id: 'sleep', label: 'Sleep', time: routine.sleepTime },
            ].filter((marker) => {
              const markerTime = dateWithTime(visibleDate, marker.time);
              return markerTime >= hour && (marker.id === 'sleep' ? markerTime <= nextHour : markerTime < nextHour);
            });

            return (
              <div className="timeline-row" key={hour.toISOString()}>
                <div className="timeline-time">{format(hour, 'h a')}</div>
                <div className="grid min-w-0 gap-2">
                  {routineMarkers.map((marker) => (
                    <div className="rounded-lg border border-hibiscus bg-panel p-3" key={marker.id}>
                      <div className="font-semibold text-zinc-900">{marker.label}</div>
                      <div className="text-xs text-zinc-600">{formatClockTime(marker.time)}</div>
                    </div>
                  ))}
                  {hourEvents.map((event) => (
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-indigo bg-night p-3" key={event.id}>
                      <div className={event.completed ? 'line-through decoration-flame decoration-2' : ''}>
                        <div className="font-semibold text-zinc-900">{event.title}</div>
                        <div className="text-xs text-zinc-600">
                          {formatClockTime(event.startTime)}-{formatClockTime(event.endTime)}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button className="icon-action" title="Mark event complete" onClick={() => onToggleEventComplete(event.id)}>
                          <Check className="h-4 w-4" />
                        </button>
                        {!event.completed ? (
                          <button className="icon-action text-flame hover:border-flame hover:text-flame" title="Delete event" onClick={() => onDeleteEvent(event.id)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {hourTasks.map((task) => (
                    <TimelineTaskBlock
                      key={task.id}
                      task={task}
                      actions={
                        <>
                          <button className="icon-action" title="Mark complete" onClick={() => onComplete(task.id)}>
                            <Check className="h-4 w-4" />
                          </button>
                          <button className="icon-action" title="Refit as incomplete" onClick={() => onIncomplete(task.id)}>
                            <RefreshCw className="h-4 w-4" />
                          </button>
                          {task.status !== 'complete' ? (
                            <button className="icon-action text-flame hover:border-flame hover:text-flame" title="Delete task" onClick={() => onDelete(task.id)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </>
                      }
                    />
                  ))}
                  {!hourTasks.length && !hourEvents.length && !routineMarkers.length ? (
                    <button className="timeline-empty text-left" onDoubleClick={() => onOpenEventModal(selectedDate, format(hour, 'HH:mm'))}>
                      Open focus time
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!scheduledTasks.length ? <EmptyState text="Add tasks and events, then Dynamic Anchor will fit the week." /> : null}
        </div>
      </div>

      <aside className="grid content-start gap-3">
        <PastDueList onDelete={onDelete} onRefit={onRefitPastDue} refitDate={selectedDate} tasks={pastDueTasks} />
        <SummaryList label="Scheduled" onDelete={onDelete} tasks={selectedOpenScheduledTasks} />
        <CompletedActivityList events={selectedCompletedEvents} tasks={selectedCompletedTasks} />
        <EventSummaryList events={selectedUpcomingEvents} onDeleteEvent={onDeleteEvent} />
      </aside>
    </section>
  );
}

function PastDueList({
  onDelete,
  onRefit,
  refitDate,
  tasks,
}: {
  onDelete: (taskId: string) => void;
  onRefit: (taskId: string, date: string) => void;
  refitDate: string;
  tasks: Task[];
}) {
  return (
    <div className="rounded-lg border border-flame bg-night p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-flame">Past due</h3>
        <span className="text-2xl font-bold text-zinc-900">{tasks.length}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {tasks.slice(0, 6).map((task) => (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-flame bg-panel p-2.5" key={task.id}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">{task.title}</div>
              <div className="text-xs text-zinc-600">Due {formatDue(task)}</div>
            </div>
            <button className="icon-action text-flame hover:border-flame hover:text-flame" title="Delete task" onClick={() => onDelete(task.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
            <button className="btn-secondary min-h-9 px-3 py-1 text-xs" onClick={() => onRefit(task.id, refitDate)}>
              Refit here
            </button>
          </div>
        ))}
        {!tasks.length ? <div className="text-sm text-zinc-500">No overdue tasks.</div> : null}
      </div>
    </div>
  );
}

function SummaryList({ label, onDelete, tasks }: { label: string; onDelete: (taskId: string) => void; tasks: Task[] }) {
  return (
    <div className="panel-compact">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</h3>
        <span className="text-2xl font-bold text-zinc-900">{tasks.length}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {tasks.slice(0, 5).map((task) => (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-aura bg-panel p-2.5" key={task.id}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">{task.title}</div>
              <div className="text-xs text-zinc-500">
                {task.scheduledStart ? format(parseISO(task.scheduledStart), 'h:mm a') : formatDateTime(task.completedAt)}
              </div>
            </div>
            <button className="icon-action text-flame hover:border-flame hover:text-flame" title="Delete task" onClick={() => onDelete(task.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!tasks.length ? <div className="text-sm text-zinc-500">Nothing here for this date.</div> : null}
      </div>
    </div>
  );
}

function CompletedActivityList({
  events,
  tasks,
}: {
  events: WeeklyEvent[];
  tasks: Task[];
}) {
  const total = tasks.length + events.length;

  return (
    <div className="panel-compact">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">Completed</h3>
        <span className="text-2xl font-bold text-zinc-900">{total}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {tasks.slice(0, 5).map((task) => (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-aura bg-panel p-2.5" key={task.id}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">{task.title}</div>
              <div className="text-xs text-zinc-500">
                {task.scheduledStart ? format(parseISO(task.scheduledStart), 'h:mm a') : formatDateTime(task.completedAt)}
              </div>
            </div>
          </div>
        ))}
        {events.slice(0, Math.max(0, 5 - tasks.length)).map((event) => (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-indigo bg-panel p-2.5" key={event.id}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">{event.title}</div>
              <div className="text-xs text-zinc-500">
                {formatClockTime(event.startTime)}-{formatClockTime(event.endTime)}
              </div>
            </div>
          </div>
        ))}
        {!total ? <div className="text-sm text-zinc-500">Nothing completed on this date.</div> : null}
      </div>
    </div>
  );
}

function EventSummaryList({ events, onDeleteEvent }: { events: WeeklyEvent[]; onDeleteEvent: (eventId: string) => void }) {
  return (
    <div className="panel-compact">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">Upcoming</h3>
        <span className="text-2xl font-bold text-zinc-900">{events.length}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {events.slice(0, 5).map((event) => (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-aura bg-panel p-2.5" key={event.id}>
            <div>
              <div className="text-sm font-semibold text-zinc-900">{event.title}</div>
              <div className="text-xs text-zinc-500">
                {formatClockTime(event.startTime)}-{formatClockTime(event.endTime)}
              </div>
            </div>
            <button className="icon-action text-flame hover:border-flame hover:text-flame" title="Delete event" onClick={() => onDeleteEvent(event.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!events.length ? <div className="text-sm text-zinc-500">No events on this date.</div> : null}
      </div>
    </div>
  );
}

function TaskView({
  form,
  onAdd,
  onComplete,
  onDelete,
  onEdit,
  onFormChange,
  onRefitPastDue,
  pastDueTasks,
  pendingTasks,
  selectedDate,
}: {
  form: typeof emptyTask;
  onAdd: () => void;
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onFormChange: (form: typeof emptyTask) => void;
  onRefitPastDue: (taskId: string, date: string) => void;
  pastDueTasks: Task[];
  pendingTasks: Task[];
  selectedDate: string;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="panel">
        <SectionTitle eyebrow="Add Tasks" title="Capture actionable work" />
        <div className="mt-5 grid gap-3">
          <Input label="Task title" value={form.title} onChange={(title) => onFormChange({ ...form, title })} />
          <label className="field">
            <span>Description</span>
            <textarea
              className="input min-h-24 resize-y"
              value={form.description}
              onChange={(event) => onFormChange({ ...form, description: event.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <EstimatedTimeInput
              value={form.estimateMinutes}
              onChange={(estimateMinutes) => onFormChange({ ...form, estimateMinutes })}
            />
            <Input label="Deadline date" type="date" value={form.dueDate} onChange={(dueDate) => onFormChange({ ...form, dueDate })} />
            <TimeSelect label="Deadline time" value={form.dueTime} onChange={(dueTime) => onFormChange({ ...form, dueTime })} />
          </div>
          <div className="rounded-lg border border-aura bg-panel p-3 text-sm text-zinc-600">
            <strong className="text-zinc-900">Urgent</strong> means the deadline is close or the task needs attention soon.
            <br />
            <strong className="text-zinc-900">Important</strong> means it has meaningful consequences, affects a major goal,
            is worth a lot of points, or matters long-term.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Importance"
              value={form.importance}
              options={[
                ['important', 'Important'],
                ['not-important', 'Not important'],
              ]}
              onChange={(importance) => onFormChange({ ...form, importance: importance as ImportanceLevel })}
            />
            <Select
              label="Urgency"
              value={form.urgency}
              options={[
                ['urgent', 'Urgent'],
                ['not-urgent', 'Not urgent'],
              ]}
              onChange={(urgency) => onFormChange({ ...form, urgency: urgency as UrgencyLevel })}
            />
          </div>
          <button className="btn-primary w-full justify-center" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add and schedule
          </button>
        </div>
      </div>

      <div className="panel">
        <SectionTitle eyebrow="Task Stack" title={`${pendingTasks.length} active items`} />
        <div className="mt-5 grid gap-3">
          <PastDueList onDelete={onDelete} onRefit={onRefitPastDue} refitDate={selectedDate} tasks={pastDueTasks} />
          {pendingTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              actions={
                <>
                  <button className="icon-action" title="Mark complete" onClick={() => onComplete(task.id)}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button className="icon-action" title="Edit task" onClick={() => onEdit(task)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="icon-action text-flame hover:border-flame hover:text-flame" title="Delete task" onClick={() => onDelete(task.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              }
            />
          ))}
          {!pendingTasks.length ? <EmptyState text="Add a task with an estimate and priority to begin." /> : null}
        </div>
      </div>
    </section>
  );
}

function RoutineView({
  data,
  onDataChange,
}: {
  data: AppData;
  onDataChange: (data: AppData) => void;
}) {
  const [routineDraft, setRoutineDraft] = useState(data.routine);

  useEffect(() => {
    setRoutineDraft(data.routine);
  }, [data.routine]);

  function saveRoutine() {
    const nextData = { ...data, routine: routineDraft };
    onDataChange({ ...nextData, tasks: buildWeeklySchedule(nextData) });
  }

  const hasRoutineChanges =
    routineDraft.wakeTime !== data.routine.wakeTime || routineDraft.sleepTime !== data.routine.sleepTime;

  return (
    <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="panel">
        <SectionTitle eyebrow="Weekly Events / Routine" title="Set your normal boundaries" />
        <div className="mt-5 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeSelect label="Wake-up time" value={routineDraft.wakeTime} onChange={(wakeTime) => setRoutineDraft({ ...routineDraft, wakeTime })} />
            <TimeSelect label="Sleep time" value={routineDraft.sleepTime} onChange={(sleepTime) => setRoutineDraft({ ...routineDraft, sleepTime })} />
          </div>
          <button className="btn-primary w-full justify-center" disabled={!hasRoutineChanges} onClick={saveRoutine}>
            Save routine
          </button>
          {hasRoutineChanges ? <p className="text-sm text-zinc-500">Press save to update the schedule.</p> : null}
        </div>
      </div>

      <div className="panel">
        <SectionTitle eyebrow="Fixed Time" title={`${data.events.length} events this week`} />
        <div className="mt-5 grid gap-3">
          {data.events
            .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
            .map((event) => (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-aura bg-panel p-4" key={event.id}>
                <div>
                  <h3 className="font-semibold text-zinc-900">{event.title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {format(parseISO(`${event.date}T00:00:00`), 'EEE, MMM d')} • {formatClockTime(event.startTime)}-
                    {formatClockTime(event.endTime)}
                    {event.location ? ` • ${event.location}` : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-blush" />
              </div>
            ))}
          {!data.events.length ? <EmptyState text="Block the commitments your schedule has to respect." /> : null}
        </div>
      </div>
    </section>
  );
}

function MatrixView({ tasks }: { tasks: Task[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {categories.map((category) => (
        <div className="panel min-h-72" key={category}>
          <h2 className="text-lg font-bold text-zinc-900">{category}</h2>
          <p className="mt-1 text-sm text-zinc-500">{categoryHints[category]}</p>
          <div className="mt-4 grid gap-3">
            {tasks
              .filter((task) => task.category === category)
              .map((task) => (
                <TaskCard key={task.id} task={task} compact />
              ))}
            {!tasks.some((task) => task.category === category) ? <EmptyState text="No tasks here yet." /> : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function TaskCard({ actions, compact = false, task }: { actions?: React.ReactNode; compact?: boolean; task: Task }) {
  const description = task.description && task.description.length > 88 ? `${task.description.slice(0, 88)}...` : task.description;

  return (
    <article className="rounded-lg border border-aura bg-panel p-4 hover:border-hibiscus">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`${compact ? 'text-base' : 'text-lg'} break-words font-bold text-zinc-900`}>{task.title}</h3>
          {description ? <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="chip">{formatDuration(task.estimateMinutes)}</span>
        <span className="chip">{task.category}</span>
        <span className="chip">Due {formatDue(task)}</span>
        <span className="status-pill">{task.status}</span>
      </div>
      {task.scheduledStart ? (
        <div className="mt-3 text-sm font-medium text-blush">
          {formatDateTime(task.scheduledStart)} to {format(parseISO(task.scheduledEnd || task.scheduledStart), 'h:mm a')}
        </div>
      ) : null}
    </article>
  );
}

function TimelineTaskBlock({ actions, task }: { actions?: React.ReactNode; task: Task }) {
  const durationHeight = Math.max(34, Math.min(180, task.estimateMinutes * 2));
  const isComplete = task.status === 'complete';

  return (
    <article
      className="rounded-lg border border-hibiscus bg-panel px-3 py-2 hover:border-flame"
      style={{ minHeight: `${durationHeight}px` }}
    >
      <div className="flex h-full items-start justify-between gap-3">
        <div className={`min-w-0 ${isComplete ? 'line-through decoration-flame decoration-2' : ''}`}>
          <h3 className="break-words text-sm font-bold text-zinc-900">{task.title}</h3>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            {task.scheduledStart ? format(parseISO(task.scheduledStart), 'h:mm a') : 'Unscheduled'}-
            {task.scheduledEnd ? format(parseISO(task.scheduledEnd), 'h:mm a') : ''} • {formatDuration(task.estimateMinutes)}
          </p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
    </article>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blush">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold text-zinc-900">{title}</h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-aura p-5 text-center text-sm text-zinc-500">{text}</div>;
}

function Input({
  label,
  onChange,
  value,
  ...props
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function Select({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimeSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {timeOptions.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function EstimatedTimeInput({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  function updateEstimate(nextHours: number, nextMinutes: number) {
    const total = Math.max(5, nextHours * 60 + nextMinutes);
    onChange(total);
  }

  return (
    <div className="field">
      <span>Estimated time</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="sr-only" htmlFor="estimate-hours">
          Hours
        </label>
        <input
          className="input"
          id="estimate-hours"
          min={0}
          type="number"
          value={String(hours)}
          onChange={(event) => updateEstimate(Number(event.target.value), minutes)}
        />
        <label className="sr-only" htmlFor="estimate-minutes">
          Minutes
        </label>
        <select
          className="input"
          id="estimate-minutes"
          value={String(minutes)}
          onChange={(event) => updateEstimate(hours, Number(event.target.value))}
        >
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((minuteOption) => (
            <option key={minuteOption} value={minuteOption}>
              {minuteOption} min
            </option>
          ))}
        </select>
      </div>
      <span className="text-xs font-medium text-zinc-500">
        {hours} hr {minutes} min
      </span>
    </div>
  );
}

function GuestNudge({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="text-xl font-bold text-zinc-900">Save this week across devices?</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Guest work stays in this browser. Google sign-in stores your schedule with Supabase so it can follow you.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={onSignIn}>
            <LogIn className="h-4 w-4" />
            Sign in
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Keep guest mode
          </button>
        </div>
      </div>
    </div>
  );
}

function NicknameModal({
  onChange,
  onSave,
  onSkip,
  value,
}: {
  onChange: (value: string) => void;
  onSave: () => void;
  onSkip: () => void;
  value: string;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="text-xl font-bold text-zinc-900">Do you have a nickname?</h2>
        <p className="mt-2 text-sm text-zinc-600">Optional. Dynamic Anchor will use it in your welcome message.</p>
        <div className="mt-4">
          <Input label="Nickname" value={value} onChange={onChange} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={onSave}>
            Save
          </button>
          <button className="btn-secondary" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function EventModal({
  eventError,
  eventForm,
  onAddEvent,
  onClose,
  onEventFormChange,
}: {
  eventError: string;
  eventForm: typeof emptyEvent;
  onAddEvent: () => void;
  onClose: () => void;
  onEventFormChange: (form: typeof emptyEvent) => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Add event</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {format(parseISO(`${eventForm.date}T00:00:00`), 'EEE, MMM d')} • {formatClockTime(eventForm.startTime)}
            </p>
          </div>
          <button className="icon-action" title="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <Input label="Event title" value={eventForm.title} onChange={(title) => onEventFormChange({ ...eventForm, title })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Date" type="date" value={eventForm.date} onChange={(date) => onEventFormChange({ ...eventForm, date })} />
            <TimeSelect label="Start" value={eventForm.startTime} onChange={(startTime) => onEventFormChange({ ...eventForm, startTime })} />
            <TimeSelect label="End" value={eventForm.endTime} onChange={(endTime) => onEventFormChange({ ...eventForm, endTime })} />
          </div>
          <Input label="Location or note" value={eventForm.location} onChange={(location) => onEventFormChange({ ...eventForm, location })} />
          {eventError ? <p className="text-sm font-medium text-flame">{eventError}</p> : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={onAddEvent}>
            Add event
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  item,
  onCancel,
  onConfirm,
}: {
  item: DeleteConfirmation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal max-w-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-hibiscus">Confirm delete</p>
            <h2 className="mt-1 text-xl font-bold text-zinc-900">Delete this {item.type}?</h2>
          </div>
          <button className="icon-action" title="Close" onClick={onCancel}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          This will remove <span className="font-semibold text-zinc-900">"{item.title}"</span> from Dynamic Anchor.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary bg-flame hover:bg-hibiscus" onClick={onConfirm}>
            Delete
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            Keep it
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleAlertModal({
  alert,
  onClose,
  onDropLowPriority,
  onSleepLater,
  onWakeEarlier,
  task,
}: {
  alert: ScheduleAlert;
  onClose: () => void;
  onDropLowPriority: (taskId: string) => void;
  onSleepLater: (taskId: string) => void;
  onWakeEarlier: (taskId: string) => void;
  task?: Task;
}) {
  const isHighPriority = alert.type === 'high-priority';

  return (
    <div className="modal-backdrop">
      <div className="modal max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">
              {isHighPriority ? 'This priority needs more room' : "Can't fit in schedule."}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {isHighPriority
                ? `${task?.title || 'This high priority task'} cannot fit before its deadline with the current routine and events.`
                : `${task?.title || 'This activity'} cannot fit into the remaining available time before its deadline.`}
            </p>
          </div>
          <button className="icon-action" title="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {isHighPriority ? (
          <div className="mt-5 grid gap-2 rounded-lg border border-aura bg-panel p-3">
            <p className="text-sm text-zinc-600">Since this is future planning, you can make more room:</p>
            <button className="btn-primary justify-center" onClick={() => onWakeEarlier(alert.taskId)}>
              Wake up 1 hour earlier
            </button>
            <button className="btn-primary justify-center" onClick={() => onSleepLater(alert.taskId)}>
              Sleep 1 hour later
            </button>
            <button className="btn-secondary justify-center" onClick={() => onDropLowPriority(alert.taskId)}>
              Move low priority tasks to tomorrow
            </button>
          </div>
        ) : null}

        <div className="mt-5">
          <button className="btn-secondary" onClick={onClose}>
            Keep unscheduled for now
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskEditModal({
  form,
  onChange,
  onClose,
  onSave,
}: {
  form: typeof emptyTask;
  onChange: (form: typeof emptyTask) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Edit task</h2>
            <p className="mt-1 text-sm text-zinc-600">Changes will refit this item into the weekly schedule.</p>
          </div>
          <button className="icon-action" title="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <Input label="Task title" value={form.title} onChange={(title) => onChange({ ...form, title })} />
          <label className="field">
            <span>Description</span>
            <textarea
              className="input min-h-24 resize-y"
              value={form.description}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <EstimatedTimeInput
              value={form.estimateMinutes}
              onChange={(estimateMinutes) => onChange({ ...form, estimateMinutes })}
            />
            <Input label="Deadline date" type="date" value={form.dueDate} onChange={(dueDate) => onChange({ ...form, dueDate })} />
            <TimeSelect label="Deadline time" value={form.dueTime} onChange={(dueTime) => onChange({ ...form, dueTime })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Importance"
              value={form.importance}
              options={[
                ['important', 'Important'],
                ['not-important', 'Not important'],
              ]}
              onChange={(importance) => onChange({ ...form, importance: importance as ImportanceLevel })}
            />
            <Select
              label="Urgency"
              value={form.urgency}
              options={[
                ['urgent', 'Urgent'],
                ['not-urgent', 'Not urgent'],
              ]}
              onChange={(urgency) => onChange({ ...form, urgency: urgency as UrgencyLevel })}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={onSave}>
            Save changes
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 84 }, (_, index) => {
        const angle = (index / 84) * Math.PI * 2;
        const distance = 120 + (index % 12) * 18;
        const drift = (index % 5) * 8;
        const x = Math.cos(angle) * (distance + drift);
        const y = Math.sin(angle) * distance;

        return (
          <span
            className="confetti"
            key={index}
            style={{
              ['--x' as string]: `${x}px`,
              ['--y' as string]: `${y}px`,
              ['--spin' as string]: `${180 + (index % 7) * 80}deg`,
              animationDelay: `${(index % 6) * 0.015}s`,
            }}
          />
        );
      })}
    </div>
  );
}

export default App;

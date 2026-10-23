/** Serializable shapes passed from server components / actions to client components. No Prisma types. */
import type { ExerciseDTO, PrBaseline, PrFlag, SetDTO } from './types';

export interface ProgramItemDTO {
  id: string;
  order: number;
  exercise: ExerciseDTO;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number | null;
  targetWeightKg: number | null;
  restSeconds: number | null;
  note: string | null;
}

export interface ProgramDayDTO {
  id: string;
  order: number;
  title: string;
  items: ProgramItemDTO[];
}

export interface ProgramDTO {
  id: string;
  clientId: string;
  clientName: string;
  authorId: string;
  authorName: string;
  /** Who wrote it. A client may edit only programs they wrote themselves. */
  authorRole: 'COACH' | 'CLIENT';
  title: string;
  notes: string | null;
  active: boolean;
  updatedAt: string;
  days: ProgramDayDTO[];
}

/** "Last time" for one exercise: the latest earlier workout's working sets. */
export interface LastTimeDTO {
  date: string;
  /** Short date in the viewer's calendar, formatted on the server (client-side Intl can differ from Node's and break hydration). */
  dateLabel: string;
  sets: { reps: number; weightKg: number; rpe: number | null }[];
}

export interface ExerciseContext {
  lastTime: LastTimeDTO | null;
  baseline: PrBaseline;
}

/** One program day the coach can start a session from. */
export interface SessionDayOption {
  id: string;
  title: string;
  programTitle: string;
  exerciseCount: number;
}

/** What the coach's "start a session" sheet needs to know about a client (and booking). */
export interface SessionOptionsDTO {
  clientName: string;
  /** The client's active program days, program by program, in order. */
  days: SessionDayOption[];
  /** The day that is next in rotation (preselected), null when there is no program. */
  nextDayId: string | null;
  /** The workout already linked to the booking, if there is one. */
  linked: { id: string; finished: boolean } | null;
  /** A workout of this client that is still open: continue it instead of starting a second one. */
  open: { id: string; dayTitle: string | null; setCount: number; startedAt: string } | null;
}

export interface LoggerExercise {
  exercise: ExerciseDTO;
  /** Present when the exercise comes from the program day. */
  target: {
    itemId: string;
    sets: number;
    repsMin: number;
    repsMax: number | null;
    weightKg: number | null;
    restSeconds: number | null;
    note: string | null;
  } | null;
}

export interface LoggerData {
  workoutId: string;
  clientId: string;
  clientName: string;
  startedAt: string;
  finishedAt: string | null;
  note: string | null;
  dayTitle: string | null;
  programTitle: string | null;
  exercises: LoggerExercise[];
  sets: SetDTO[];
  contexts: Record<string, ExerciseContext>;
  /** Long date of the workout in the viewer's calendar, formatted on the server. */
  dateLabel: string;
  barKg: number;
  timeZone: string;
  /** Server clock when the page rendered (keeps SSR and hydration in agreement). */
  serverNow: string;
}

export interface WorkoutSummaryDTO {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  dayTitle: string | null;
  programTitle: string | null;
  note: string | null;
  setCount: number;
  volume: number;
  exerciseCount: number;
  prCount: number;
  durationSec: number | null;
}

export interface DetailSetDTO extends SetDTO {
  e1rm: number | null;
  pr: PrFlag | null;
}

export interface WorkoutDetailDTO extends WorkoutSummaryDTO {
  clientId: string;
  clientName: string;
  exercises: {
    exercise: ExerciseDTO;
    sets: DetailSetDTO[];
    target: LoggerExercise['target'];
  }[];
}

export interface ProgressExerciseOption {
  exercise: ExerciseDTO;
  workouts: number;
  lastDate: string;
}

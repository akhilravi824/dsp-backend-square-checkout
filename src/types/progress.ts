export interface LessonProgress {
  id: string;
  attempts: number;
  complete: boolean;
}

export interface UnitProgress {
  lessons: Record<string, LessonProgress>;
}

export interface LevelProgress {
  units: Record<string, UnitProgress>;
  locked: boolean;
}

export interface UserProgress {
  totalAttempts: number;
  totalTimeSpent: number; // in seconds
  activeDays: string[]; // ISO string timestamps
  freeTries: number; // number of free tries available for trial users
  levels: Record<string, LevelProgress>;
}

export interface UpdateProgressRequest {
  lessonId: string;
  unitId: string;
  levelId: string;
  attempt?: boolean;
  complete?: boolean;
  timeSpent?: number;
}

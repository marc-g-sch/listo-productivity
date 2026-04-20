export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  category: 'work' | 'personal';
  indentLevel?: number;
}

export interface Habit {
  id: string;
  text: string;
  completed: boolean;
}

export interface Quote {
  text: string;
  author: string;
  explanation: string;
}

export interface ReflectionData {
  focusAchieved: boolean;
  todosCompletedCount: number;
  habitsCompletedCount: number;
  biggestWin: string;
  betterTomorrow: string;
  selfRating: 'strong' | 'okay' | 'difficult' | null;
}

export interface AiRating {
  color: 'green' | 'yellow' | 'red';
  score: number; // 1–10
  feedback: string;
  suggestion: string;
}

export interface DayData {
  id: string;
  date: string;
  focus: string;
  focusCompleted: boolean;
  todos: Todo[];
  habits: Habit[];
  notes: string;
  reflection: ReflectionData | null;
  aiRating: AiRating | null;
  isReflectionSubmitted: boolean;
}

export interface PlanItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface LongTermPlan {
  id: string;
  title: string;
  oneThing: string;
  supportingGoals: PlanItem[];
  notes: string;
  quarters?: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  };
}

export const ViewMode = {
  DAY: 'DAY',
  MONTH: 'MONTH',
  YEAR: 'YEAR',
} as const;
export type ViewMode = typeof ViewMode[keyof typeof ViewMode];

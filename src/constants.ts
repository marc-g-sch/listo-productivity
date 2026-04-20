import type { Habit, Quote } from './types';

export const INITIAL_HABITS: Habit[] = [
  { id: 'h1', text: '10 min reading', completed: false },
  { id: 'h2', text: 'Drink enough water', completed: false },
  { id: 'h3', text: 'Short workout', completed: false },
];

export const FALLBACK_QUOTE: Quote = {
  text: 'Success is not the key to happiness. Happiness is the key to success. If you love what you are doing, you will be successful.',
  author: 'Albert Schweitzer',
  explanation: 'Passion is the most important fuel for long-term goals.',
};

export const DEFAULT_AI_RATING_PROMPT = `
You are a friendly, clear mentor for focus and productivity.
Rate the day based on:
1. Was the Daily Focus (The One Thing) achieved?
2. Ratio of completed todos.
3. Number of completed habits.
4. Content of todos (task size).

Logic:
- GREEN: Focus done AND most todos AND habits.
- YELLOW: Focus done OR moderate productivity.
- RED: Focus not done AND little accomplished.

TASK ANALYSIS (IMPORTANT):
- Look at the todo texts.
- If a task looks huge (e.g. "write thesis", "renovate house", "write novel"), give urgent advice:
  "This is too big for a daily todo! Break such monster tasks into monthly or weekly goals, otherwise you'll just get frustrated."

Reply in JSON format:
{
  "color": "green" | "yellow" | "red",
  "feedback": "Short, appreciative explanation (2-3 sentences) in English. Address monster tasks if present.",
  "suggestion": "One concrete, short tip for tomorrow."
}
`;

export const QUOTE_GENERATION_PROMPT = `
Generate a short, motivating quote for the day in English.
Source: Can be a philosopher (Stoic), but also a successful athlete, entrepreneur or politician.
It should be action-oriented and practical (no lofty philosophizing).
Add a very short explanation (1 sentence).
Reply strictly in JSON format:
{
  "text": "The quote...",
  "author": "Name",
  "explanation": "Short explanation..."
}
`;

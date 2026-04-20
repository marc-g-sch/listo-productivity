import { GoogleGenAI } from '@google/genai';
import type { AiRating, DayData } from '../types';
import { DEFAULT_AI_RATING_PROMPT } from '../constants';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Strip HTML tags for sending to AI (we store rich HTML in todo.text)
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

export const generateDayRating = async (dayData: DayData): Promise<AiRating | null> => {
  if (!apiKey) return null;

  const workTodos = dayData.todos.filter(t => t.category === 'work');
  const personalTodos = dayData.todos.filter(t => t.category === 'personal');
  const todoListText = dayData.todos
    .map(t => `- [${t.category}] ${stripHtml(t.text)} (${t.completed ? 'Done' : 'Open'})`)
    .join('\n');

  const prompt = `
${DEFAULT_AI_RATING_PROMPT}

--- DAY DATA ---
Daily Focus: "${stripHtml(dayData.focus)}"
Focus achieved: ${dayData.reflection?.focusAchieved ? 'Yes' : 'No'}
Habits done: ${dayData.habits.filter(h => h.completed).length} / ${dayData.habits.length}
Work tasks: ${workTodos.filter(t => t.completed).length} / ${workTodos.length} done
Personal tasks: ${personalTodos.filter(t => t.completed).length} / ${personalTodos.length} done

FULL TODO LIST:
${todoListText || '(no tasks)'}

Notes: "${stripHtml(dayData.notes)}"
Biggest win: "${dayData.reflection?.biggestWin || '(not filled in)'}"
Better tomorrow: "${dayData.reflection?.betterTomorrow || '(not filled in)'}"
Self-rating: ${dayData.reflection?.selfRating || 'none'}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as AiRating;
    parsed.score = Math.max(1, Math.min(10, Math.round(parsed.score ?? 5)));
    return parsed;
  } catch {
    return null;
  }
};

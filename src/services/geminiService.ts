import { GoogleGenAI } from '@google/genai';
import type { AiRating, DayData, Quote } from '../types';
import { DEFAULT_AI_RATING_PROMPT, QUOTE_GENERATION_PROMPT } from '../constants';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateDailyQuote = async (): Promise<Quote | null> => {
  if (!apiKey) return null;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: QUOTE_GENERATION_PROMPT,
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as Quote;
  } catch {
    return null;
  }
};

export const generateDayRating = async (dayData: DayData): Promise<AiRating | null> => {
  if (!apiKey) return null;
  const todoListText = dayData.todos
    .map(t => `- ${t.text} (${t.completed ? 'Done' : 'Open'})`)
    .join('\n');

  const prompt = `
    ${DEFAULT_AI_RATING_PROMPT}

    Day data:
    - Daily Focus: "${dayData.focus}"
    - Focus achieved: ${dayData.reflection?.focusAchieved ? 'Yes' : 'No'}
    - Habits: ${dayData.habits.filter(h => h.completed).length} of ${dayData.habits.length} done.

    TODO LIST (please analyze feasibility/size):
    ${todoListText}

    Notes: "${dayData.notes}"
    Biggest win: "${dayData.reflection?.biggestWin}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as AiRating;
  } catch {
    return null;
  }
};

export const getStoicChatResponse = async (userMessage: string, quote: Quote): Promise<string> => {
  if (!apiKey) return "I can't respond right now (no API key configured).";
  const prompt = `
    You are a pragmatic coach.
    Today's quote was: "${quote.text}" by ${quote.author}.
    Explanation: "${quote.explanation}".

    The user asks: "${userMessage}"

    Respond briefly, motivating and action-oriented in English.
    No long philosophical treatises. Focus on practical everyday implementation.
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Sorry, I couldn't find a response.";
  } catch {
    return 'An error occurred.';
  }
};

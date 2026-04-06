/**
 * Gemini Client
 * Google Gemini Flash를 사용한 무료 Extract/Score 엔진.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { countWords } from './word-count';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const geminiFlash = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/**
 * Gemini에게 JSON 응답을 요청하는 헬퍼
 */
export async function geminiJsonCall<T>(
  systemPrompt: string,
  userMessage: string,
): Promise<T | null> {
  try {
    const result = await geminiFlash.generateContent({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const text = result.response.text();
    return JSON.parse(text) as T;
  } catch (err) {
    console.error('[gemini] Error:', err);
    return null;
  }
}

export { countWords };

export { buddySystemPrompt } from './buddySystemPrompt.js';
export { speechPrompt } from './speechPrompt.js';
export { documentAnalysisPrompt } from './documentAnalysisPrompt.js';
export { translationPrompt } from './translationPrompt.js';
export { financialAssistantPrompt } from './financialAssistantPrompt.js';
export { codingAssistantPrompt } from './codingAssistantPrompt.js';
export { voiceCallPrompt } from './voiceCallPrompt.js';

import type { AiPersona } from '../../db/schema.js';
import { buddySystemPrompt } from './buddySystemPrompt.js';
import { documentAnalysisPrompt } from './documentAnalysisPrompt.js';
import { translationPrompt } from './translationPrompt.js';
import { financialAssistantPrompt } from './financialAssistantPrompt.js';
import { codingAssistantPrompt } from './codingAssistantPrompt.js';
import { voiceCallPrompt } from './voiceCallPrompt.js';

export type TaskType =
  | 'general'
  | 'document'
  | 'translation'
  | 'financial'
  | 'coding'
  | 'voiceCall';

export interface PromptContext {
  persona: AiPersona;
  task?: TaskType;
}

export function buildTaskPrompt(task: TaskType): string {
  switch (task) {
    case 'document':
      return documentAnalysisPrompt;
    case 'translation':
      return translationPrompt;
    case 'financial':
      return financialAssistantPrompt;
    case 'coding':
      return codingAssistantPrompt;
    case 'voiceCall':
      return voiceCallPrompt;
    default:
      return '';
  }
}

export function buildFullSystemPrompt(ctx: PromptContext): string {
  const base = buddySystemPrompt(ctx.persona);
  const taskPrompt = ctx.task ? buildTaskPrompt(ctx.task) : '';

  if (!taskPrompt) return base;

  return `${base}

---
ADDITIONAL CONTEXT FOR THIS TASK:
${taskPrompt}`;
}

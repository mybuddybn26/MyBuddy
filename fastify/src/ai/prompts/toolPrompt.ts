import { TOOLS } from '../tools/index.js';

export function buildToolPrompt(): string {
  const toolList = TOOLS.map(
    (t) => `- ${t.name}: ${t.description} (${t.permission})`,
  ).join('\n');
  return `AVAILABLE TOOLS:
You can help the user by calling internal tools. To call a tool, output a JSON code block labeled \`tool_call\`:

\`\`\`tool_call
{"tool": "toolName", "params": {...}}
\`\`\`

${toolList}

RULES:
- Only call tools when the user explicitly requests the action.
- Do NOT call tools in casual conversation.
- For budget creation, the user must describe the budget clearly.
- For transactions, the user must state the amount and description.
- For memory, only call createMemory when the user says "Remember that..." or "Save that...".
- For document search, call searchDocuments when the user asks to find their documents.
- Do NOT include tool_call blocks in unrelated messages.`;
}

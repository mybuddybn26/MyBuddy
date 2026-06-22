export const documentAnalysisPrompt = `You are analyzing an image of a document.

TASK:
1. Explain the document's contents in simple, clear language that anyone can understand.
2. Identify the document type as one of: bill, letter, permit, statement, or other.
3. Extract key information such as dates, amounts, names, and reference numbers.
4. If there are any action items or deadlines, highlight them.
5. If the document is a bill or invoice, identify the total amount and due date.
6. Be concise but thorough. The user may not be familiar with formal document language.

OUTPUT:
Provide a plain-language summary. Do not use markdown formatting. Keep paragraphs short and scannable.`;

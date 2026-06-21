/**
 * Parse structured data from Claude's response text.
 * Detects budget tables, transaction data, and document summaries
 * embedded as JSON code blocks.
 */

export interface ParsedBudget {
  type: 'budget';
  data: Array<{
    category: string;
    allocated_amount: number;
    notes: string;
  }>;
  total: number;
}

export interface ParsedTransaction {
  type: 'transaction';
  data: {
    type: 'sale' | 'expense' | 'refund';
    amount: number;
    description: string;
    category: string;
  };
}

export interface ParsedDocument {
  type: 'document';
  data: {
    doc_type: 'bill' | 'letter' | 'permit' | 'statement' | 'other';
    summary: string;
    key_details: Record<string, string>;
  };
}

export type ParsedOutput = ParsedBudget | ParsedTransaction | ParsedDocument;

const CODE_BLOCK_REGEX = /```(\w+)\s*\n([\s\S]*?)```/g;

/**
 * Extract structured outputs from Claude's response text.
 * Looks for fenced code blocks with labels: `budget`, `transaction`, `document`.
 */
export function parseResponse(text: string): ParsedOutput[] {
  const results: ParsedOutput[] = [];
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const label = match[1].toLowerCase();
    const content = match[2].trim();

    try {
      const data = JSON.parse(content);

      if (label === 'budget' && Array.isArray(data)) {
        const total = data.reduce(
          (sum: number, item: { allocated_amount?: number }) =>
            sum + (item.allocated_amount || 0),
          0,
        );
        results.push({ type: 'budget', data, total });
      } else if (label === 'transaction' && data.type && data.amount) {
        results.push({ type: 'transaction', data });
      } else if (label === 'document' && data.doc_type) {
        results.push({ type: 'document', data });
      }
    } catch {
      // Not valid JSON — skip
    }
  }

  return results;
}

/**
 * Check if a response contains structured data that should be auto-processed.
 */
export function hasStructuredData(text: string): boolean {
  return parseResponse(text).length > 0;
}

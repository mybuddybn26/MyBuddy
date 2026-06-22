export function formatForSpeech(text: string): string {
  let result = text;

  // Remove code blocks (fenced and indented)
  result = result.replace(/```[\s\S]*?```/g, '');
  result = result.replace(/`([^`]+)`/g, '$1');

  // Convert markdown headings to plain speech pauses
  result = result.replace(/^#{1,6}\s+(.*)/gm, '$1. ');

  // Convert bold/italic markers
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  result = result.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');
  result = result.replace(/~{2}([^~]+)~{2}/g, '$1');

  // Convert list markers to natural pauses
  result = result.replace(/^[\s]*[-*+]\s+/gm, '');
  result = result.replace(/^\d+\.\s+/gm, '');

  // Remove markdown links, keep text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove blockquote markers
  result = result.replace(/^>\s?/gm, '');

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, '');

  // Remove HTML tags
  result = result.replace(/<[^>]*>/g, '');

  // Normalize whitespace: multiple newlines → single pause
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/\n/g, '. ');

  // Collapse multiple spaces
  result = result.replace(/[ \t]+/g, ' ');

  // Collapse multiple periods
  result = result.replace(/\.{3,}/g, '.');

  // Remove stray formatting symbols while preserving sentence structure
  result = result.replace(/([.!?])\./g, '$1');

  // Expand common abbreviations
  result = result.replace(/\be\.g\.\s/g, 'for example, ');
  result = result.replace(/\bi\.e\.\s/g, 'that is, ');
  result = result.replace(/\betc\.\s/g, 'and so on. ');
  result = result.replace(/\bw\/(\s|$)/g, 'with$1');
  result = result.replace(/\bw\/o\b/g, 'without');

  // Remove currency symbols for speech, keep numbers
  // Keep $ for ElevenLabs to handle naturally

  // Remove emojis and special unicode
  result = result.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    '',
  );

  // Trim and ensure proper ending
  result = result.trim();
  if (result && !/[.!?]$/.test(result)) {
    result += '.';
  }

  return result;
}

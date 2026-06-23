// Brunei Malay heuristic detector — lightweight keyword scoring
// Used to auto-detect whether user input is Brunei Malay for automatic provider routing.

const BRUNEI_SIGNALS = [
  // High-confidence words (rare outside Brunei Malay)
  'awu',
  'cematu',
  'mcm atu',
  'lapas atu',
  'bisai',
  'banar',
  'cali',
  'pulang',
  'karang',
  'damit',
  'kitani',
  // Medium-confidence words
  'inda',
  'ani',
  'atu',
  'urang',
  'ku ',
  ' aku ',
  ' kau ',
  'tani',
  'bah ',
  ' bah',
  // Phrases
  'kan buat',
  'arah tiktok',
  'arah sana',
  'sanang',
  'payah',
  'buleh',
];

const MIN_SIGNALS = 2; // Minimum unique matches to flag as Brunei Malay
const HIGH_CONFIDENCE_THRESHOLD = 3; // If 3+ signals, treat as strong Brunei Malay
const ENGLISH_OVERRIDE =
  /\b(reply in english|speak english|in english please)\b/i;

export interface DetectionResult {
  isBruneiMalay: boolean;
  confidence: 'high' | 'medium' | 'none';
  signalCount: number;
  signalsFound: string[];
}

export function detectBruneiMalay(text: string): DetectionResult {
  const lower = text.toLowerCase();

  // Explicit English override
  if (ENGLISH_OVERRIDE.test(lower)) {
    return {
      isBruneiMalay: false,
      confidence: 'none',
      signalCount: 0,
      signalsFound: [],
    };
  }

  const signalsFound: string[] = [];
  const seen = new Set<string>();

  for (const signal of BRUNEI_SIGNALS) {
    if (lower.includes(signal) && !seen.has(signal)) {
      seen.add(signal);
      signalsFound.push(signal);
    }
  }

  if (signalsFound.length < MIN_SIGNALS) {
    return {
      isBruneiMalay: false,
      confidence: 'none',
      signalCount: signalsFound.length,
      signalsFound,
    };
  }

  const confidence =
    signalsFound.length >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium';

  return {
    isBruneiMalay: true,
    confidence,
    signalCount: signalsFound.length,
    signalsFound,
  };
}

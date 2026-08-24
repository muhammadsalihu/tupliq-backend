/**
 * Tolerant JSON extraction from LLM responses.
 * Models occasionally wrap JSON in markdown fences or prose despite
 * instructions — this recovers the payload without blindly trusting it.
 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();

  // Direct parse first.
  try {
    return JSON.parse(text);
  } catch {
    // fall through to recovery strategies
  }

  // Strip markdown code fences and retry.
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    // fall through
  }

  // Grab the outermost {...} or [...] block.
  const candidates = [
    sliceBetween(text, '{', '}'),
    sliceBetween(text, '[', ']'),
    sliceBetween(unfenced, '{', '}'),
    sliceBetween(unfenced, '[', ']'),
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error('Model response did not contain valid JSON');
}

function sliceBetween(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

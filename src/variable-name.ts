/**
 * Variable names are opaque Unicode text. Only control characters, line separators and the
 * literal marker terminator are forbidden after trimming the established Python padding set.
 */
const PYTHON_WHITESPACE_SOURCE =
  '\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';

// JavaScript's \s and String.trim() differ from Python's whitespace definition: notably,
// Python includes U+0085 and U+001C–001F but keeps U+FEFF as part of a name. Use one explicit
// set for the name, marker padding and normalization so keys survive the browser/server trip.
const CONTROL_SOURCE = '\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029';
const NAME_CHARACTER_SOURCE = `(?:(?!\\}\\})[^${CONTROL_SOURCE}])`;
const NAME_EDGE_SOURCE = `(?:(?!\\}\\})[^${CONTROL_SOURCE}${PYTHON_WHITESPACE_SOURCE}])`;
export const VARIABLE_NAME_SOURCE = `${NAME_EDGE_SOURCE}(?:${NAME_CHARACTER_SOURCE}*?${NAME_EDGE_SOURCE})?`;
const PADDING_SOURCE = `[${PYTHON_WHITESPACE_SOURCE}]*`;
const PADDING = new RegExp(
  `^[${PYTHON_WHITESPACE_SOURCE}]+|[${PYTHON_WHITESPACE_SOURCE}]+$`,
  'gu'
);

/** A variable reference, with its normalized name in the first capture group. */
export const VARIABLE_REFERENCE_SOURCE = `\\{\\{${PADDING_SOURCE}(${VARIABLE_NAME_SOURCE})${PADDING_SOURCE}\\}\\}`;

/** The assignment marker at the beginning of an interaction. */
export const VARIABLE_ASSIGNMENT_SOURCE = `%${VARIABLE_REFERENCE_SOURCE}`;

// Syntax-only source used when claiming the whole marker before validating its body. It must
// stop at the first literal `}}`, even if the body is invalid or contains another `{{`.
export const RAW_VARIABLE_BODY_SOURCE = '(?:(?!\\}\\})[\\s\\S])*';
export const RAW_VARIABLE_MARKER_SOURCE = `\\{\\{${RAW_VARIABLE_BODY_SOURCE}\\}\\}`;

const VARIABLE_NAME = new RegExp(`^${VARIABLE_NAME_SOURCE}$`, 'u');

/** Trim marker padding without changing a name's punctuation, case or Unicode. */
export const normalizeVariableName = (raw: string): string | null => {
  const name = raw.replace(PADDING, '');
  return VARIABLE_NAME.test(name) ? name : null;
};

/** Whether a name, after trimming marker padding, follows the shared grammar. */
export const isValidVariableName = (raw: string): boolean =>
  normalizeVariableName(raw) !== null;

/** Create an independent expression matcher so callers never share a regex's lastIndex. */
export const createVariableExpressionRegex = (flags = 'g'): RegExp =>
  new RegExp(VARIABLE_REFERENCE_SOURCE, flags);

export interface VariableMarker {
  start: number;
  end: number;
  rawName: string;
  name: string | null;
}

/** Read exactly one marker at `start`; invalid bodies are still one indivisible token. */
export const readVariableMarker = (
  text: string,
  start = 0
): VariableMarker | null => {
  if (!Number.isInteger(start) || start < 0 || !text.startsWith('{{', start))
    return null;
  const close = text.indexOf('}}', start + 2);
  if (close < 0) return null;
  const rawName = text.slice(start + 2, close);
  return {
    start,
    end: close + 2,
    rawName,
    name: normalizeVariableName(rawName),
  };
};

/** Scan raw markers once, without treating an opening brace inside a key as another marker. */
export const findVariableMarkers = (text: string): VariableMarker[] => {
  const markers: VariableMarker[] = [];
  let cursor = 0;
  for (;;) {
    const start = text.indexOf('{{', cursor);
    if (start < 0) return markers;
    const marker = readVariableMarker(text, start);
    if (!marker) return markers;
    markers.push(marker);
    cursor = marker.end;
  }
};

/** Padding keeps a final single `}` in the name separate from the closing `}}`. */
export const formatVariableReference = (raw: string): string | null => {
  const name = normalizeVariableName(raw);
  return name === null ? null : `{{ ${name} }}`;
};

/** Serialize a valid assignment marker with the same padding as an ordinary reference. */
export const formatVariableAssignment = (raw: string): string | null => {
  const reference = formatVariableReference(raw);
  return reference === null ? null : `%${reference}`;
};

/** Collect unique names in source order, including assignment and ordinary reference markers. */
export const extractVariableNames = (text: string): string[] => {
  const names = new Set<string>();
  for (const marker of findVariableMarkers(text)) {
    if (marker.name !== null) names.add(marker.name);
  }
  return [...names];
};

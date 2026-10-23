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
export const VARIABLE_PADDING_SOURCE = `[${PYTHON_WHITESPACE_SOURCE}]*`;

const isPaddingCode = (code: number): boolean =>
  (code >= 0x09 && code <= 0x0d) ||
  (code >= 0x1c && code <= 0x20) ||
  code === 0x85 ||
  code === 0xa0 ||
  code === 0x1680 ||
  (code >= 0x2000 && code <= 0x200a) ||
  code === 0x2028 ||
  code === 0x2029 ||
  code === 0x202f ||
  code === 0x205f ||
  code === 0x3000;

/** Trim only the established Python padding set, in linear time; U+FEFF is preserved. */
export const trimVariablePadding = (raw: string): string => {
  let start = 0;
  let end = raw.length;
  while (start < end && isPaddingCode(raw.charCodeAt(start))) start += 1;
  while (end > start && isPaddingCode(raw.charCodeAt(end - 1))) end -= 1;
  return raw.slice(start, end);
};

/** A variable reference, with its normalized name in the first capture group. */
export const VARIABLE_REFERENCE_SOURCE = `\\{\\{${VARIABLE_PADDING_SOURCE}(${VARIABLE_NAME_SOURCE})${VARIABLE_PADDING_SOURCE}\\}\\}`;

/** The assignment marker at the beginning of an interaction. */
export const VARIABLE_ASSIGNMENT_SOURCE = `%${VARIABLE_REFERENCE_SOURCE}`;

// Syntax-only source used when claiming the whole marker before validating its body. It must
// stop at the first literal `}}`, even if the body is invalid or contains another `{{`.
export const RAW_VARIABLE_BODY_SOURCE = '(?:(?!\\}\\})[\\s\\S])*';
export const RAW_VARIABLE_MARKER_SOURCE = `\\{\\{${RAW_VARIABLE_BODY_SOURCE}\\}\\}`;

/** Trim marker padding without changing a name's punctuation, case or Unicode. */
export const normalizeVariableName = (raw: string): string | null => {
  const name = trimVariablePadding(raw);
  if (!name) return null;
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code === 0x7d && name.charCodeAt(index + 1) === 0x7d)
    )
      return null;
  }
  return name;
};

/** Whether a name, after trimming marker padding, follows the shared grammar. */
export const isValidVariableName = (raw: string): boolean =>
  normalizeVariableName(raw) !== null;

/**
 * Create an independent valid-token matcher. Anchor its source when validating a complete
 * token; scan arbitrary documents with findVariableMarkers instead of a restarting regex.
 */
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

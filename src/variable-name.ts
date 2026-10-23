/**
 * Variable names share the teaching engine's existing grammar: one or more characters other
 * than Python whitespace or braces. Punctuation and Unicode are kept exactly as written.
 */
const PYTHON_WHITESPACE_SOURCE =
  '\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';

// JavaScript's \s and String.trim() differ from Python's whitespace definition: notably,
// Python includes U+0085 and U+001C–001F but keeps U+FEFF as part of a name. Use one explicit
// set for the name, marker padding and normalization so keys survive the browser/server trip.
export const VARIABLE_NAME_SOURCE = `[^{}${PYTHON_WHITESPACE_SOURCE}]+`;
const PADDING_SOURCE = `[${PYTHON_WHITESPACE_SOURCE}]*`;
const PADDING = new RegExp(
  `^[${PYTHON_WHITESPACE_SOURCE}]+|[${PYTHON_WHITESPACE_SOURCE}]+$`,
  'gu'
);

/** A variable reference, with its normalized name in the first capture group. */
export const VARIABLE_REFERENCE_SOURCE = `\\{\\{${PADDING_SOURCE}(${VARIABLE_NAME_SOURCE})${PADDING_SOURCE}\\}\\}`;

/** The assignment marker at the beginning of an interaction. */
export const VARIABLE_ASSIGNMENT_SOURCE = `%${VARIABLE_REFERENCE_SOURCE}`;

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

/** Collect unique names in source order, including assignment and ordinary reference markers. */
export const extractVariableNames = (text: string): string[] => {
  const names = new Set<string>();
  for (const match of text.matchAll(createVariableExpressionRegex('gu'))) {
    names.add(match[1]);
  }
  return [...names];
};

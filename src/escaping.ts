/**
 * Backslash escapes for the delimiters inside an interaction's brackets.
 *
 * `?[A|B]` gives `|`, `//`, `...` and `]` structural meaning, so option text that contains one of
 * them is reshaped: a bar splits one choice into two, a double slash gives half the display away
 * to the stored value, an ellipsis turns the rest into a text box, and a bracket ends the
 * interaction early. An option carrying a URL or a regular expression could not be written at all.
 *
 * A backslash before one of those characters now makes it ordinary text.
 *
 * The escape is deliberately *selective*: a backslash is an escape only when the character after
 * it is a delimiter, and is literal text everywhere else. `\\` is not an escape either. That
 * matters for content that already exists: of 110,685 interactions in published courses, 97
 * contain a backslash and every one of them is LaTeX -- `$\pi_\theta$`, `\beta`, `\nabla`, and
 * `\\` as a line break. A general "backslash escapes the next character" rule would render those
 * as `$pi_theta$`. Under this rule, none of them change.
 *
 * The cost is that a literal backslash cannot sit immediately before a literal delimiter: `\|` is
 * an escaped bar, not a backslash and a separator.
 *
 * This mirrors `markdown_flow/escaping.py` in markdown-flow-agent-py character for character.
 * The two must agree: the backend renders an interaction, parses its own output with the Python
 * parser to prove the meaning survived, and then this parser is what the browser reads it with.
 */

/** The characters a backslash may make ordinary. `/` covers `//`, `.` covers `...`. */
export const ESCAPABLE = '|/.]';

/** Whether the backslash at `index` escapes the character after it. */
export const isEscape = (text: string, index: number): boolean =>
  index + 1 < text.length &&
  text[index] === '\\' &&
  ESCAPABLE.includes(text[index + 1]);

/**
 * Make `text` safe to write inside `?[...]`, keeping every character it has.
 *
 * A dot is escaped only inside a run of three or more, because only `...` is a delimiter and a
 * single period ends most sentences: escaping every one turns `Yes, I agree.` into
 * `Yes, I agree\.` in everything that stores or shows the raw interaction. Two dots cannot become
 * three on their own, and the run is escaped whole so it cannot be read as one.
 *
 * Bars, brackets and slashes are escaped wherever they appear. They are rare in option text, and
 * escaping them unconditionally removes the need to reason about what a neighbouring character
 * might combine with once the option is written next to a separator.
 *
 * Escaping the delimiters rather than the backslashes as well is what keeps existing content
 * readable: a script that writes `$\pi$` in an option still writes `$\pi$` afterwards.
 */
export const escapeInteractionText = (text: string): string => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '.') {
      let run = 0;
      while (text[index + run] === '.') {
        run += 1;
      }
      out += run >= 3 ? '\\.'.repeat(run) : '.'.repeat(run);
      index += run;
      continue;
    }
    if (ESCAPABLE.includes(char)) {
      out += '\\';
    }
    out += char;
    index += 1;
  }
  return out;
};

/** Resolve the escapes in one option's text, leaving every other backslash alone. */
export const unescapeInteractionText = (text: string): string => {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (isEscape(text, index)) {
      out += text[index + 1];
      index += 2;
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
};

/**
 * Index of the first `needle` that is not escaped and does not begin inside an escape, or -1.
 *
 * `needle` is matched whole: a `//` whose first slash is escaped is not a separator even though
 * its second slash is bare, because that second slash is the escaped character of the pair.
 */
export const findUnescaped = (
  text: string,
  needle: string,
  start = 0
): number => {
  let index = start;
  while (index < text.length) {
    if (isEscape(text, index)) {
      index += 2;
      continue;
    }
    if (text.startsWith(needle, index)) {
      return index;
    }
    index += 1;
  }
  return -1;
};

/** Split on every unescaped `separator`, leaving the escapes themselves in place. */
export const splitUnescaped = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  for (;;) {
    const found = findUnescaped(text, separator, start);
    if (found < 0) {
      parts.push(text.slice(start));
      return parts;
    }
    parts.push(text.slice(start, found));
    start = found + separator.length;
  }
};

/** Split on unescaped single bars, leaving `||` joined as the multi-select separator. */
export const splitOnSingleUnescapedPipe = (text: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    if (isEscape(text, index)) {
      index += 2;
      continue;
    }
    if (text[index] === '|') {
      if (text.startsWith('||', index)) {
        index += 2;
        continue;
      }
      if (index > 0 && text[index - 1] === '|' && !isEscape(text, index - 1)) {
        index += 1;
        continue;
      }
      parts.push(text.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  parts.push(text.slice(start));
  return parts;
};

/**
 * Split an interaction's content at the `...` that opens its text box, or null.
 *
 * Two details are inherited rather than chosen, because changing either would rewrite questions
 * in courses that are already published:
 *
 * - the ellipsis counts only on the first line. The regex this replaces was anchored and its `.`
 *   did not cross a newline, so `A\n| ...hint` has always been read as two buttons, one of them
 *   named `...hint`.
 * - the *first* ellipsis on that line wins, which is what the lazy group matched. (The Python
 *   parser takes the last one instead -- a difference that predates escapes and is left alone
 *   here; with options escaping their own dots, only the real marker is ever unescaped, so the
 *   two agree on everything a producer writes.)
 *
 * What is new is only that an escaped ellipsis no longer counts.
 */
export const splitOnEllipsis = (content: string): [string, string] | null => {
  const head = content.split('\n', 1)[0];
  const at = findUnescaped(head, '...');
  if (at < 0) {
    return null;
  }
  return [head.slice(0, at), head.slice(at + 3)];
};

/**
 * The bracket content of an interaction, as a regex source fragment.
 *
 * The three alternatives are mutually exclusive on purpose: a backslash before a delimiter can
 * only be read as an escape, so the pattern cannot backtrack into reading it as plain text and
 * then closing on the very bracket it escapes. Without that, this regex and a left-to-right
 * scanner disagree about `?[a\\]`, and two parsers of one grammar must not.
 */
export const INTERACTION_CONTENT_SOURCE =
  '(?:\\\\[|/.\\]]|\\\\(?![|/.\\]])|[^\\]\\\\])*';

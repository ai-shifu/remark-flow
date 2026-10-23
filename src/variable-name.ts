export * from './variable-marker';

import { readInteraction } from './escaping';
import { readVariableMarker, VariableMarker } from './variable-marker';

interface LiteralSpan {
  bodyStart: number;
  bodyEnd: number;
  end: number;
}

interface DocumentLine {
  start: number;
  contentEnd: number;
  end: number;
}

/** Keep original UTF-16 offsets while recognizing every Markdown line ending. */
function documentLines(text: string): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let start = 0;
  for (const ending of text.matchAll(/\r\n|[\r\n]/g)) {
    const contentEnd = ending.index ?? 0;
    const end = contentEnd + ending[0].length;
    lines.push({ start, contentEnd, end });
    start = end;
  }
  lines.push({ start, contentEnd: text.length, end: text.length });
  return lines;
}

function containingLine(
  lines: readonly DocumentLine[],
  offset: number
): number {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].start <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

const HTML_SPACE = /[\t\n\f\r ]/;
const RESOURCE_SPACE = /[\t\n\r ]/;
const MARKDOWN_PUNCTUATION = /[!-/:-@[-`{-~]/;
const MAX_LINK_DESTINATION_DEPTH = 32;
const ATX_HEADING_LINE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const INLINE_CODE_BREAK_LINE =
  /^[ \t]*\r?$|^ {0,3}(?:`{3,}[^`\r\n]*|~{3,}[^\r\n]*)\r?$/;

/** @internal Shared document/flow boundary for an unfinished inline code span. */
export const isInlineCodeBoundaryLine = (line: string): boolean =>
  INLINE_CODE_BREAK_LINE.test(line) || ATX_HEADING_LINE.test(line);

/** Reuse failed suffix searches across malformed literal candidates in one document. */
function findClosing(
  text: string,
  closing: string,
  from: number,
  missingClosers: Map<string, number>
): number {
  const missingFrom = missingClosers.get(closing);
  if (missingFrom !== undefined && from >= missingFrom) return -1;
  const end = text.indexOf(closing, from);
  if (end < 0) missingClosers.set(closing, from);
  return end;
}

/** Read a complete HTML token, using CommonMark's tag and attribute name shapes. */
function htmlLiteralEnd(
  text: string,
  start: number,
  missingClosers: Map<string, number>
): number | null {
  for (const [opening, closing] of [
    ['<!--', '-->'],
    ['<![CDATA[', ']]>'],
    ['<?', '?>'],
  ]) {
    if (text.startsWith(opening, start)) {
      const end = findClosing(
        text,
        closing,
        start + opening.length,
        missingClosers
      );
      return end < 0 ? null : end + closing.length;
    }
  }
  if (/^<![A-Za-z]/.test(text.slice(start, start + 3))) {
    const end = findClosing(text, '>', start + 3, missingClosers);
    return end < 0 ? null : end + 1;
  }
  let cursor = start + 1;
  const closingTag = text[cursor] === '/';
  if (closingTag) cursor++;
  const tagName = /[A-Za-z][A-Za-z0-9-]*/y;
  tagName.lastIndex = cursor;
  if (!tagName.exec(text)) return null;
  cursor = tagName.lastIndex;
  for (;;) {
    const beforePadding = cursor;
    while (cursor < text.length && HTML_SPACE.test(text[cursor])) cursor++;
    if (text[cursor] === '>') return cursor + 1;
    if (!closingTag && text.startsWith('/>', cursor)) return cursor + 2;
    if (closingTag || cursor === beforePadding) return null;
    const attribute = /[A-Za-z_:][A-Za-z0-9_.:-]*/y;
    attribute.lastIndex = cursor;
    if (!attribute.exec(text)) return null;
    cursor = attribute.lastIndex;
    const afterName = cursor;
    while (cursor < text.length && HTML_SPACE.test(text[cursor])) cursor++;
    if (text[cursor] !== '=') {
      cursor = afterName;
      continue;
    }
    cursor++;
    while (cursor < text.length && HTML_SPACE.test(text[cursor])) cursor++;
    const quote = text[cursor];
    if (quote === '"' || quote === "'") {
      const end = findClosing(text, quote, cursor + 1, missingClosers);
      if (end < 0) return null;
      cursor = end + 1;
    } else {
      const valueStart = cursor;
      while (cursor < text.length && !/[\t\n\f\r "'=<>`]/.test(text[cursor]))
        cursor++;
      if (cursor === valueStart) return null;
    }
  }
}

/** Bound indented code to its last nonblank indented line, leaving trailing blanks outside. */
function indentedCodeEnd(
  text: string,
  lines: readonly DocumentLine[],
  index: number
): number | null {
  if (index > 0) {
    const previous = lines[index - 1];
    if (!/^[\t ]*$/.test(text.slice(previous.start, previous.contentEnd)))
      return null;
  }
  let lastContentEnd: number | null = null;
  for (; index < lines.length; index++) {
    const { start, contentEnd } = lines[index];
    const line = text.slice(start, contentEnd);
    if (/^[\t ]*$/.test(line)) {
      if (lastContentEnd === null) return null;
    } else {
      let columns = 0;
      for (const character of line) {
        if (columns >= 4) break;
        if (character === ' ') columns++;
        else if (character === '\t') columns += 4 - (columns % 4);
        else break;
      }
      if (columns < 4) return lastContentEnd;
      lastContentEnd = contentEnd;
    }
  }
  return lastContentEnd;
}

function rawHtmlOpening(
  text: string,
  start: number,
  missingClosers: Map<string, number>
): { name: string; end: number } | null {
  const opening = /^ {0,3}<(script|style|pre|textarea)(?=[\t\n\f\r >])/i.exec(
    text.slice(start, start + 16)
  );
  if (!opening) return null;
  const end = htmlLiteralEnd(
    text,
    start + opening[0].indexOf('<'),
    missingClosers
  );
  return end === null ? null : { name: opening[1], end };
}

/** Preserve the opening token's attribute scope separately from a raw-text HTML body. */
function rawHtmlSpan(
  text: string,
  start: number,
  missingClosers: Map<string, number>,
  lines: readonly DocumentLine[]
): LiteralSpan | null {
  const opening = rawHtmlOpening(text, start, missingClosers);
  if (!opening) return null;
  const closing = new RegExp(`</${opening.name}[ \\t\\r\\n]*>`, 'gi');
  closing.lastIndex = opening.end;
  const matched = closing.exec(text);
  const closingEnd = matched ? matched.index + matched[0].length : text.length;
  const end = lines[containingLine(lines, closingEnd)].contentEnd;
  return { bodyStart: opening.end, bodyEnd: end, end };
}

/** A blank line ends complete inline resources and inline math/code paragraphs. */
function blankLineAfter(text: string, cursor: number): boolean {
  if (text[cursor] !== '\n' && text[cursor] !== '\r') return false;
  let next =
    cursor + (text[cursor] === '\r' && text[cursor + 1] === '\n' ? 2 : 1);
  while (text[next] === ' ' || text[next] === '\t') next++;
  return text[next] === '\n' || text[next] === '\r';
}

/** Read only a complete link resource after a previously matched label. */
function linkResourceEnd(text: string, start: number): number | null {
  let cursor = start + 1;
  const skipSpace = (): boolean => {
    while (cursor < text.length && RESOURCE_SPACE.test(text[cursor])) {
      if (blankLineAfter(text, cursor)) return false;
      cursor++;
    }
    return true;
  };
  const escaped = () =>
    text[cursor] === '\\' && MARKDOWN_PUNCTUATION.test(text[cursor + 1] ?? '');
  if (!skipSpace()) return null;
  if (text[cursor] === '<') {
    cursor++;
    while (cursor < text.length && text[cursor] !== '>') {
      if (
        text[cursor] === '\n' ||
        text[cursor] === '\r' ||
        text[cursor] === '<'
      )
        return null;
      cursor += escaped() ? 2 : 1;
    }
    if (text[cursor] !== '>') return null;
    cursor++;
  } else {
    let depth = 0;
    while (cursor < text.length && !RESOURCE_SPACE.test(text[cursor])) {
      if (escaped()) cursor += 2;
      else if (text[cursor] === '(') {
        if (++depth > MAX_LINK_DESTINATION_DEPTH) return null;
        cursor++;
      } else if (text[cursor] === ')') {
        if (depth === 0) break;
        depth--;
        cursor++;
      } else {
        const code = text.charCodeAt(cursor);
        if (code < 32 || code === 127) return null;
        cursor++;
      }
    }
    if (depth) return null;
  }
  const destinationEnd = cursor;
  if (!skipSpace()) return null;
  if (text[cursor] === ')') return cursor + 1;
  if (cursor === destinationEnd) return null;
  const quote = text[cursor];
  const closing = quote === '(' ? ')' : quote;
  if (!['"', "'", '('].includes(quote)) return null;
  cursor++;
  while (cursor < text.length && text[cursor] !== closing) {
    if (blankLineAfter(text, cursor)) return null;
    cursor += escaped() ? 2 : 1;
  }
  if (text[cursor] !== closing) return null;
  cursor++;
  if (!skipSpace()) return null;
  return text[cursor] === ')' ? cursor + 1 : null;
}

/** Index same-width code/math closers without pairing across native paragraph boundaries. */
function inlineLiteralSpans(
  text: string,
  delimiter: '`' | '$',
  missingClosers: Map<string, number>,
  lines: readonly DocumentLine[]
): Map<number, LiteralSpan> {
  const spans = new Map<number, LiteralSpan>();
  let segmentStart = 0;
  for (const { start: lineStart, contentEnd: lineEnd, end } of lines) {
    const line = text.slice(lineStart, lineEnd);
    if (ATX_HEADING_LINE.test(line)) {
      indexSegment(segmentStart, lineStart);
      indexSegment(lineStart, lineEnd);
      segmentStart = end;
    } else if (
      isInlineCodeBoundaryLine(line) ||
      rawHtmlOpening(text, lineStart, missingClosers)
    ) {
      indexSegment(segmentStart, lineStart);
      segmentStart = end;
    }
  }
  indexSegment(segmentStart, text.length);
  return spans;

  function indexSegment(start: number, end: number): void {
    const runs = [
      ...text.slice(start, end).matchAll(delimiter === '`' ? /`+/g : /\$+/g),
    ];
    const next = new Map<number, number>();
    for (let index = runs.length - 1; index >= 0; index--) {
      const run = runs[index];
      const opening = start + (run.index ?? 0);
      const size = run[0].length;
      const closing = next.get(size);
      if (closing !== undefined) {
        spans.set(opening, {
          bodyStart: opening + size,
          bodyEnd: closing,
          end: closing + size,
        });
      }
      // Outside code, a backslash may escape the first tick of a run. Its suffix
      // can open a shorter span, while an existing code span still sees the full run.
      let slashes = 0;
      for (let at = opening - 1; at >= 0 && text[at] === '\\'; at--) slashes++;
      const suffixClosing = next.get(size - 1);
      if (slashes % 2 && size > 1 && suffixClosing !== undefined) {
        spans.set(opening + 1, {
          bodyStart: opening + size,
          bodyEnd: suffixClosing,
          end: suffixClosing + size - 1,
        });
      }
      next.set(size, opening);
    }
  }
}

type ContainerStep = { quote: true } | { indent: number };

/** Read the native quote/list prefix of a fenced block without rewriting its source. */
function fenceOpening(line: string): {
  marker: string;
  size: number;
  steps: ContainerStep[];
} | null {
  let cursor = 0;
  const steps: ContainerStep[] = [];
  for (;;) {
    const beforeSpace = cursor;
    while (cursor - beforeSpace < 3 && line[cursor] === ' ') cursor++;
    if (line[cursor] === '>') {
      steps.push({ quote: true });
      cursor++;
      if (line[cursor] === ' ' || line[cursor] === '\t') cursor++;
      continue;
    }
    const list = /^(?:[-+*]|\d{1,9}[.)])(?=[ \t])/.exec(line.slice(cursor));
    if (list) {
      cursor += list[0].length;
      const paddingStart = cursor;
      while (line[cursor] === ' ' || line[cursor] === '\t') cursor++;
      if (cursor - paddingStart > 4) cursor = paddingStart + 1;
      let columns = 0;
      for (const character of line.slice(beforeSpace, cursor))
        columns += character === '\t' ? 4 - (columns % 4) : 1;
      steps.push({ indent: columns });
      continue;
    }
    const fence = /^(`{3,})([^`]*$)|^(~{3,})(.*$)/.exec(line.slice(cursor));
    const run = fence?.[1] ?? fence?.[3];
    return run ? { marker: run[0], size: run.length, steps } : null;
  }
}

function containerContentStart(
  line: string,
  steps: readonly ContainerStep[]
): number | null {
  let cursor = 0;
  for (const step of steps) {
    if ('quote' in step) {
      const beforeSpace = cursor;
      while (cursor - beforeSpace < 3 && line[cursor] === ' ') cursor++;
      if (line[cursor++] !== '>') return null;
      if (line[cursor] === ' ' || line[cursor] === '\t') cursor++;
    } else {
      let columns = 0;
      while (columns < step.indent) {
        if (line[cursor] === ' ') columns++;
        else if (line[cursor] === '\t') columns += 4 - (columns % 4);
        else return null;
        cursor++;
      }
    }
  }
  return cursor;
}

function fencedCodeSpan(
  text: string,
  lines: readonly DocumentLine[],
  index: number
): LiteralSpan | null {
  const openingLine = lines[index];
  const opening = fenceOpening(
    text.slice(openingLine.start, openingLine.contentEnd)
  );
  if (!opening) return null;
  const closing = new RegExp(
    `^ {0,3}${opening.marker}{${opening.size},}[\\t ]*$`
  );
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines[at];
    const value = text.slice(line.start, line.contentEnd);
    const contentStart = containerContentStart(value, opening.steps);
    if (contentStart === null) {
      if (/^[\t ]*$/.test(value)) continue;
      return {
        bodyStart: openingLine.end,
        bodyEnd: line.start,
        end: line.start,
      };
    }
    if (closing.test(value.slice(contentStart)))
      return {
        bodyStart: openingLine.end,
        bodyEnd: line.start,
        end: line.contentEnd,
      };
  }
  return { bodyStart: openingLine.end, bodyEnd: text.length, end: text.length };
}

const HTML_BLOCK_TAGS = new Set(
  'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(
    ' '
  )
);

/** Native ordinary HTML blocks stop at a blank line, after any complete opening token. */
function ordinaryHtmlSpan(
  text: string,
  lines: readonly DocumentLine[],
  index: number,
  missingClosers: Map<string, number>
): LiteralSpan | null {
  const line = lines[index];
  const source = text.slice(line.start, line.contentEnd);
  const tag = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[ \t/>]|$)/.exec(source);
  if (!tag) return null;
  const tokenStart = line.start + source.indexOf('<');
  const tokenEnd = htmlLiteralEnd(text, tokenStart, missingClosers);
  if (!HTML_BLOCK_TAGS.has(tag[1].toLowerCase())) {
    const previous = lines[index - 1];
    if (
      (previous &&
        !/^[\t ]*$/.test(text.slice(previous.start, previous.contentEnd))) ||
      tokenEnd === null ||
      tokenEnd > line.contentEnd ||
      !/^[\t ]*$/.test(text.slice(tokenEnd, line.contentEnd))
    )
      return null;
  }
  const bodyStart = tokenEnd ?? line.start;
  for (
    let at = Math.max(index + 1, containingLine(lines, bodyStart));
    at < lines.length;
    at++
  ) {
    const next = lines[at];
    if (
      next.start >= bodyStart &&
      /^[\t ]*$/.test(text.slice(next.start, next.contentEnd))
    )
      return { bodyStart, bodyEnd: next.start, end: next.start };
  }
  return { bodyStart, bodyEnd: text.length, end: text.length };
}

/**
 * Read document marker ranges in source order, using original UTF-16 source offsets.
 * Complete markers in code/HTML examples retain their names; incomplete markers have `name: null`
 * and end at the literal boundary, or at document EOF for a true unclosed outside marker.
 * Raw readers remain available when the caller needs opaque markers without Markdown context.
 */
export const findDocumentVariableMarkers = (text: string): VariableMarker[] => {
  // Documents without an opening cannot produce a marker or need literal indexes.
  if (!text.includes('{{')) return [];
  const markers: VariableMarker[] = [];
  const missingHtmlClosers = new Map<string, number>();
  const lines = documentLines(text);
  const lineStarts = new Map(lines.map((line, index) => [line.start, index]));
  const inlineSpans = inlineLiteralSpans(text, '`', missingHtmlClosers, lines);
  const mathSpans = inlineLiteralSpans(text, '$', missingHtmlClosers, lines);
  const labels: { image: boolean; active: boolean }[] = [];
  const activeLinkLabels = new Set<{ image: boolean; active: boolean }>();
  const collectLiteral = (start: number, end: number) => {
    const literal = text.slice(start, end);
    let cursor = 0;
    for (;;) {
      const opening = literal.indexOf('{{', cursor);
      if (opening < 0) return;
      const marker = readVariableMarker(literal, opening);
      if (!marker) {
        markers.push({
          start: start + opening,
          end,
          rawName: literal.slice(opening + 2),
          name: null,
        });
        return;
      }
      markers.push({
        ...marker,
        start: start + marker.start,
        end: start + marker.end,
      });
      cursor = marker.end;
    }
  };
  let cursor = 0;
  while (cursor < text.length) {
    const lineIndex = lineStarts.get(cursor);
    if (lineIndex !== undefined) {
      const previous = lines[lineIndex - 1];
      if (
        !previous ||
        /^[\t ]*$/.test(text.slice(previous.start, previous.contentEnd))
      ) {
        labels.length = 0;
        activeLinkLabels.clear();
      }
      const fence = fencedCodeSpan(text, lines, lineIndex);
      if (fence) {
        collectLiteral(cursor, fence.bodyEnd);
        cursor = fence.end;
        continue;
      }
      const indentedEnd = indentedCodeEnd(text, lines, lineIndex);
      if (indentedEnd !== null) {
        collectLiteral(cursor, indentedEnd);
        cursor = indentedEnd;
        continue;
      }
      const rawHtml = rawHtmlSpan(text, cursor, missingHtmlClosers, lines);
      if (rawHtml) {
        collectLiteral(cursor, rawHtml.bodyStart);
        collectLiteral(rawHtml.bodyStart, rawHtml.bodyEnd);
        cursor = rawHtml.end;
        continue;
      }
      const html = ordinaryHtmlSpan(text, lines, lineIndex, missingHtmlClosers);
      if (html) {
        collectLiteral(cursor, html.bodyStart);
        collectLiteral(html.bodyStart, html.bodyEnd);
        cursor = html.end;
        continue;
      }
    }
    // A marker reached first owns its whole body, including any code/HTML-looking text.
    if (text.startsWith('{{', cursor)) {
      const marker = readVariableMarker(text, cursor);
      if (!marker) {
        markers.push({
          start: cursor,
          end: text.length,
          rawName: text.slice(cursor + 2),
          name: null,
        });
        break;
      }
      markers.push(marker);
      cursor = marker.end;
      continue;
    }
    if (text[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    const interaction = readInteraction(text, cursor);
    if (interaction) {
      collectLiteral(
        cursor + 2,
        interaction.end - (interaction.complete ? 1 : 0)
      );
      cursor = interaction.end;
      continue;
    }
    if (text[cursor] === '[') {
      let slashes = 0;
      for (let at = cursor - 2; at >= 0 && text[at] === '\\'; at--) slashes++;
      const label = {
        image: text[cursor - 1] === '!' && slashes % 2 === 0,
        active: true,
      };
      labels.push(label);
      if (!label.image) activeLinkLabels.add(label);
    }
    if (text[cursor] === ']' && labels.length) {
      const label = labels.pop();
      if (label) activeLinkLabels.delete(label);
      if (label?.active && text[cursor + 1] === '(') {
        const end = linkResourceEnd(text, cursor + 1);
        if (end !== null) {
          if (!label.image) {
            // Each non-image ancestor is invalidated at most once; image-only
            // ancestors never need to be rescanned for every following link.
            for (const outer of activeLinkLabels) outer.active = false;
            activeLinkLabels.clear();
          }
          collectLiteral(cursor + 2, end - 1);
          cursor = end;
          continue;
        }
      }
    }
    if (text[cursor] === '$') {
      const span = mathSpans.get(cursor);
      if (span) {
        collectLiteral(span.bodyStart, span.bodyEnd);
        cursor = span.end;
        continue;
      }
      while (text[cursor] === '$') cursor++;
      continue;
    }
    if (text[cursor] === '`' || text[cursor] === '~') {
      const span = text[cursor] === '`' ? inlineSpans.get(cursor) : undefined;
      if (span) {
        collectLiteral(cursor, span.bodyEnd);
        cursor = span.end;
        continue;
      }
      // Only the full opening run can start a span; its suffix is not another opening.
      const character = text[cursor];
      while (text[cursor] === character) cursor++;
      continue;
    }
    if (text[cursor] === '<') {
      const end = htmlLiteralEnd(text, cursor, missingHtmlClosers);
      if (end !== null) {
        collectLiteral(cursor, end);
        cursor = end;
        continue;
      }
    }
    cursor++;
  }
  return markers;
};

/** Collect unique document names in source order, including complete literal example markers. */
export const extractVariableNames = (text: string): string[] => {
  const names = new Set<string>();
  for (const marker of findDocumentVariableMarkers(text)) {
    if (marker.name !== null) names.add(marker.name);
  }
  return [...names];
};

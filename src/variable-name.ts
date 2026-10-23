export * from './variable-marker';

import { readDocumentInteraction } from './escaping';
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

/** Store only line starts; line objects are temporary views, never retained per input line. */
class DocumentLines {
  private readonly starts: Uint32Array;

  constructor(private readonly text: string) {
    let count = 1;
    for (let at = 0; at < text.length; at++) {
      if (text[at] === '\r') {
        count++;
        if (text[at + 1] === '\n') at++;
      } else if (text[at] === '\n') count++;
    }
    this.starts = new Uint32Array(count);
    let index = 1;
    for (let at = 0; at < text.length; at++) {
      if (text[at] === '\r') {
        if (text[at + 1] === '\n') at++;
        this.starts[index++] = at + 1;
      } else if (text[at] === '\n') this.starts[index++] = at + 1;
    }
  }

  get length(): number {
    return this.starts.length;
  }
  start(index: number): number {
    return this.starts[index];
  }

  at(index: number): DocumentLine {
    const start = this.starts[index];
    const end = this.starts[index + 1] ?? this.text.length;
    let contentEnd = end;
    if (index + 1 < this.starts.length) {
      contentEnd--;
      if (this.text[contentEnd] === '\n' && this.text[contentEnd - 1] === '\r')
        contentEnd--;
    }
    return { start, contentEnd, end };
  }
}

function containingLine(lines: DocumentLines, offset: number): number {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines.start(middle) <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

const HTML_SPACE = /[\t\n\f\r ]/;
const RESOURCE_SPACE = /[\t\n\r ]/;
const MARKDOWN_PUNCTUATION = /[!-/:-@[-`{-~]/;
const MAX_LINK_DESTINATION_DEPTH = 32;
const ATX_HEADING_LINE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const THEMATIC_BREAK_LINE =
  /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT_UNDERLINE_LINE = /^ {0,3}(?:=+|-+)[\t ]*$/;
const CONTAINER_INTERRUPT_LINE = /^ {0,3}(?:>|(?:[-+*]|1[.)])[ \t]+[^ \t])/;
const INLINE_CODE_BREAK_LINE =
  /^[ \t]*\r?$|^ {0,3}(?:`{3,}[^`\r\n]*|~{3,}[^\r\n]*)\r?$/;

/** @internal Shared document/flow boundary for an unfinished inline code span. */
export const isInlineCodeBoundaryLine = (line: string): boolean =>
  INLINE_CODE_BREAK_LINE.test(line) ||
  ATX_HEADING_LINE.test(line) ||
  SETEXT_UNDERLINE_LINE.test(line) ||
  THEMATIC_BREAK_LINE.test(line) ||
  CONTAINER_INTERRUPT_LINE.test(line) ||
  ordinaryHtmlInterrupt(line);

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
  lines: DocumentLines,
  index: number,
  followsBlock: boolean
): number | null {
  if (index > 0 && !followsBlock) return null;
  let lastContentEnd: number | null = null;
  for (; index < lines.length; index++) {
    const { start, contentEnd } = lines.at(index);
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
  lines: DocumentLines
): LiteralSpan | null {
  const opening = rawHtmlOpening(text, start, missingClosers);
  if (!opening) return null;
  const closing = new RegExp(`</${opening.name}[ \\t\\r\\n]*>`, 'gi');
  closing.lastIndex = opening.end;
  const matched = closing.exec(text);
  const closingEnd = matched ? matched.index + matched[0].length : text.length;
  const end = lines.at(containingLine(lines, closingEnd)).contentEnd;
  return { bodyStart: opening.end, bodyEnd: end, end };
}

/** Comments, instructions, declarations and CDATA keep their whole closing line literal. */
function terminatedHtmlBlockSpan(
  text: string,
  start: number,
  missingClosers: Map<string, number>,
  lines: DocumentLines
): LiteralSpan | null {
  const opening = /^ {0,3}<(?:!--|\?|!\[CDATA\[|![A-Z])/.exec(
    text.slice(start, start + 12)
  );
  if (!opening) return null;
  const tokenEnd = htmlLiteralEnd(
    text,
    start + opening[0].indexOf('<'),
    missingClosers
  );
  if (tokenEnd === null) return null;
  const end = lines.at(containingLine(lines, tokenEnd)).contentEnd;
  return { bodyStart: tokenEnd, bodyEnd: end, end };
}

/** A blank line ends complete inline resources and inline math/code paragraphs. */
function blankLineAfter(text: string, cursor: number): boolean {
  if (text[cursor] !== '\n' && text[cursor] !== '\r') return false;
  let next =
    cursor + (text[cursor] === '\r' && text[cursor + 1] === '\n' ? 2 : 1);
  while (text[next] === ' ' || text[next] === '\t') next++;
  return text[next] === '\n' || text[next] === '\r';
}

function resourceSpaceEnd(text: string, cursor: number): number | null {
  while (cursor < text.length && RESOURCE_SPACE.test(text[cursor])) {
    if (blankLineAfter(text, cursor)) return null;
    cursor++;
  }
  return cursor;
}

/** Shared destination reader; native reference definitions have no nesting-depth cap. */
function resourceDestinationEnd(
  text: string,
  start: number,
  maxDepth = MAX_LINK_DESTINATION_DEPTH
): number | null {
  let cursor = start;
  const escaped = () =>
    text[cursor] === '\\' && MARKDOWN_PUNCTUATION.test(text[cursor + 1] ?? '');
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
        if (++depth > maxDepth) return null;
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
  return cursor;
}

function resourceTitleEnd(text: string, start: number): number | null {
  let cursor = start;
  const escaped = () =>
    text[cursor] === '\\' && MARKDOWN_PUNCTUATION.test(text[cursor + 1] ?? '');
  const quote = text[cursor];
  const closing = quote === '(' ? ')' : quote;
  if (!['"', "'", '('].includes(quote)) return null;
  cursor++;
  while (cursor < text.length && text[cursor] !== closing) {
    if (blankLineAfter(text, cursor)) return null;
    cursor += escaped() ? 2 : 1;
  }
  return text[cursor] === closing ? cursor + 1 : null;
}

/** Read only a complete link resource after a previously matched label. */
function linkResourceEnd(text: string, start: number): number | null {
  let cursor = resourceSpaceEnd(text, start + 1);
  if (cursor === null) return null;
  cursor = resourceDestinationEnd(text, cursor);
  if (cursor === null) return null;
  const destinationEnd = cursor;
  cursor = resourceSpaceEnd(text, cursor);
  if (cursor === null) return null;
  if (text[cursor] === ')') return cursor + 1;
  if (cursor === destinationEnd) return null;
  cursor = resourceTitleEnd(text, cursor);
  if (cursor === null) return null;
  cursor = resourceSpaceEnd(text, cursor);
  if (cursor === null) return null;
  return text[cursor] === ')' ? cursor + 1 : null;
}

/** Bound valid reference resources, reusing the inline destination and title readers. */
function referenceDefinitionEnd(
  text: string,
  lines: DocumentLines,
  index: number
): number | null {
  const line = lines.at(index);
  const label = /^ {0,3}\[((?:\\[^\r\n]|[^[\]\\\r\n]){1,999})\]:/.exec(
    text.slice(line.start, line.contentEnd)
  );
  if (!label || /^[\t ]*$/.test(label[1])) return null;
  let cursor = resourceSpaceEnd(text, line.start + label[0].length);
  if (cursor === null) return null;
  const destinationStart = cursor;
  const destinationEnd = resourceDestinationEnd(text, cursor, Infinity);
  if (destinationEnd === null || destinationEnd === destinationStart)
    return null;
  cursor = destinationEnd;
  while (text[cursor] === ' ' || text[cursor] === '\t') cursor++;
  const destinationLineEnd = cursor;
  const lineEnded =
    cursor === text.length || text[cursor] === '\r' || text[cursor] === '\n';
  if (lineEnded) {
    cursor = resourceSpaceEnd(text, cursor);
    if (cursor === null) return destinationLineEnd;
  } else if (cursor === destinationEnd) return null;
  const titleEnd = resourceTitleEnd(text, cursor);
  if (titleEnd === null) return lineEnded ? destinationLineEnd : null;
  cursor = titleEnd;
  while (text[cursor] === ' ' || text[cursor] === '\t') cursor++;
  if (cursor === text.length || text[cursor] === '\r' || text[cursor] === '\n')
    return cursor;
  return lineEnded ? destinationLineEnd : null;
}

/** Retain compact numeric closer indexes only after a delimiter is actually encountered. */
function inlineLiteralSpans(
  text: string,
  delimiter: '`' | '$',
  missingClosers: Map<string, number>,
  lines: DocumentLines
): { get(start: number): LiteralSpan | undefined } {
  let count = 0;
  for (let at = text.indexOf(delimiter); at >= 0; ) {
    count++;
    do {
      at++;
    } while (text[at] === delimiter);
    at = text.indexOf(delimiter, at);
  }
  const starts = new Uint32Array(count);
  const sizes = new Uint32Array(count);
  const closes = new Uint32Array(count);
  const absent = 0xffffffff;
  closes.fill(absent);
  let suffixes: Uint32Array | undefined;
  let run = 0;
  for (let at = text.indexOf(delimiter); at >= 0; ) {
    const opening = at;
    do {
      at++;
    } while (text[at] === delimiter);
    starts[run] = opening;
    sizes[run++] = at - opening;
    at = text.indexOf(delimiter, at);
  }
  let segmentStart = 0;
  let container: ContainerStep[] = [];
  for (let index = 0; index < lines.length; index++) {
    const { start, contentEnd, end } = lines.at(index);
    const line = text.slice(start, contentEnd);
    const contentStart = containerContentStart(line, container);
    const remainder = line.slice(contentStart ?? 0);
    const nested = containerOpening(remainder);
    if (ATX_HEADING_LINE.test(line)) {
      indexSegment(segmentStart, start);
      indexSegment(start, contentEnd);
      segmentStart = end;
      container = [];
    } else if (
      CONTAINER_INTERRUPT_LINE.test(remainder) &&
      nested.steps.length &&
      !THEMATIC_BREAK_LINE.test(remainder)
    ) {
      // Entering a quote/item starts a new paragraph; its own complete and
      // continued literals keep their normal same-container matching.
      indexSegment(segmentStart, start);
      segmentStart = start;
      container =
        contentStart === null ? nested.steps : [...container, ...nested.steps];
    } else if (
      isInlineCodeBoundaryLine(line) ||
      rawHtmlOpening(text, start, missingClosers)
    ) {
      if (
        CONTAINER_INTERRUPT_LINE.test(line) &&
        contentStart !== null &&
        container.length
      )
        continue;
      indexSegment(segmentStart, start);
      segmentStart = end;
      container = [];
    }
  }
  indexSegment(segmentStart, text.length);
  let searchHint = 0;
  return {
    get(opening) {
      while (searchHint < count && starts[searchHint] < opening) searchHint++;
      let index = searchHint;
      let closing = absent;
      let bodyStart = opening;
      let size = 0;
      if (starts[index] === opening) {
        size = sizes[index];
        closing = closes[index];
        bodyStart += size;
      } else if (index > 0 && starts[index - 1] + 1 === opening && suffixes) {
        index--;
        size = sizes[index] - 1;
        closing = suffixes[index];
        bodyStart += size;
      }
      return closing === absent
        ? undefined
        : { bodyStart, bodyEnd: closing, end: closing + size };
    },
  };

  function lowerBound(position: number): number {
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle] < position) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function indexSegment(start: number, end: number): void {
    const first = lowerBound(start);
    const last = lowerBound(end);
    if (first === last) return;
    const next = new Map<number, number>();
    for (let index = last - 1; index >= first; index--) {
      const opening = starts[index];
      const size = sizes[index];
      closes[index] = next.get(size) ?? absent;
      let slashes = 0;
      for (let at = opening - 1; at >= 0 && text[at] === '\\'; at--) slashes++;
      if (slashes % 2 && size > 1) {
        if (!suffixes) {
          suffixes = new Uint32Array(count);
          suffixes.fill(absent);
        }
        suffixes[index] = next.get(size - 1) ?? absent;
      }
      next.set(size, opening);
    }
  }
}

type ContainerStep = { quote: true } | { indent: number };

/** Read quote/list steps without rewriting the original text or source offsets. */
function containerOpening(line: string): {
  contentStart: number;
  steps: ContainerStep[];
} {
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
    return { contentStart: cursor, steps };
  }
}

function fenceOpening(
  line: string
): { marker: string; size: number; steps: ContainerStep[] } | null {
  const { contentStart, steps } = containerOpening(line);
  const fence = /^(`{3,})([^`]*$)|^(~{3,})(.*$)/.exec(line.slice(contentStart));
  const run = fence?.[1] ?? fence?.[3];
  return run ? { marker: run[0], size: run.length, steps } : null;
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
  lines: DocumentLines,
  index: number
): LiteralSpan | null {
  const openingLine = lines.at(index);
  const opening = fenceOpening(
    text.slice(openingLine.start, openingLine.contentEnd)
  );
  if (!opening) return null;
  const closing = new RegExp(
    `^ {0,3}${opening.marker}{${opening.size},}[\\t ]*$`
  );
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines.at(at);
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

function ordinaryHtmlInterrupt(line: string): boolean {
  const tag = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[ \t/>]|$)/.exec(line);
  return tag !== null && HTML_BLOCK_TAGS.has(tag[1].toLowerCase());
}

/** Native ordinary HTML blocks stop at a blank line, after any complete opening token. */
function ordinaryHtmlSpan(
  text: string,
  lines: DocumentLines,
  index: number,
  missingClosers: Map<string, number>
): LiteralSpan | null {
  const line = lines.at(index);
  const source = text.slice(line.start, line.contentEnd);
  const tag = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[ \t/>]|$)/.exec(source);
  if (!tag) return null;
  const tokenStart = line.start + source.indexOf('<');
  const tokenEnd = htmlLiteralEnd(text, tokenStart, missingClosers);
  if (!HTML_BLOCK_TAGS.has(tag[1].toLowerCase())) {
    const previous = index > 0 ? lines.at(index - 1) : undefined;
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
    const next = lines.at(at);
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
const scanDocumentVariableMarkers = (
  text: string,
  rejectedOpenings?: number[]
): VariableMarker[] => {
  // Documents without an opening cannot produce a marker or need literal indexes.
  if (!text.includes('{{')) return [];
  const markers: VariableMarker[] = [];
  const missingHtmlClosers = new Map<string, number>();
  const lines = new DocumentLines(text);
  let inlineSpans: ReturnType<typeof inlineLiteralSpans> | undefined;
  let mathSpans: ReturnType<typeof inlineLiteralSpans> | undefined;
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
  let blockEndedAt = -1;
  let nextLine = 0;
  while (cursor < text.length) {
    while (nextLine < lines.length && lines.start(nextLine) < cursor)
      nextLine++;
    if (nextLine < lines.length && lines.start(nextLine) === cursor) {
      const lineIndex = nextLine;
      const current = lines.at(lineIndex);
      if (current.start === current.contentEnd) {
        cursor = current.end;
        continue;
      }
      const previous = lineIndex > 0 ? lines.at(lineIndex - 1) : undefined;
      const previousText = previous
        ? text.slice(previous.start, previous.contentEnd)
        : '';
      const followsBlock =
        !previous ||
        /^[\t ]*$/.test(previousText) ||
        ATX_HEADING_LINE.test(previousText) ||
        THEMATIC_BREAK_LINE.test(previousText) ||
        previous.contentEnd === blockEndedAt;
      const definitionEnd = followsBlock
        ? referenceDefinitionEnd(text, lines, lineIndex)
        : null;
      if (definitionEnd !== null) {
        collectLiteral(cursor, definitionEnd);
        blockEndedAt = definitionEnd;
        cursor = definitionEnd;
        continue;
      }
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
        blockEndedAt = fence.end;
        cursor = fence.end;
        continue;
      }
      const indentedEnd = indentedCodeEnd(text, lines, lineIndex, followsBlock);
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
      const terminatedHtml = terminatedHtmlBlockSpan(
        text,
        cursor,
        missingHtmlClosers,
        lines
      );
      if (terminatedHtml) {
        collectLiteral(cursor, terminatedHtml.bodyStart);
        collectLiteral(terminatedHtml.bodyStart, terminatedHtml.bodyEnd);
        cursor = terminatedHtml.end;
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
    const interaction = text.startsWith('?[', cursor)
      ? readDocumentInteraction(text, cursor, index =>
          blankLineAfter(text, index)
        )
      : null;
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
      const span = (mathSpans ??= inlineLiteralSpans(
        text,
        '$',
        missingHtmlClosers,
        lines
      )).get(cursor);
      if (span) {
        collectLiteral(span.bodyStart, span.bodyEnd);
        cursor = span.end;
        continue;
      }
      rejectedOpenings?.push(cursor);
      while (text[cursor] === '$') cursor++;
      continue;
    }
    if (text[cursor] === '`' || text[cursor] === '~') {
      const span =
        text[cursor] === '`'
          ? (inlineSpans ??= inlineLiteralSpans(
              text,
              '`',
              missingHtmlClosers,
              lines
            )).get(cursor)
          : undefined;
      if (span) {
        collectLiteral(cursor, span.bodyEnd);
        cursor = span.end;
        continue;
      }
      if (text[cursor] === '`') rejectedOpenings?.push(cursor);
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

export const findDocumentVariableMarkers = (text: string): VariableMarker[] =>
  scanDocumentVariableMarkers(text);

/** @internal Seed native inline guards from the same complete-document scan. */
export const findRejectedDocumentInlineOpenings = (
  text: string
): Uint32Array => {
  const offsets: number[] = [];
  scanDocumentVariableMarkers(text, offsets);
  return Uint32Array.from(offsets);
};

/** Collect unique document names in source order, including complete literal example markers. */
export const extractVariableNames = (text: string): string[] => {
  const names = new Set<string>();
  for (const marker of findDocumentVariableMarkers(text)) {
    if (marker.name !== null) names.add(marker.name);
  }
  return [...names];
};

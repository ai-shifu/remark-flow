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

/** Consume virtual whitespace columns while keeping the original UTF-16 offset. */
function consumeContainerPadding(
  line: string,
  position: ContainerPosition,
  maximum: number
): number {
  let consumed = 0;
  while (consumed < maximum) {
    if (!position.virtualPadding) {
      const character = line[position.offset];
      if (character !== ' ' && character !== '\t') break;
      const width = character === '\t' ? 4 - (position.column % 4) : 1;
      position.offset++;
      position.column += width;
      position.virtualPadding = width;
    }
    const width = Math.min(maximum - consumed, position.virtualPadding);
    position.virtualPadding -= width;
    consumed += width;
  }
  return consumed;
}

/** Four columns suffice to distinguish native indented code from inline content. */
function contentIndentColumns(
  line: string,
  position: ContainerPosition
): number {
  return consumeContainerPadding(line, { ...position }, 4);
}

/** Bound indented code to its last nonblank indented line, leaving trailing blanks outside. */
function indentedCodeEnd(
  text: string,
  lines: DocumentLines,
  index: number,
  followsBlock: boolean,
  firstPosition: ContainerPosition,
  steps: readonly ContainerStep[] = []
): number | null {
  if (index > 0 && !followsBlock) return null;
  let lastContentEnd: number | null = null;
  const firstIndex = index;
  for (; index < lines.length; index++) {
    const { start, contentEnd } = lines.at(index);
    const line = text.slice(start, contentEnd);
    const position =
      index === firstIndex
        ? firstPosition
        : containerContentPosition(line, steps);
    if (position === null) {
      if (!steps.some(step => 'quote' in step) && /^[\t ]*$/.test(line))
        continue;
      return lastContentEnd;
    }
    const content = line.slice(position.offset);
    if (/^[\t ]*$/.test(content)) {
      if (lastContentEnd === null) return null;
    } else {
      const columns = contentIndentColumns(line, position);
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
  lines: DocumentLines,
  blockEnd?: () => number
): LiteralSpan | null {
  const opening = rawHtmlOpening(text, start, missingClosers);
  if (!opening) return null;
  const limit = blockEnd?.() ?? text.length;
  if (opening.end > limit) return null;
  const closing = new RegExp(`</${opening.name}[ \\t\\r\\n]*>`, 'gi');
  closing.lastIndex = opening.end;
  const matched = closing.exec(text);
  const closingEnd = matched ? matched.index + matched[0].length : limit;
  const end = Math.min(
    limit,
    lines.at(containingLine(lines, closingEnd)).contentEnd
  );
  return { bodyStart: opening.end, bodyEnd: end, end };
}

/** Comments, instructions, declarations and CDATA keep their whole closing line literal. */
function terminatedHtmlBlockSpan(
  text: string,
  start: number,
  missingClosers: Map<string, number>,
  lines: DocumentLines,
  blockEnd?: () => number
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
  const limit = blockEnd?.() ?? text.length;
  if (tokenEnd > limit) return null;
  const end = Math.min(
    limit,
    lines.at(containingLine(lines, tokenEnd)).contentEnd
  );
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

function resourceTitleEnd(
  text: string,
  start: number,
  blankBoundary = blankLineAfter
): number | null {
  let cursor = start;
  const escaped = () =>
    text[cursor] === '\\' && MARKDOWN_PUNCTUATION.test(text[cursor + 1] ?? '');
  const quote = text[cursor];
  const closing = quote === '(' ? ')' : quote;
  if (!['"', "'", '('].includes(quote)) return null;
  cursor++;
  while (cursor < text.length && text[cursor] !== closing) {
    if (blankBoundary(text, cursor)) return null;
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
  index: number,
  start = lines.start(index),
  steps: readonly ContainerStep[] = [],
  blockEnd?: () => number
): number | null {
  const line = lines.at(index);
  const label = /^ {0,3}\[((?:\\[^\r\n]|[^[\]\\\r\n]){1,999})\]:/.exec(
    text.slice(start, line.contentEnd)
  );
  if (!label || /^[\t ]*$/.test(label[1])) return null;
  const limit =
    blockEnd?.() ?? containerBlockEnd(text, lines, index, steps, true);
  const blankBoundary = (_text: string, at: number): boolean => {
    if (text[at] !== '\n' && text[at] !== '\r') return false;
    const next = containingLine(lines, at) + 1;
    if (next >= lines.length || lines.start(next) >= limit) return true;
    const nextLine = lines.at(next);
    const value = text.slice(nextLine.start, nextLine.contentEnd);
    const contentStart = containerContentStart(value, steps);
    return contentStart === null
      ? isInlineCodeBoundaryLine(value)
      : /^[\t ]*$/.test(value.slice(contentStart));
  };
  const paddingEnd = (from: number): number | null => {
    let cursor = from;
    for (;;) {
      cursor = resourceSpaceEnd(text, cursor) ?? -1;
      if (cursor < 0 || cursor >= limit) return null;
      const current = lines.at(containingLine(lines, cursor));
      if (!steps.length || cursor !== current.start) return cursor;
      const value = text.slice(current.start, current.contentEnd);
      const contentStart = containerContentStart(value, steps);
      if (contentStart === null) return cursor;
      if (/^[\t ]*$/.test(value.slice(contentStart))) return null;
      if (!contentStart) return cursor;
      cursor += contentStart;
    }
  };
  let cursor = paddingEnd(start + label[0].length);
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
    cursor = paddingEnd(cursor);
    if (cursor === null) return destinationLineEnd;
  } else if (cursor === destinationEnd) return null;
  const titleEnd = resourceTitleEnd(text, cursor, blankBoundary);
  if (titleEnd === null) return lineEnded ? destinationLineEnd : null;
  cursor = titleEnd;
  while (text[cursor] === ' ' || text[cursor] === '\t') cursor++;
  if (
    cursor <= limit &&
    (cursor === text.length || text[cursor] === '\r' || text[cursor] === '\n')
  )
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
    const projected = projectedContainerLine(
      line,
      container,
      index === 0 ||
        /^[\t ]*$/.test(
          text.slice(lines.at(index - 1).start, lines.at(index - 1).contentEnd)
        )
    );
    const content = line.slice(projected.contentStart);
    if (projected.indentation < 4 && ATX_HEADING_LINE.test(content)) {
      indexSegment(segmentStart, start);
      indexSegment(start, contentEnd);
      segmentStart = end;
      container = projected.steps;
    } else if (projected.entered) {
      // Entering a quote/item starts a new paragraph; its own complete and
      // continued literals keep their normal same-container matching.
      indexSegment(segmentStart, start);
      segmentStart = start;
      container = projected.steps;
    } else if (
      (projected.indentation < 4 || /^[\t ]*$/.test(content)) &&
      (isInlineCodeBoundaryLine(content) ||
        rawHtmlOpening(text, start + projected.contentStart, missingClosers))
    ) {
      indexSegment(segmentStart, start);
      segmentStart = end;
      container = projected.steps;
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
interface ContainerPosition {
  offset: number;
  column: number;
  virtualPadding: number;
}

/** Reuse native container continuation before looking for a nested block opening. */
function projectedContainerLine(
  line: string,
  active: ContainerStep[],
  startsBlock: boolean
): {
  contentStart: number;
  position: ContainerPosition;
  indentation: number;
  steps: ContainerStep[];
  entered: boolean;
} {
  const continued = containerContentPosition(line, active);
  const base = continued ?? { offset: 0, column: 0, virtualPadding: 0 };
  const remainder = line.slice(base.offset);
  const nested = containerOpening(line, base);
  const entered =
    nested.steps.length > 0 &&
    !THEMATIC_BREAK_LINE.test(remainder) &&
    (startsBlock || CONTAINER_INTERRUPT_LINE.test(remainder));
  const position = entered ? nested.position : base;
  const blockMarker = { ...position };
  consumeContainerPadding(line, blockMarker, 3);
  return {
    contentStart: blockMarker.offset,
    position,
    indentation: contentIndentColumns(line, position),
    steps: entered
      ? [...(continued === null ? [] : active), ...nested.steps]
      : continued === null
        ? []
        : active,
    entered,
  };
}

/** Literal blocks cannot continue beyond a nonblank container dedent. */
function containerBlockEnd(
  text: string,
  lines: DocumentLines,
  index: number,
  steps: readonly ContainerStep[],
  lazyReference = false
): number {
  if (!steps.length) return text.length;
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines.at(at);
    const value = text.slice(line.start, line.contentEnd);
    if (containerContentStart(value, steps) !== null) continue;
    if (/^[\t ]*$/.test(value)) {
      if (!lazyReference && !steps.some(step => 'quote' in step)) continue;
    } else if (lazyReference && !isInlineCodeBoundaryLine(value)) continue;
    return line.start;
  }
  return text.length;
}

/** Read quote/list steps without rewriting the original text or source offsets. */
function containerOpening(
  line: string,
  initial: ContainerPosition
): { position: ContainerPosition; steps: ContainerStep[] } {
  let position = { ...initial };
  const steps: ContainerStep[] = [];
  for (;;) {
    const beforeSpace = { ...position };
    const leading = consumeContainerPadding(line, position, 3);
    if (!position.virtualPadding && line[position.offset] === '>') {
      steps.push({ quote: true });
      position.offset++;
      position.column++;
      consumeContainerPadding(line, position, 1);
      continue;
    }
    const list = position.virtualPadding
      ? null
      : /^(?:[-+*]|\d{1,9}[.)])(?=[ \t])/.exec(line.slice(position.offset));
    if (list) {
      position.offset += list[0].length;
      position.column += list[0].length;
      const afterMarker = { ...position };
      let padding = consumeContainerPadding(line, position, 5);
      if (padding > 4) {
        position = afterMarker;
        padding = consumeContainerPadding(line, position, 1);
      }
      steps.push({ indent: leading + list[0].length + padding });
      continue;
    }
    return { position: beforeSpace, steps };
  }
}

function fenceOpening(
  line: string,
  position: ContainerPosition,
  steps: ContainerStep[]
): { marker: string; size: number; steps: ContainerStep[] } | null {
  if (contentIndentColumns(line, position) >= 4) return null;
  const marker = { ...position };
  consumeContainerPadding(line, marker, 3);
  const fence = /^(`{3,})([^`]*$)|^(~{3,})(.*$)/.exec(
    line.slice(marker.offset)
  );
  const run = fence?.[1] ?? fence?.[3];
  return run ? { marker: run[0], size: run.length, steps } : null;
}

function containerContentPosition(
  line: string,
  steps: readonly ContainerStep[]
): ContainerPosition | null {
  const position = { offset: 0, column: 0, virtualPadding: 0 };
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if ('quote' in step) {
      consumeContainerPadding(line, position, 3);
      if (position.virtualPadding || line[position.offset] !== '>') return null;
      position.offset++;
      position.column++;
      consumeContainerPadding(line, position, 1);
    } else if (
      consumeContainerPadding(line, position, step.indent) < step.indent
    ) {
      // Empty lines can omit list padding while still continuing their enclosing quotes.
      return /^[\t ]*$/.test(line.slice(position.offset)) &&
        !steps.slice(index + 1).some(next => 'quote' in next)
        ? position
        : null;
    }
  }
  return position;
}

function containerContentStart(
  line: string,
  steps: readonly ContainerStep[]
): number | null {
  return containerContentPosition(line, steps)?.offset ?? null;
}

function fencedCodeSpan(
  text: string,
  lines: DocumentLines,
  index: number,
  position: ContainerPosition,
  steps: ContainerStep[]
): LiteralSpan | null {
  const openingLine = lines.at(index);
  const opening = fenceOpening(
    text.slice(openingLine.start, openingLine.contentEnd),
    position,
    steps
  );
  if (!opening) return null;
  const closing = new RegExp(
    `^ {0,3}${opening.marker}{${opening.size},}[\\t ]*$`
  );
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines.at(at);
    const value = text.slice(line.start, line.contentEnd);
    const contentPosition = containerContentPosition(value, opening.steps);
    if (contentPosition === null) {
      if (/^[\t ]*$/.test(value)) continue;
      return {
        bodyStart: openingLine.end,
        bodyEnd: line.start,
        end: line.start,
      };
    }
    const marker = { ...contentPosition };
    consumeContainerPadding(value, marker, 3);
    if (
      contentIndentColumns(value, contentPosition) < 4 &&
      closing.test(value.slice(marker.offset))
    )
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
  missingClosers: Map<string, number>,
  start = lines.start(index),
  steps: readonly ContainerStep[] = [],
  blockEnd?: () => number
): LiteralSpan | null {
  const line = lines.at(index);
  const source = text.slice(start, line.contentEnd);
  const tag = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[ \t/>]|$)/.exec(source);
  if (!tag) return null;
  const tokenStart = start + source.indexOf('<');
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
  const limit = blockEnd?.() ?? containerBlockEnd(text, lines, index, steps);
  const bodyStart = tokenEnd === null || tokenEnd > limit ? start : tokenEnd;
  for (
    let at = Math.max(index + 1, containingLine(lines, bodyStart));
    at < lines.length;
    at++
  ) {
    const next = lines.at(at);
    if (next.start >= limit) return { bodyStart, bodyEnd: limit, end: limit };
    const value = text.slice(next.start, next.contentEnd);
    const contentStart = containerContentStart(value, steps);
    if (
      next.start >= bodyStart &&
      (contentStart === null || /^[\t ]*$/.test(value.slice(contentStart)))
    )
      return { bodyStart, bodyEnd: next.start, end: next.start };
  }
  return { bodyStart, bodyEnd: limit, end: limit };
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
  let container: ContainerStep[] = [];
  let cachedContainerEnd: number | undefined;
  let cachedReferenceEnd: number | undefined;
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
      const previousPosition = containerContentPosition(
        previousText,
        container
      );
      const previousMarker = {
        ...(previousPosition ?? { offset: 0, column: 0, virtualPadding: 0 }),
      };
      consumeContainerPadding(previousText, previousMarker, 3);
      const previousContent = previousText.slice(previousMarker.offset);
      const previousIndented =
        previousPosition !== null &&
        contentIndentColumns(previousText, previousPosition) >= 4;
      const followsBlock =
        !previous ||
        /^[\t ]*$/.test(previousContent) ||
        (!previousIndented && ATX_HEADING_LINE.test(previousContent)) ||
        (!previousIndented && THEMATIC_BREAK_LINE.test(previousContent)) ||
        previous.contentEnd === blockEndedAt;
      const projected = projectedContainerLine(
        text.slice(current.start, current.contentEnd),
        container,
        followsBlock
      );
      if (container !== projected.steps) {
        cachedContainerEnd = undefined;
        cachedReferenceEnd = undefined;
      }
      container = projected.steps;
      const blockEnd = () =>
        (cachedContainerEnd ??= containerBlockEnd(
          text,
          lines,
          lineIndex,
          container
        ));
      const referenceEnd = () => {
        if (
          cachedReferenceEnd === undefined ||
          cachedReferenceEnd <= current.start
        )
          cachedReferenceEnd = containerBlockEnd(
            text,
            lines,
            lineIndex,
            container,
            true
          );
        return cachedReferenceEnd;
      };
      const contentStart = current.start + projected.contentStart;
      const definitionEnd =
        projected.indentation < 4 && (followsBlock || projected.entered)
          ? referenceDefinitionEnd(
              text,
              lines,
              lineIndex,
              contentStart,
              container,
              referenceEnd
            )
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
      const fence = fencedCodeSpan(
        text,
        lines,
        lineIndex,
        projected.position,
        container
      );
      if (fence) {
        collectLiteral(cursor, fence.bodyEnd);
        blockEndedAt = fence.end;
        cursor = fence.end;
        continue;
      }
      const indentedEnd = indentedCodeEnd(
        text,
        lines,
        lineIndex,
        followsBlock || projected.entered,
        projected.position,
        container
      );
      if (indentedEnd !== null) {
        collectLiteral(cursor, indentedEnd);
        cursor = indentedEnd;
        continue;
      }
      const rawHtml =
        projected.indentation < 4
          ? rawHtmlSpan(text, contentStart, missingHtmlClosers, lines, blockEnd)
          : null;
      if (rawHtml) {
        collectLiteral(cursor, rawHtml.bodyStart);
        collectLiteral(rawHtml.bodyStart, rawHtml.bodyEnd);
        blockEndedAt = rawHtml.end;
        cursor = rawHtml.end;
        continue;
      }
      const terminatedHtml =
        projected.indentation < 4
          ? terminatedHtmlBlockSpan(
              text,
              contentStart,
              missingHtmlClosers,
              lines,
              blockEnd
            )
          : null;
      if (terminatedHtml) {
        collectLiteral(cursor, terminatedHtml.bodyStart);
        collectLiteral(terminatedHtml.bodyStart, terminatedHtml.bodyEnd);
        blockEndedAt = terminatedHtml.end;
        cursor = terminatedHtml.end;
        continue;
      }
      const html =
        projected.indentation < 4
          ? ordinaryHtmlSpan(
              text,
              lines,
              lineIndex,
              missingHtmlClosers,
              contentStart,
              container,
              blockEnd
            )
          : null;
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
      ? readDocumentInteraction(text, cursor, index => {
          if (blankLineAfter(text, index)) return true;
          if (text[index] !== '\n' && text[index] !== '\r') return false;
          const next = containingLine(lines, index) + 1;
          if (next >= lines.length) return false;
          const line = lines.at(next);
          const value = text.slice(line.start, line.contentEnd);
          const projected = projectedContainerLine(value, container, false);
          return (
            projected.entered ||
            (projected.indentation < 4 &&
              isInlineCodeBoundaryLine(value.slice(projected.contentStart)))
          );
        })
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

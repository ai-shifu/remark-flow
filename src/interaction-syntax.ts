/**
 * Read `?[...]` as one piece of text while the Markdown is being tokenized.
 *
 * The plugins find interactions by walking the tree's text nodes, which only exist once the
 * Markdown has been parsed -- and by then the parse has already rewritten what is inside the
 * brackets. A backslash escape is Markdown's own syntax too, so `https:\/\/example.com` reaches the
 * text node as `https://example.com`: the escape the option relied on is gone and the `//` splits
 * it into a display and a value. Worse, GFM turns that URL into a link node of its own, so the
 * interaction is no longer inside one text node at all and is shown to the learner as raw text.
 * The same happens to anything else Markdown reads inline: `$...$` with remark-math, `*...*`,
 * an entity.
 *
 * So the brackets are claimed before any of that runs. This construct starts at `?[` and ends at
 * the first `]` the escape rule leaves unescaped outside any `{{...}}` marker, exactly where
 * `INTERACTION_CONTENT_SOURCE` ends it. Every marker is opaque until its first literal `}}`.
 * The whole span becomes one node carrying the source unchanged (see `INTERACTION_NODE`),
 * which the plugins then parse from what the author wrote.
 *
 * `?[text](url)` is a link, not an interaction, as the visitor's lookahead has always said, so a
 * `]` followed by `(` gives the span back to Markdown.
 *
 * The types are declared here rather than imported, so the published declarations do not reach
 * into micromark's packages, which this one does not depend on at runtime.
 */

import {
  findRejectedDocumentInlineOpenings,
  isInlineCodeBoundaryLine,
} from './variable-name';

/** A character code as micromark passes it: a code point, a virtual line ending, or null at EOF. */
type Code = number | null;

type State = (code: Code) => State | undefined;

interface Effects {
  enter(type: string, fields?: Partial<Token>): Token;
  exit(type: string): Token;
  consume(code: Code): void;
  attempt(construct: Construct, ok: State, nok: State): State;
  check(construct: Construct, ok: State, nok: State): State;
  interrupt(construct: unknown, ok: State, nok: State): State;
}

interface Construct {
  name?: string;
  partial?: boolean;
  concrete?: boolean;
  previous?: (this: FlowContext, code: Code) => boolean;
  tokenize: (
    this: FlowContext,
    effects: Effects,
    ok: State,
    nok: State
  ) => State;
}

interface FlowContext {
  interrupt?: boolean;
  currentConstruct: Construct;
  now(): Point;
  parser: {
    constructs: {
      flow: Record<string, Construct[]>;
      text: Record<number, Construct[]>;
      contentInitial?: Record<number, Construct[]>;
    };
  };
}

interface Point {
  offset: number;
}

interface Token {
  type: string;
  start?: Point;
  end?: Point;
  flowNullOffsets?: number[];
  contentType?: string;
  previous?: Token;
  next?: Token;
  flowHeadingDepth?: number;
}

interface TokenizeContext {
  sliceStream(token: Token): Array<string | number>;
}

interface CompileContext {
  enter(
    node: {
      type: string;
      value?: string;
      children?: unknown[];
      data?: Record<string, unknown>;
      depth?: number;
    },
    token: Token
  ): unknown;
  exit(token: Token): unknown;
  sliceSerialize(token: Token): string;
  stack: Array<{
    type: string;
    value?: string;
  }>;
}

/**
 * The node type this construct produces.
 *
 * Its own type, not `text`: GFM finds `www.` links and emails by rewriting text nodes after the
 * parse, and it cut an interaction whose option carried `https://www.postgresql.org` into
 * text and a link, so the question was never recognised. Nothing that rewrites text touches a
 * node of another type; the plugins turn each one into an element, or back into text.
 */
export const INTERACTION_NODE = 'flowInteraction';
export const VARIABLE_NODE = 'flowVariableMarker';
export const OPAQUE_PARAGRAPH = 'flowOpaqueParagraph';
const OPAQUE_HEADING = 'flowOpaqueHeading';

/**
 * Set on the root of a tree parsed with this construct registered.
 *
 * Whether a plugin is attached to a processor says nothing about the tree it is given:
 * `runSync(tree)` can hand it one parsed by another processor, or built by hand, in which nothing
 * was tokenized. The visitor reads this mark, not the registration, to know which it has.
 */
export const TOKENIZED_TREE = 'flowInteractionTokenized';

const QUESTION_MARK = 63;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const LEFT_PAREN = 40;
const LESS_THAN = 60;
const BACKSLASH = 92;
const BACKTICK = 96;
const NUMBER_SIGN = 35;
const DOLLAR_SIGN = 36;
const EXCLAMATION_MARK = 33;
const SPACE = 32;
const HEADING_DEPTH_MAX = 6;
const LEFT_BRACE = 123;
const RIGHT_BRACE = 125;
// The characters a backslash escapes inside an interaction: `|`, `/`, `.`, `]`. Mirrors ESCAPABLE.
const ESCAPABLE_CODES = new Set([124, 47, 46, 93]);

const INTERACTION = 'flowInteraction';
const VARIABLE = 'flowVariableMarker';
const MARKER = 'flowInteractionMarker';
const DATA = 'flowInteractionData';
const LINE_ENDING = 'lineEnding';
const REPLACEMENT_CHARACTER = 0xfffd;
const CARRIAGE_RETURN_LINE_FEED = -3;
const HORIZONTAL_TAB = -2;
const VIRTUAL_SPACE = -1;
const literalInlineOpenings = new WeakMap<object, Set<number>>();
const sourceInlineOpenings = new WeakMap<object, Uint32Array>();
const sourceInlineSeeds: Uint32Array[] = [];
const EMPTY_INLINE_SEED = new Uint32Array();

function rejectedSourceOpening(parser: object, offset: number): boolean {
  let offsets = sourceInlineOpenings.get(parser);
  if (offsets === undefined) {
    offsets =
      sourceInlineSeeds[sourceInlineSeeds.length - 1] ?? EMPTY_INLINE_SEED;
    sourceInlineOpenings.set(parser, offsets);
  }
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (offsets[middle] < offset) low = middle + 1;
    else high = middle;
  }
  return offsets[low] === offset;
}

function previousLiteralCodeOpening(this: FlowContext, code: Code): boolean {
  const native = this.parser.constructs.text[BACKTICK]?.find(
    construct => construct.name === 'codeText'
  );
  return native?.previous?.call(this, code) ?? true;
}

function previousLiteralMathOpening(this: FlowContext, code: Code): boolean {
  const native = this.parser.constructs.text[DOLLAR_SIGN]?.find(
    construct => construct.name === 'mathText'
  );
  return native?.previous?.call(this, code) ?? true;
}

/** A rejected opening cannot pair with a delimiter exposed only by opaque-marker flow protection. */
function tokenizeLiteralInlineOpening(
  this: FlowContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  if (
    !rejectedSourceOpening(this.parser, this.now().offset) &&
    !literalInlineOpenings.get(this.parser)?.has(this.now().offset)
  )
    return nok;
  let opening: Code;
  return start;
  function start(code: Code): State | undefined {
    opening = code;
    effects.enter('data');
    return run(code);
  }
  function run(code: Code): State | undefined {
    if (code === opening) {
      effects.consume(code);
      return run;
    }
    effects.exit('data');
    return ok(code);
  }
}

/** Preserve NUL provenance before a serialized token loses the distinction from literal U+FFFD. */
function preserveTokenNulls(context: TokenizeContext, token: Token): void {
  const offsets: number[] = [];
  let offset = 0;
  let afterTab = false;
  for (const chunk of context.sliceStream(token)) {
    // sliceSerialize omits the virtual padding after a real tab when expandTabs is false.
    if (chunk === VIRTUAL_SPACE && afterTab) continue;
    if (chunk === REPLACEMENT_CHARACTER) offsets.push(offset);
    offset +=
      typeof chunk === 'string'
        ? chunk.length
        : chunk === CARRIAGE_RETURN_LINE_FEED
          ? 2
          : 1;
    afterTab = chunk === HORIZONTAL_TAB;
  }
  if (offsets.length) token.flowNullOffsets = offsets;
}

/** Restore only known raw NULs while keeping Markdown's container-prefix serialization. */
function tokenValue(context: CompileContext, token: Token): string {
  const value = context.sliceSerialize(token);
  if (!token.flowNullOffsets) return value;
  const parts: string[] = [];
  let at = 0;
  for (const offset of token.flowNullOffsets) {
    parts.push(value.slice(at, offset), '\u0000');
    at = offset + 1;
  }
  parts.push(value.slice(at));
  return parts.join('');
}

/** Whether `code` is one of micromark's virtual line endings (CR, LF, CRLF). */
const isLineEnding = (code: Code): boolean => code !== null && code < -2;

function tokenizeInteraction(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  const finish = () => preserveTokenNulls(this, effects.exit(INTERACTION));
  return start;

  // Every character is consumed inside a token of its own kind -- the `?[` and `]` markers, the
  // data between them, line endings -- because micromark only lets a construct consume while a
  // token is open.
  function start(code: Code): State | undefined {
    effects.enter(INTERACTION);
    effects.enter(MARKER);
    effects.consume(code);
    return open;
  }

  function open(code: Code): State | undefined {
    if (code !== LEFT_BRACKET) {
      return nok(code);
    }
    effects.consume(code);
    effects.exit(MARKER);
    return beforeContent;
  }

  // Data is only opened on a character it will hold: micromark rejects an empty token.
  function beforeContent(code: Code): State | undefined {
    if (code === null) {
      return nok(code);
    }
    if (code === RIGHT_BRACKET) {
      return close(code);
    }
    if (isLineEnding(code)) {
      return lineEnding(code);
    }
    effects.enter(DATA);
    return content(code);
  }

  function variableSecondBrace(code: Code): State | undefined {
    if (code !== LEFT_BRACE) return content(code);
    effects.consume(code);
    return variableBody;
  }

  function variableBody(code: Code): State | undefined {
    if (code === null) {
      // A confirmed marker owns its tail even when it never closes. Rolling back here
      // would let Markdown discover an inner `?[...]` and invent buttons inside the key.
      effects.exit(DATA);
      finish();
      return ok(code);
    }
    if (isLineEnding(code)) {
      effects.exit(DATA);
      return variableLineEnding(code);
    }
    // Neither backslashes nor brackets have special meaning inside the marker.
    effects.consume(code);
    return code === RIGHT_BRACE ? variableAfterBrace : variableBody;
  }

  function variableAfterBrace(code: Code): State | undefined {
    if (code !== RIGHT_BRACE) return variableBody(code);
    effects.consume(code);
    return content;
  }

  function variableLineEnding(code: Code): State | undefined {
    effects.enter(LINE_ENDING);
    effects.consume(code);
    effects.exit(LINE_ENDING);
    return variableBeforeData;
  }

  function variableBeforeData(code: Code): State | undefined {
    if (code === null) {
      finish();
      return ok(code);
    }
    if (isLineEnding(code)) return variableLineEnding(code);
    effects.enter(DATA);
    return variableBody(code);
  }

  function lineEnding(code: Code): State | undefined {
    // An interaction may run across lines, as the regex it mirrors allows. A line ending is its
    // own token in micromark, so it sits between runs of data rather than inside one.
    effects.enter(LINE_ENDING);
    effects.consume(code);
    effects.exit(LINE_ENDING);
    return beforeContent;
  }

  function content(code: Code): State | undefined {
    if (code === null) {
      return nok(code);
    }
    if (code === RIGHT_BRACKET) {
      effects.exit(DATA);
      return close(code);
    }
    if (isLineEnding(code)) {
      effects.exit(DATA);
      return lineEnding(code);
    }
    effects.consume(code);
    if (code === LEFT_BRACE) return variableSecondBrace;
    return code === BACKSLASH ? afterBackslash : content;
  }

  function afterBackslash(code: Code): State | undefined {
    // `\]` is an escaped bracket and does not close; any other backslash is literal text and
    // the character after it is read as usual. Only the escapable characters pair up.
    if (code !== null && ESCAPABLE_CODES.has(code)) {
      effects.consume(code);
      return content;
    }
    return content(code);
  }

  function close(code: Code): State | undefined {
    effects.enter(MARKER);
    effects.consume(code);
    effects.exit(MARKER);
    return after;
  }

  function after(code: Code): State | undefined {
    if (code === LEFT_PAREN) {
      return nok(code);
    }
    finish();
    return ok(code);
  }
}

/** Claim standalone references before Markdown can recognize syntax inside their opaque body. */
function tokenizeVariable(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  const finish = () => preserveTokenNulls(this, effects.exit(VARIABLE));
  return start;
  function start(code: Code): State | undefined {
    effects.enter(VARIABLE);
    effects.consume(code);
    return second;
  }
  function second(code: Code): State | undefined {
    if (code !== LEFT_BRACE) return nok(code);
    effects.consume(code);
    return beforeBody;
  }
  function beforeBody(code: Code): State | undefined {
    if (code === null) {
      finish();
      return ok(code);
    }
    if (isLineEnding(code)) {
      effects.enter(LINE_ENDING);
      effects.consume(code);
      effects.exit(LINE_ENDING);
      return beforeBody;
    }
    effects.enter(DATA);
    return body(code);
  }
  function body(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) {
      effects.exit(DATA);
      return beforeBody(code);
    }
    effects.consume(code);
    return code === RIGHT_BRACE ? afterBrace : body;
  }
  function afterBrace(code: Code): State | undefined {
    if (code !== RIGHT_BRACE) return body(code);
    effects.consume(code);
    effects.exit(DATA);
    finish();
    return ok;
  }
}

/** Keep block-looking lines inside a multiline marker in the same inline text stream. */
function tokenizeOpaqueParagraph(
  this: FlowContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  const opaque = tokenizeOpaqueBlock(this, effects, ok, nok, false);
  const definition = this.parser.constructs.contentInitial?.[
    LEFT_BRACKET
  ]?.find(construct => construct.name === 'definition');
  if (!definition || this.interrupt) return opaque;
  return code =>
    code === LEFT_BRACKET
      ? effects.check(
          {
            partial: true,
            tokenize(effects, yes, no) {
              // Native definition checks register labels. Keep speculative labels local.
              const native = Object.create(this, {
                parser: {
                  value: Object.create(this.parser, {
                    defined: { value: [] },
                  }),
                },
              });
              return definition.tokenize.call(native, effects, yes, no);
            },
          },
          nok,
          opaque
        )(code)
      : opaque(code);
}

/** The same marker ownership applies when its opening is inside an ATX heading. */
function tokenizeOpaqueHeading(
  this: FlowContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return tokenizeOpaqueBlock(this, effects, ok, nok, true);
}

function tokenizeOpaqueBlock(
  context: FlowContext,
  effects: Effects,
  ok: State,
  nok: State,
  heading: boolean,
  probe = false
): State {
  let marker = false;
  let brace = false;
  let multiline = false;
  let interaction = false;
  let question = false;
  let headingDepth = 0;
  let checkedSize = 0;
  let codeOpeningSize = 0;
  let codeOpeningOffset = 0;
  let codeOpeningCrossedBoundary = false;
  let mathOpeningSize = 0;
  let mathOpeningOffset = 0;
  let mathOpeningCrossedBoundary = false;
  let previousCode: Code = null;
  let rejectedDelimiter: Code = null;
  const labels: Array<Token & { inactive?: boolean }> = [];
  const activeLinkLabels = new Set<Token & { inactive?: boolean }>();
  const rejectedInlineOpenings = new Set<number>();
  let chunk: Token;
  let outer: Token;
  const outerType = heading ? OPAQUE_HEADING : 'content';
  const html = context.parser.constructs.text[LESS_THAN]?.find(
    construct => construct.name === 'htmlText'
  );
  const autolink = context.parser.constructs.text[LESS_THAN]?.find(
    construct => construct.name === 'autolink'
  );
  const math = context.parser.constructs.text[DOLLAR_SIGN]?.find(
    construct => construct.name === 'mathText'
  );
  const labelEnd = context.parser.constructs.text[RIGHT_BRACKET]?.find(
    construct => construct.name === 'labelEnd'
  );
  let closingLabel: (Token & { inactive?: boolean }) | undefined;
  const continuationConstruct = { partial: true, tokenize: continuation };
  const inlineContinuationConstruct = {
    partial: true,
    tokenize: inlineContinuation,
  };
  const markerLineConstruct = { partial: true, tokenize: markerLine };
  const active = { ...context.currentConstruct, concrete: true };
  const inactive = { ...context.currentConstruct, concrete: false };
  // A flow lookahead can request another document line (notably GFM tables).
  // Keep this concrete construct active while probing, so list containers cannot
  // start inside a marker before that speculative lookahead has rolled back.
  const interruptFlow = Object.fromEntries(
    Object.entries(context.parser.constructs.flow).map(([code, constructs]) => [
      code,
      constructs.map(construct => ({ ...construct, partial: true })),
    ])
  );
  return start;

  function start(code: Code): State | undefined {
    // The continuation check must use Markdown's other block constructs without
    // recursively starting another speculative opaque paragraph.
    if (context.interrupt) return nok(code);
    if (!probe) context.currentConstruct = inactive;
    outer = effects.enter(outerType);
    if (heading) {
      effects.enter(MARKER);
      return headingSequence(code);
    }
    effects.enter('paragraph');
    return beforeContent(code);
  }

  function headingSequence(code: Code): State | undefined {
    if (code === NUMBER_SIGN) {
      if (++headingDepth > HEADING_DEPTH_MAX) return nok(code);
      effects.consume(code);
      return headingSequence;
    }
    if (code !== null && !isLineEnding(code) && !isSpace(code))
      return nok(code);
    outer.flowHeadingDepth = headingDepth;
    return headingPadding(code);
  }

  function headingPadding(code: Code): State | undefined {
    if (isSpace(code)) {
      effects.consume(code);
      return headingPadding;
    }
    effects.exit(MARKER);
    return beforeContent(code);
  }

  function beforeContent(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) return nok(code);
    chunk = effects.enter('chunkText', { contentType: 'text' });
    return content(code);
  }

  function content(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) {
      if (probe) {
        if (!marker || code === null) return nok(code);
        effects.exit('chunkText');
        closeOuter();
        return ok(code);
      }
      if (marker && code !== null) {
        multiline = true;
        brace = false;
        effects.consume(code);
        effects.exit('chunkText');
        return nextLine;
      }
      if (code !== null && !heading) {
        return effects.check(continuationConstruct, continueLine, finish)(code);
      }
      return finish(code);
    }
    if (!marker) {
      // Inline code and HTML already own their braces. Check before claiming a
      // marker so a later real code fence remains in Markdown's flow.
      if (!interaction && code === BACKTICK) {
        if (rejectedSourceOpening(context.parser, context.now().offset)) {
          rejectedDelimiter = code;
          return skipRejectedOpening(code);
        }
        checkedSize = 0;
        codeOpeningSize = 0;
        codeOpeningOffset = context.now().offset;
        codeOpeningCrossedBoundary = false;
        return effects.check(
          { partial: true, tokenize: codeSpan },
          skipChecked,
          skipCodeOpening
        )(code);
      }
      if (!interaction && code === LESS_THAN && (autolink || html)) {
        checkedSize = 0;
        return effects.check(
          { partial: true, tokenize: autolinkSpan },
          skipChecked,
          tryHtml
        )(code);
      }
      if (!interaction && code === DOLLAR_SIGN && math) {
        if (rejectedSourceOpening(context.parser, context.now().offset)) {
          rejectedDelimiter = code;
          return skipRejectedOpening(code);
        }
        checkedSize = 0;
        mathOpeningSize = 0;
        mathOpeningOffset = context.now().offset;
        mathOpeningCrossedBoundary = false;
        return effects.check(
          { partial: true, tokenize: mathSpan },
          skipChecked,
          skipMathOpening
        )(code);
      }
      if (code === RIGHT_BRACKET && labels.length && labelEnd) {
        closingLabel = labels.pop();
        if (closingLabel) activeLinkLabels.delete(closingLabel);
        if (!closingLabel?.inactive) {
          checkedSize = 0;
          return effects.check(
            { partial: true, tokenize: linkResourceSpan },
            skipLinkResource,
            ordinary
          )(code);
        }
      }
      if (heading && isSpace(code)) {
        checkedSize = 0;
        return effects.check(
          { partial: true, tokenize: headingTail },
          headingEnd,
          skipChecked
        )(code);
      }
      if (code === BACKSLASH) {
        effects.consume(code);
        brace = false;
        question = false;
        return escaped;
      }
    }
    return ordinary(code);
  }

  function skipRejectedOpening(code: Code): State | undefined {
    if (code !== rejectedDelimiter) return content(code);
    effects.consume(code);
    previousCode = code;
    brace = false;
    question = false;
    return skipRejectedOpening;
  }

  function ordinary(code: Code): State | undefined {
    const prior = previousCode;
    effects.consume(code);
    previousCode = code;
    if (!marker && code === LEFT_BRACKET) {
      const label = {
        type: prior === EXCLAMATION_MARK ? 'labelImage' : 'labelLink',
        end: context.now(),
      };
      labels.push(label);
      if (label.type === 'labelLink') activeLinkLabels.add(label);
    }
    const wasMarker = marker;
    if (marker) {
      if (brace && code === RIGHT_BRACE) {
        marker = false;
        brace = false;
      } else {
        brace = code === RIGHT_BRACE;
      }
    } else if (brace && code === LEFT_BRACE) {
      marker = true;
      brace = false;
    } else {
      brace = code === LEFT_BRACE;
    }
    if (!probe && wasMarker !== marker) {
      context.currentConstruct = marker ? active : inactive;
    }
    if (!marker) {
      if (question && code === LEFT_BRACKET) interaction = true;
      if (code === RIGHT_BRACKET) interaction = false;
      question = code === QUESTION_MARK;
    }
    return content;
  }

  function escaped(code: Code): State | undefined {
    if (interaction && (code === null || !ESCAPABLE_CODES.has(code))) {
      return content(code);
    }
    if (code === null || isLineEnding(code)) return content(code);
    effects.consume(code);
    previousCode = null;
    return content;
  }

  function codeSpan(check: Effects, yes: State, no: State): State {
    let opening = 0;
    let closing = 0;
    return open;
    function consume(code: Code): void {
      check.consume(code);
      checkedSize++;
    }
    function open(code: Code): State | undefined {
      if (code === BACKTICK) {
        opening++;
        codeOpeningSize++;
        consume(code);
        return open;
      }
      return body(code);
    }
    function body(code: Code): State | undefined {
      if (code === null) return no(code);
      if (isLineEnding(code)) {
        if (probe || heading) {
          codeOpeningCrossedBoundary = heading;
          return no(code);
        }
        return check.check(continuationConstruct, line, blockedLine)(code);
      }
      if (code === BACKTICK) {
        closing = 0;
        return close(code);
      }
      consume(code);
      return body;
    }
    function line(code: Code): State | undefined {
      consume(code);
      return body;
    }
    function blockedLine(code: Code): State | undefined {
      return check.check(
        { partial: true, tokenize: inlineBoundary },
        boundary,
        no
      )(code);
    }
    function boundary(code: Code): State | undefined {
      codeOpeningCrossedBoundary = true;
      return no(code);
    }
    function inlineBoundary(probe: Effects, yes: State, no: State): State {
      let line = '';
      return start;
      function start(code: Code): State | undefined {
        probe.consume(code);
        return content;
      }
      function content(code: Code): State | undefined {
        if (code === null || isLineEnding(code)) {
          return isInlineCodeBoundaryLine(line) ? yes(code) : no(code);
        }
        line +=
          code === HORIZONTAL_TAB
            ? '\t'
            : code === VIRTUAL_SPACE
              ? ' '
              : String.fromCodePoint(code);
        probe.consume(code);
        return content;
      }
    }
    function close(code: Code): State | undefined {
      if (code === BACKTICK) {
        closing++;
        consume(code);
        return close;
      }
      return closing === opening ? yes(code) : body(code);
    }
  }

  function htmlSpan(
    this: FlowContext,
    check: Effects,
    yes: State,
    no: State
  ): State {
    if (!html) return no;
    return nativeSpan.call(this, html, 'htmlText', check, yes, no);
  }

  function autolinkSpan(
    this: FlowContext,
    check: Effects,
    yes: State,
    no: State
  ): State {
    if (!autolink) return no;
    return nativeSpan.call(this, autolink, 'autolink', check, yes, no);
  }

  function tryHtml(code: Code): State | undefined {
    // A failed native autolink trial rolls its tokens back, so reset its byte count too.
    checkedSize = 0;
    return effects.check(
      { partial: true, tokenize: htmlSpan },
      skipChecked,
      ordinary
    )(code);
  }

  function mathSpan(
    this: FlowContext,
    check: Effects,
    yes: State,
    no: State
  ): State {
    if (!math) return no;
    let opening = true;
    let trailingSize = 0;
    // A complete run is tried only once, including when its first dollar was escaped.
    const nativeContext = Object.create(this, { previous: { value: null } });
    return nativeSpan.call(
      nativeContext,
      math,
      'mathText',
      {
        ...check,
        consume(code) {
          if (opening && code === DOLLAR_SIGN) mathOpeningSize++;
          else opening = false;
          trailingSize = code === DOLLAR_SIGN ? trailingSize + 1 : 0;
          check.consume(code);
        },
      },
      yes,
      no,
      () => trailingSize === mathOpeningSize,
      () => {
        mathOpeningCrossedBoundary = true;
      }
    );
  }

  function linkResourceSpan(
    this: FlowContext,
    check: Effects,
    yes: State,
    no: State
  ): State {
    if (!labelEnd || !closingLabel) return no;
    // The native label-end tokenizer owns resource destinations and titles. Its
    // matching opening is tracked here because flow has not tokenized inline labels yet.
    const nativeContext = Object.create(this, {
      events: { value: [['enter', closingLabel]] },
    });
    return nativeSpan.call(nativeContext, labelEnd, 'resource', check, yes, no);
  }

  function nativeSpan(
    this: FlowContext,
    construct: Construct,
    tokenType: string,
    check: Effects,
    yes: State,
    no: State,
    closesBeforeLineEnding: () => boolean = () => false,
    onBoundary: () => void = () => undefined
  ): State {
    // Use the registered grammar, including HTML attributes, math options, and link titles.
    let closed = false;
    let done = false;
    const state = construct.tokenize.call(
      this,
      tracedEffects(check),
      complete,
      failed
    );
    return withinParagraph(state);

    function tracedEffects(check: Effects): Effects {
      return {
        ...check,
        consume(code) {
          checkedSize++;
          check.consume(code);
        },
        exit(type) {
          const token = check.exit(type);
          if (type === tokenType) closed = true;
          return token;
        },
        attempt(construct, yes, no) {
          return check.attempt(
            {
              ...construct,
              tokenize(effects, yes, no) {
                return construct.tokenize.call(
                  this,
                  tracedEffects(effects),
                  yes,
                  no
                );
              },
            },
            yes,
            no
          );
        },
      };
    }

    function complete(code: Code): State | undefined {
      done = true;
      return closed ? yes(code) : no(code);
    }

    function failed(code: Code): State | undefined {
      done = true;
      return no(code);
    }

    function withinParagraph(state: State): State {
      return code => {
        // Inline constructs normally see only one paragraph. Flow lookahead must impose
        // the same boundary before passing it a blank line or a new flow block.
        // A closed HTML token still receives this code so its `ok` state can run.
        if (!closed && isLineEnding(code) && !closesBeforeLineEnding()) {
          if (probe || heading) return boundary(code);
          return check.check(
            inlineContinuationConstruct,
            advance,
            boundary
          )(code);
        }
        return advance(code);

        function advance(code: Code): State | undefined {
          const next = state(code);
          return next && !done ? withinParagraph(next) : next;
        }
      };
    }

    function boundary(code: Code): State | undefined {
      onBoundary();
      return no(code);
    }
  }

  function skipChecked(code: Code): State | undefined {
    if (!checkedSize) return content(code);
    effects.consume(code);
    previousCode = code;
    checkedSize--;
    brace = false;
    question = false;
    if (isLineEnding(code)) {
      effects.exit('chunkText');
      return nextCheckedLine;
    }
    return skipChecked;
  }

  function nextCheckedLine(code: Code): State | undefined {
    openNextChunk();
    return skipChecked(code);
  }

  function skipCodeOpening(code: Code): State | undefined {
    if (!probe && codeOpeningCrossedBoundary)
      rejectedInlineOpenings.add(codeOpeningOffset);
    checkedSize = codeOpeningSize;
    return skipChecked(code);
  }

  function skipMathOpening(code: Code): State | undefined {
    if (!probe && mathOpeningCrossedBoundary)
      rejectedInlineOpenings.add(mathOpeningOffset);
    checkedSize = mathOpeningSize;
    return skipChecked(code);
  }

  function skipLinkResource(code: Code): State | undefined {
    if (closingLabel?.type === 'labelLink') {
      for (const label of activeLinkLabels) label.inactive = true;
      activeLinkLabels.clear();
    }
    interaction = false;
    return skipChecked(code);
  }

  function headingTail(check: Effects, yes: State, no: State): State {
    let hashes = false;
    return padding;
    function consume(code: Code): void {
      check.consume(code);
      checkedSize++;
    }
    function padding(code: Code): State | undefined {
      if (isSpace(code)) {
        consume(code);
        return padding;
      }
      return sequence(code);
    }
    function sequence(code: Code): State | undefined {
      if (code === NUMBER_SIGN) {
        hashes = true;
        consume(code);
        return sequence;
      }
      if (!hashes) return no(code);
      return after(code);
    }
    function after(code: Code): State | undefined {
      if (isSpace(code)) {
        consume(code);
        return after;
      }
      return code === null || isLineEnding(code) ? yes(code) : no(code);
    }
  }

  function headingEnd(code: Code): State | undefined {
    if (!multiline) return nok(code);
    effects.exit('chunkText');
    effects.enter(MARKER);
    return headingEndTail(code);
  }

  function headingEndTail(code: Code): State | undefined {
    if (checkedSize) {
      effects.consume(code);
      checkedSize--;
      return headingEndTail;
    }
    effects.exit(MARKER);
    retainLiteralInlineOpenings();
    effects.exit(outerType);
    return ok(code);
  }

  function nextLine(code: Code): State | undefined {
    if (code === null) {
      closeOuter();
      return ok(code);
    }
    openNextChunk();
    return content(code);
  }

  function openNextChunk(): void {
    chunk.next = effects.enter('chunkText', {
      contentType: 'text',
      previous: chunk,
    });
    chunk = chunk.next;
  }

  function closeOuter(): void {
    retainLiteralInlineOpenings();
    if (!heading) effects.exit('paragraph');
    effects.exit(outerType);
  }

  function retainLiteralInlineOpenings(): void {
    if (probe || !rejectedInlineOpenings.size) return;
    let openings = literalInlineOpenings.get(context.parser);
    if (!openings) {
      openings = new Set<number>();
      literalInlineOpenings.set(context.parser, openings);
    }
    for (const opening of rejectedInlineOpenings) openings.add(opening);
  }

  function finish(code: Code): State | undefined {
    if (!multiline) return nok(code);
    effects.exit('chunkText');
    closeOuter();
    return ok(code);
  }

  function continueLine(code: Code): State | undefined {
    effects.consume(code);
    previousCode = null;
    effects.exit('chunkText');
    return nextLine;
  }

  function continuation(check: Effects, yes: State, no: State): State {
    return line;
    function line(code: Code): State | undefined {
      check.consume(code);
      return prefix;
    }
    function prefix(code: Code): State | undefined {
      if (isSpace(code)) {
        check.consume(code);
        return prefix;
      }
      if (code === null || isLineEnding(code)) return no(code);
      return check.check(
        markerLineConstruct,
        yes,
        check.interrupt(interruptFlow, no, yes)
      )(code);
    }
  }

  function inlineContinuation(check: Effects, yes: State, no: State): State {
    // A native inline state may have just exited a token and still need this
    // character to finish. Give the speculative boundary check its own token.
    return code => {
      check.enter(DATA);
      return continuation(check, finish(yes), finish(no))(code);
    };
    function finish(next: State): State {
      return code => {
        check.exit(DATA);
        return next(code);
      };
    }
  }

  function markerLine(
    this: FlowContext,
    check: Effects,
    yes: State,
    no: State
  ): State {
    return tokenizeOpaqueBlock(this, check, yes, no, false, true);
  }
}

const isSpace = (code: Code): boolean =>
  code === SPACE || code === HORIZONTAL_TAB || code === VIRTUAL_SPACE;

/** The micromark syntax extension: `?` may open an interaction wherever inline text is read. */
export function interactionSyntax(): Record<string, unknown> {
  return {
    flow: {
      [NUMBER_SIGN]: {
        name: OPAQUE_HEADING,
        concrete: true,
        tokenize: tokenizeOpaqueHeading,
      },
      null: {
        name: OPAQUE_PARAGRAPH,
        concrete: true,
        tokenize: tokenizeOpaqueParagraph,
      },
    },
    text: {
      [BACKTICK]: {
        name: 'flowLiteralCodeOpening',
        previous: previousLiteralCodeOpening,
        tokenize: tokenizeLiteralInlineOpening,
      },
      [DOLLAR_SIGN]: {
        name: 'flowLiteralMathOpening',
        previous: previousLiteralMathOpening,
        tokenize: tokenizeLiteralInlineOpening,
      },
      [QUESTION_MARK]: {
        name: 'flowInteraction',
        tokenize: tokenizeInteraction,
      },
      [LEFT_BRACE]: { name: VARIABLE, tokenize: tokenizeVariable },
    },
  };
}

/** The mdast extension: the whole span becomes one node holding the source as written. */
export function interactionFromMarkdown(): Record<string, unknown> {
  return {
    transforms: [
      (tree: { data?: Record<string, unknown> }) => {
        tree.data = { ...tree.data, [TOKENIZED_TREE]: true };
      },
    ],
    enter: {
      [OPAQUE_HEADING](this: CompileContext, token: Token) {
        this.enter(
          { type: 'heading', depth: token.flowHeadingDepth, children: [] },
          token
        );
      },
      [VARIABLE](this: CompileContext, token: Token) {
        this.enter({ type: VARIABLE_NODE, value: '' }, token);
      },
      [INTERACTION](this: CompileContext, token: Token) {
        this.enter({ type: INTERACTION_NODE, value: '' }, token);
      },
    },
    exit: {
      [OPAQUE_HEADING](this: CompileContext, token: Token) {
        this.exit(token);
      },
      [VARIABLE](this: CompileContext, token: Token) {
        const node = this.stack[this.stack.length - 1];
        node.value = tokenValue(this, token);
        this.exit(token);
      },
      [INTERACTION](this: CompileContext, token: Token) {
        const node = this.stack[this.stack.length - 1];
        node.value = tokenValue(this, token);
        this.exit(token);
      },
    },
  };
}

interface ProcessorLike {
  data(): Record<string, unknown>;
  parser?: unknown;
  Parser?: unknown;
}

type MarkdownParser = (
  this: unknown,
  document: string,
  file?: unknown
) => unknown;
const seededProcessors = new WeakSet<object>();
const seededParsers = new WeakMap<MarkdownParser, MarkdownParser>();
const seededParserWrappers = new WeakSet<MarkdownParser>();

function seedParser(parser: unknown): unknown {
  if (typeof parser !== 'function') return parser;
  const original = parser as MarkdownParser;
  if (seededParserWrappers.has(original)) return original;
  let wrapped = seededParsers.get(original);
  if (!wrapped) {
    wrapped = function (document, file) {
      // Micromark strips one leading BOM before assigning source offsets.
      const source = document.startsWith('\uFEFF')
        ? document.slice(1)
        : document;
      sourceInlineSeeds.push(findRejectedDocumentInlineOpenings(source));
      try {
        return original.call(this, document, file);
      } finally {
        sourceInlineSeeds.pop();
      }
    };
    seededParsers.set(original, wrapped);
    seededParserWrappers.add(wrapped);
  }
  return wrapped;
}

/** Keep parser assignment working in either plugin order and on copied processors. */
function registerSourceSeeds(processor: ProcessorLike): void {
  if (seededProcessors.has(processor)) return;
  seededProcessors.add(processor);
  for (const key of ['parser', 'Parser'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(processor, key);
    if (descriptor && !descriptor.configurable) {
      if ('value' in descriptor && descriptor.writable)
        processor[key] = seedParser(processor[key]);
      continue;
    }
    let current = processor[key];
    const writable =
      !descriptor ||
      !!descriptor.set ||
      ('value' in descriptor && descriptor.writable);
    Object.defineProperty(processor, key, {
      configurable: descriptor?.configurable ?? true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        // Later attachers such as GFM install competing flow constructs. Marker
        // ownership must run first regardless of the user's plugin order.
        const data = processor.data();
        const extensions = data.micromarkExtensions as unknown[] | undefined;
        if (
          extensions?.includes(SYNTAX) &&
          extensions[extensions.length - 1] !== SYNTAX
        )
          data.micromarkExtensions = [
            ...extensions.filter(extension => extension !== SYNTAX),
            SYNTAX,
          ];
        return seedParser(
          descriptor?.get ? descriptor.get.call(this) : current
        );
      },
      ...(writable
        ? {
            set(value: unknown) {
              if (descriptor?.set) descriptor.set.call(this, value);
              else current = value;
            },
          }
        : {}),
    });
  }
}

// A unified processor is a callable instance, so `typeof` says function, not object.
const isProcessor = (value: unknown): value is ProcessorLike =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as { data?: unknown }).data === 'function';

/**
 * Teach the processor a plugin is attached to to tokenize interactions.
 *
 * A plugin called through `unified().use()` runs with the processor as `this`; one called by hand
 * -- `remarkFlow()(tree)`, as older code and the tests do -- has none, and keeps working on the
 * tree it is given as before.
 */
export function registerInteractionSyntax(self: unknown): void {
  if (!isProcessor(self)) {
    return;
  }
  const data = self.data();
  registerSourceSeeds(self);
  const add = (field: string, value: unknown) => {
    const list = (data[field] as unknown[] | undefined) ?? [];
    if (!list.includes(value)) {
      list.push(value);
    }
    data[field] = list;
  };
  add('micromarkExtensions', SYNTAX);
  add('fromMarkdownExtensions', FROM_MARKDOWN);
}

// One instance each, so a processor that attaches several of these plugins registers once.
const SYNTAX = interactionSyntax();
const FROM_MARKDOWN = interactionFromMarkdown();

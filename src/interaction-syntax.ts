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

/** A character code as micromark passes it: a code point, a virtual line ending, or null at EOF. */
type Code = number | null;

type State = (code: Code) => State | undefined;

interface Effects {
  enter(type: string, fields?: Partial<Token>): Token;
  exit(type: string): Token;
  consume(code: Code): void;
  check(construct: Construct, ok: State, nok: State): State;
  interrupt(construct: unknown, ok: State, nok: State): State;
}

interface Construct {
  name?: string;
  partial?: boolean;
  concrete?: boolean;
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
  parser: {
    constructs: {
      flow: Record<string, Construct[]>;
      text: Record<number, Construct[]>;
    };
  };
}

interface Token {
  type: string;
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
  return tokenizeOpaqueBlock(this, effects, ok, nok, false);
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
  let chunk: Token;
  let outer: Token;
  const outerType = heading ? OPAQUE_HEADING : 'content';
  const html = context.parser.constructs.text[LESS_THAN]?.find(
    construct => construct.name === 'htmlText'
  );
  const continuationConstruct = { partial: true, tokenize: continuation };
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
        checkedSize = 0;
        codeOpeningSize = 0;
        return effects.check(
          { partial: true, tokenize: codeSpan },
          skipChecked,
          skipCodeOpening
        )(code);
      }
      if (!interaction && code === LESS_THAN && html) {
        checkedSize = 0;
        return effects.check(
          { partial: true, tokenize: htmlSpan },
          skipChecked,
          ordinary
        )(code);
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

  function ordinary(code: Code): State | undefined {
    effects.consume(code);
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
        if (probe) return no(code);
        return check.check(continuationConstruct, line, no)(code);
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
    // Keep micromark's own HTML grammar, including quoted attributes and comments.
    if (!html) return no;
    return html.tokenize.call(
      this,
      {
        ...check,
        consume(code) {
          checkedSize++;
          check.consume(code);
        },
      },
      yes,
      no
    );
  }

  function skipChecked(code: Code): State | undefined {
    if (!checkedSize) return content(code);
    effects.consume(code);
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
    checkedSize = codeOpeningSize;
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
    if (!heading) effects.exit('paragraph');
    effects.exit(outerType);
  }

  function finish(code: Code): State | undefined {
    if (!multiline) return nok(code);
    effects.exit('chunkText');
    closeOuter();
    return ok(code);
  }

  function continueLine(code: Code): State | undefined {
    effects.consume(code);
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

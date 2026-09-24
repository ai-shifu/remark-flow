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
 * the first `]` the escape rule leaves unescaped, exactly where `INTERACTION_CONTENT_SOURCE` ends
 * it, and the whole span becomes a text node carrying the source unchanged. The existing visitor
 * then finds it there and parses it, as it always has, but now from what the author wrote.
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
  enter(type: string): unknown;
  exit(type: string): unknown;
  consume(code: Code): void;
}

interface Token {
  type: string;
}

interface CompileContext {
  enter(node: { type: 'text'; value: string }, token: Token): unknown;
  exit(token: Token): unknown;
  sliceSerialize(token: Token): string;
  stack: Array<{
    type: string;
    value?: string;
    data?: Record<string, unknown>;
  }>;
}

/** Set on a text node this construct produced, so the visitor knows it holds an interaction. */
export const TOKENIZED_INTERACTION = 'flowInteraction';

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
const BACKSLASH = 92;
// The characters a backslash escapes inside an interaction: `|`, `/`, `.`, `]`. Mirrors ESCAPABLE.
const ESCAPABLE_CODES = new Set([124, 47, 46, 93]);

const INTERACTION = 'flowInteraction';
const MARKER = 'flowInteractionMarker';
const DATA = 'flowInteractionData';
const LINE_ENDING = 'lineEnding';

/** Whether `code` is one of micromark's virtual line endings (CR, LF, CRLF). */
const isLineEnding = (code: Code): boolean => code !== null && code < -2;

function tokenizeInteraction(
  this: unknown,
  effects: Effects,
  ok: State,
  nok: State
): State {
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
    effects.exit(INTERACTION);
    return ok(code);
  }
}

/** The micromark syntax extension: `?` may open an interaction wherever inline text is read. */
export function interactionSyntax(): Record<string, unknown> {
  return {
    text: {
      [QUESTION_MARK]: {
        name: 'flowInteraction',
        tokenize: tokenizeInteraction,
      },
    },
  };
}

/** The mdast extension: the whole span becomes a text node holding the source as written. */
export function interactionFromMarkdown(): Record<string, unknown> {
  return {
    transforms: [
      (tree: { data?: Record<string, unknown> }) => {
        tree.data = { ...tree.data, [TOKENIZED_TREE]: true };
      },
    ],
    enter: {
      [INTERACTION](this: CompileContext, token: Token) {
        this.enter({ type: 'text', value: '' }, token);
      },
    },
    exit: {
      [INTERACTION](this: CompileContext, token: Token) {
        const node = this.stack[this.stack.length - 1];
        node.value = this.sliceSerialize(token);
        node.data = { ...node.data, [TOKENIZED_INTERACTION]: true };
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

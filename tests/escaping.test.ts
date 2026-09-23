/**
 * Escaping the delimiters inside an interaction's brackets.
 *
 * The grammar gives `|`, `//`, `...` and `]` structural meaning, so option text containing one of
 * them used to be read as a different question -- or as no question at all. These cover the
 * escape that makes such text ordinary, and, just as importantly, that content written before the
 * escape existed still parses exactly as it did.
 *
 * The cases mirror `tests/test_escaping.py` in markdown-flow-agent-py. The backend renders an
 * interaction and proves the meaning survived by parsing its own output with that parser; this
 * one is what the browser then reads it with, so the two have to agree.
 */

import {
  escapeInteractionText,
  findUnescaped,
  splitOnEllipsis,
  splitOnSingleUnescapedPipe,
  splitUnescaped,
  unescapeInteractionText,
} from '../src/escaping';
import { COMPILED_REGEXES, InteractionParser } from '../src/interaction-parser';
import {
  escapeInteractionText as pkgEscape,
  INTERACTION_CONTENT_SOURCE as PKG_CONTENT_SOURCE,
  unescapeInteractionText as pkgUnescape,
} from '../src/index';

describe('the escape rule', () => {
  test.each([
    'https://a.com/x',
    '^[a-z]+$',
    'a|b',
    'array[0]',
    'wait... ok',
    'all of them: | // ... ]',
    '....four dots',
    '..two dots',
    'U.S.A.',
    '',
    'plain',
  ])('escaping then unescaping returns the same text: %s', text => {
    expect(unescapeInteractionText(escapeInteractionText(text))).toBe(text);
  });

  test.each(['Yes, I agree.', 'U.S.A.', '..two dots', '1.5 metres', 'end.'])(
    'a period that cannot become an ellipsis is left alone: %s',
    text => {
      // Escaping every dot puts a backslash in most sentences, in everything that stores the
      // raw interaction. Only a run of three or more is a delimiter.
      expect(escapeInteractionText(text)).toBe(text);
    }
  );

  test.each(['wait... ok', '....four', 'a.....b'])(
    'a run that could be an ellipsis is escaped whole: %s',
    text => {
      const escaped = escapeInteractionText(text);
      expect(findUnescaped(escaped, '...')).toBe(-1);
      expect(unescapeInteractionText(escaped)).toBe(text);
    }
  );

  test.each([
    '$\\pi_\\theta$',
    '\\beta \\to 0',
    'a \\\\ b',
    '\\nabla\\log \\pi',
    '\\text{OPD}',
  ])('a backslash that is not an escape is left alone: %s', text => {
    // Every backslash in published courses is LaTeX; a general escape would eat it. Measured:
    // of 110,685 interactions, 97 contain one and all are LaTeX, `\\` among them as a line break.
    expect(unescapeInteractionText(text)).toBe(text);
  });

  test('only a delimiter can be escaped', () => {
    expect(unescapeInteractionText('\\|')).toBe('|');
    expect(unescapeInteractionText('\\]')).toBe(']');
    expect(unescapeInteractionText('\\/')).toBe('/');
    expect(unescapeInteractionText('\\.')).toBe('.');
    expect(unescapeInteractionText('\\x')).toBe('\\x');
    expect(unescapeInteractionText('\\\\')).toBe('\\\\');
  });

  test('a backslash before an escape stays a backslash', () => {
    // `\\|` is a backslash and then an escaped bar, read left to right.
    expect(unescapeInteractionText('\\\\|')).toBe('\\|');
  });

  test('splitting skips escaped separators', () => {
    expect(splitOnSingleUnescapedPipe('a\\|b | c')).toEqual(['a\\|b ', ' c']);
    expect(splitUnescaped('x\\|\\|y || z', '||')).toEqual(['x\\|\\|y ', ' z']);
    expect(splitOnSingleUnescapedPipe('a || b')).toEqual(['a || b']);
  });

  test('a separator that begins inside an escape is not one', () => {
    // In `\//`, the second slash is the escaped character, not the start of a separator.
    expect(findUnescaped('a\\//b', '//')).toBe(-1);
    expect(findUnescaped('a//b', '//')).toBe(1);
  });

  test('an ellipsis below the first line is not a text box', () => {
    // Inherited from the anchored regex this replaces.
    expect(splitOnEllipsis('A\n| ...hint')).toBeNull();
    expect(splitOnEllipsis('A | ...hint')).toEqual(['A | ', 'hint']);
  });

  test('an escaped ellipsis does not split', () => {
    expect(splitOnEllipsis('wait\\.\\.\\. | go')).toBeNull();
  });
});

describe('through the parser', () => {
  let parser: InteractionParser;
  beforeEach(() => {
    parser = new InteractionParser();
  });

  test.each(['https://a.com/x', '^[a-z]+$', 'a|b', 'array[0]', 'wait... ok'])(
    'an option the grammar used to reshape now survives: %s',
    option => {
      const parsed = parser.parse(
        `?[%{{v}} ${escapeInteractionText(option)} | other]`
      ) as { variable: string; buttons: { display: string }[] };
      expect(parsed.buttons.map(b => b.display)).toEqual([option, 'other']);
      expect(parsed.variable).toBe('v');
    }
  );

  test.each([
    [
      '?[%{{v}} A | B]',
      [
        ['A', 'A'],
        ['B', 'B'],
      ],
    ],
    [
      '?[%{{v}} A//a || B//b]',
      [
        ['A', 'a'],
        ['B', 'b'],
      ],
    ],
    ['?[Continue]', [['Continue', 'Continue']]],
    [
      '?[%{{cue}} The subscript $\\pi_\\theta$ | The KL term]',
      [
        ['The subscript $\\pi_\\theta$', 'The subscript $\\pi_\\theta$'],
        ['The KL term', 'The KL term'],
      ],
    ],
  ])(
    'interactions written before escapes existed parse unchanged: %s',
    (source, expected) => {
      const parsed = parser.parse(source as string) as {
        buttons: { display: string; value: string }[];
      };
      expect(parsed.buttons.map(b => [b.display, b.value])).toEqual(expected);
    }
  );

  test('an escaped bracket does not end the interaction', () => {
    expect(COMPILED_REGEXES.LAYER1_INTERACTION.exec('?[a\\]b | c]')?.[1]).toBe(
      'a\\]b | c'
    );
    // An unescaped one still does, exactly as before.
    expect(COMPILED_REGEXES.LAYER1_INTERACTION.exec('?[a]b | c]')?.[1]).toBe(
      'a'
    );
    // And a link is still not an interaction.
    expect(COMPILED_REGEXES.LAYER1_INTERACTION.exec('?[x](url)')).toBeNull();
  });

  test('the scanner and the regex agree about a trailing backslash', () => {
    // In `?[a\\]` the second backslash escapes the bracket, so nothing closes the interaction.
    // The regex must not backtrack into reading that backslash as plain text: two parsers of one
    // grammar disagreeing about where an interaction ends is worse than either answer.
    expect(COMPILED_REGEXES.LAYER1_INTERACTION.exec('?[a\\\\]')).toBeNull();
  });

  test('an escaped ellipsis is option text, not a text box', () => {
    const parsed = parser.parse('?[%{{v}} wait\\.\\.\\. | go]') as {
      buttons: { display: string }[];
      question?: string;
    };
    expect(parsed.buttons.map(b => b.display)).toEqual(['wait...', 'go']);
    expect(parsed.question).toBeUndefined();
  });

  test('a real ellipsis still opens a text box', () => {
    const parsed = parser.parse('?[%{{v}} A | B | ...type here]') as {
      buttons: { display: string }[];
      question?: string;
    };
    expect(parsed.question).toBe('type here');
    expect(parsed.buttons.map(b => b.display)).toEqual(['A', 'B']);
  });

  test('an escaped double slash keeps the whole text as the display', () => {
    const parsed = parser.parse('?[%{{v}} https:\\/\\/a\\.com]') as {
      buttons: { display: string; value: string }[];
    };
    expect(parsed.buttons[0].display).toBe('https://a.com');
    expect(parsed.buttons[0].value).toBe('https://a.com');
  });
});

describe('the package surface', () => {
  test('the escape rule is exported, so no one writes a second copy of it', () => {
    // markdown-flow-ui scans for `?[...]` in its editor highlighting and its shortcode reader.
    // Both need this exact definition of where an interaction ends; a private copy would be
    // fooled by an escaped bracket.
    expect(typeof pkgEscape).toBe('function');
    expect(typeof pkgUnescape).toBe('function');
    expect(typeof PKG_CONTENT_SOURCE).toBe('string');
    expect(
      new RegExp(`\\?\\[(${PKG_CONTENT_SOURCE})\\]`).exec('?[a\\]b]')?.[1]
    ).toBe('a\\]b');
  });
});

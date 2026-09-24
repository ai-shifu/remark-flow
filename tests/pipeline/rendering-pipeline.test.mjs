// Interactions read through the Markdown pipeline a browser renders them with.
//
// The jest suite hands the plugins trees built by hand, so it never saw what Markdown does to an
// interaction before the plugin runs: the backslash escapes were consumed and GFM cut URLs out
// into link nodes, and a question whose options carried a URL was shown as raw text. These run
// the built package the way markdown-flow-ui does -- GFM, math and breaks around it -- and hold
// the grammar's promise where it matters: what was escaped is what the learner is offered.
//
// Plain node:test against dist/, because remark and micromark are ESM-only and jest here is not.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';

const require = createRequire(import.meta.url);
const {
  remarkFlow,
  remarkInteraction,
  escapeInteractionText,
  InteractionParser,
} = require('../../dist/index.js');

const render = (markdown, plugin = remarkFlow) => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(plugin)
    .use(remarkBreaks);
  return processor.runSync(processor.parse(markdown));
};

const interactions = tree => {
  const found = [];
  const walk = node => {
    if (node.type === 'element' && node.data?.hName === 'custom-variable') {
      found.push(node.data.hProperties);
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return found;
};

const only = (markdown, plugin) => {
  const found = interactions(render(markdown, plugin));
  assert.equal(
    found.length,
    1,
    `expected one interaction in ${JSON.stringify(markdown)}`
  );
  return found[0];
};

test('a question whose options carry URLs is an interaction with those URLs intact', () => {
  // The question a 2.0 lesson asked, as the backend sent it; the learner saw it as raw text.
  const got = only(
    String.raw`?[%{{读过的文档站}} Spring 官方文档 https:\/\/docs.spring.io\/spring-framework\/reference\/index.html || Redis 官方文档 https:\/\/redis.io\/docs\/latest\/]`
  );
  assert.equal(got.variableName, '读过的文档站');
  assert.equal(got.isMultiSelect, true);
  assert.deepEqual(got.buttonTexts, [
    'Spring 官方文档 https://docs.spring.io/spring-framework/reference/index.html',
    'Redis 官方文档 https://redis.io/docs/latest/',
  ]);
  assert.deepEqual(got.buttonValues, got.buttonTexts);
});

test('an escaped bar stays inside its option', () => {
  const got = only(String.raw`?[%{{x}} a\|b | c]`);
  assert.deepEqual(got.buttonTexts, ['a|b', 'c']);
});

test('an escaped bracket does not end the interaction', () => {
  const got = only(String.raw`?[%{{x}} [a-z\]+ | c]`);
  assert.deepEqual(got.buttonTexts, ['[a-z]+', 'c']);
});

test('an escaped ellipsis is an option, not a text box', () => {
  const got = only(String.raw`?[%{{x}} wait\.\.\. | go]`);
  assert.deepEqual(got.buttonTexts, ['wait...', 'go']);
});

test('the display // value split still works', () => {
  const got = only('?[%{{level}} Beginner//1 | Expert//3]');
  assert.deepEqual(got.buttonTexts, ['Beginner', 'Expert']);
  assert.deepEqual(got.buttonValues, ['1', '3']);
});

test('an option with math keeps its dollar signs rather than being cut into a math node', () => {
  const got = only(String.raw`?[%{{x}} $\pi$ | $\beta$]`);
  assert.deepEqual(got.buttonTexts, [String.raw`$\pi$`, String.raw`$\beta$`]);
});

test('an unescaped question keeps its text box and placeholder', () => {
  const got = only('?[%{{方向}} 前端 | 后端 | 数据 | ...你关心什么方向？]');
  assert.deepEqual(got.buttonTexts, ['前端', '后端', '数据']);
  assert.equal(got.placeholder, '你关心什么方向？');
});

test('prose around an interaction is still Markdown', () => {
  const tree = render(
    '**先想一想**：?[%{{x}} A | B] 然后继续 https://example.com'
  );
  const paragraph = tree.children[0];
  assert.deepEqual(
    paragraph.children
      .filter(node => !(node.type === 'text' && node.value === ''))
      .map(node => node.type),
    ['strong', 'text', 'element', 'text', 'link']
  );
  assert.equal(interactions(tree).length, 1);
});

test('a link written as ?[text](url) is left a link', () => {
  const tree = render('?[docs](https://example.com)');
  assert.equal(interactions(tree).length, 0);
  assert.ok(JSON.stringify(tree).includes('"type":"link"'));
});

test('an escaped question mark is text', () => {
  assert.equal(interactions(render(String.raw`\?[A | B]`)).length, 0);
});

test('an interaction inside code is code', () => {
  assert.equal(interactions(render('`?[A | B]`')).length, 0);
  assert.equal(interactions(render('```\n?[A | B]\n```')).length, 0);
});

test('an interaction across lines is read as the parser reads its source', () => {
  const source = '?[%{{x}} A\n| B]';
  assert.deepEqual(
    only(source),
    new InteractionParser().parseToRemarkFormat(source)
  );
});

test('an unclosed interaction is left as text', () => {
  assert.equal(interactions(render('?[A | B')).length, 0);
});

test('remarkInteraction tokenizes the same way remarkFlow does', () => {
  const got = only(String.raw`?[%{{x}} a\/\/b | c]`, remarkInteraction);
  assert.deepEqual(got.buttonTexts, ['a//b', 'c']);
});

// The invariant the escape exists for, measured through the pipeline rather than the parser: any
// option text, once escaped, comes back as itself.
test('escaped options come back unchanged through the whole pipeline', () => {
  const alphabet = [
    'a',
    'Z',
    '中',
    ' ',
    '|',
    '/',
    '.',
    ']',
    '[',
    '\\',
    '$',
    '*',
    '_',
    '`',
    ':',
    '&',
    'h',
    't',
    'p',
    's',
    '#',
    '(',
    ')',
    '<',
    '>',
  ];
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const word = () => {
    let out = 'x';
    const length = 1 + Math.floor(random() * 12);
    for (let i = 0; i < length; i += 1) {
      out += alphabet[Math.floor(random() * alphabet.length)];
    }
    return `${out}y`;
  };
  const samples = [
    'https://docs.spring.io/a/b',
    'C:\\path\\to',
    'a || b',
    '[a-z]+\\.md',
    '*not emphasis*',
    '`not code`',
    '&amp; stays',
  ];
  for (let i = 0; i < 300; i += 1) {
    samples.push(word());
  }
  for (const sample of samples) {
    // Trimmed, as the grammar trims every option; a backslash cannot sit right before a
    // delimiter, which is the escape rule's one documented cost.
    const option = sample.trim();
    if (/\\[|/.\]]/.test(option) || option.endsWith('\\')) {
      continue;
    }
    const markdown = `?[%{{v}} ${escapeInteractionText(option)} || other]`;
    const got = only(markdown);
    assert.deepEqual(
      got.buttonTexts,
      [option, 'other'],
      `for ${JSON.stringify(option)}`
    );
  }
});

test('a tree parsed elsewhere is still read the way it always was', () => {
  // `runSync` on a tree this processor did not parse: nothing in it was tokenized, so the
  // plugin must fall back to finding interactions in text, as it did before the tokenizer.
  const tree = unified().use(remarkParse).parse('Pick: ?[%{{x}} A | B]');
  const processor = unified().use(remarkParse).use(remarkFlow);
  const found = interactions(processor.runSync(tree));
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].buttonTexts, ['A', 'B']);
});

test('an escaped question after a real one on the same line stays text', () => {
  const tree = render(String.raw`?[%{{x}} A | B] then \?[C | D]`);
  const found = interactions(tree);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].buttonTexts, ['A', 'B']);
});

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
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { TextEncoder } from 'node:util';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';

const require = createRequire(import.meta.url);
const contractCases = JSON.parse(
  readFileSync(
    new URL('../fixtures/variable-name-cases.json', import.meta.url),
    'utf8'
  )
);
const {
  remarkFlow,
  remarkInteraction,
  remarkCustomVariable,
  escapeInteractionText,
  InteractionParser,
  extractVariableNames,
  formatVariableAssignment,
} = require('../../dist/index.js');

const render = (markdown, plugin = remarkFlow) => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(plugin)
    .use(remarkBreaks);
  return processor.runSync(processor.parse(markdown), markdown);
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
    'www.example.com',
    'https://www.postgresql.org/docs/current/',
    'mail me at a@b.co',
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

test('an option with a www. address or an email is not cut up by GFM after parsing', () => {
  // GFM finds `www.` links and emails in text nodes after the parse, which split the node the
  // tokenizer produced. The question a 2.0 lesson asked on sim had `https://www.postgresql.org`
  // as its last option and was shown as raw text.
  const got = only(
    String.raw`?[%{{v}} Spring https:\/\/docs.spring.io\/a || PostgreSQL https:\/\/www.postgresql.org\/docs\/current\/ || 写信 a@b.co]`
  );
  assert.deepEqual(got.buttonTexts, [
    'Spring https://docs.spring.io/a',
    'PostgreSQL https://www.postgresql.org/docs/current/',
    '写信 a@b.co',
  ]);
});

test('an interaction that does not parse is left as its text, with no node of its own behind', () => {
  const tree = render('先 ?[%{bad} A | B] 后');
  assert.equal(interactions(tree).length, 0);
  const types = [];
  const walk = node => {
    types.push(node.type);
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  assert.ok(!types.includes('flowInteraction'), JSON.stringify(types));
  assert.ok(JSON.stringify(tree).includes('?[%{bad} A | B]'));
});

test('question keys and existing engine names survive the actual Markdown pipeline', () => {
  const names = [
    'gender_1',
    '你的性别是',
    '你的性别是?',
    '你的性别是？',
    '问题:答案：',
    'question/answer',
    'a-b.c',
    'a|b',
    'a...b',
    'a//b',
    'café',
    'آپ؟',
    '🙂',
    '\ufeffname',
    'name\ufeff',
    'a\ufeffb',
    '\ufeff',
    'has  two spaces',
    'a{b',
    'a}b',
    'a}',
    '{{nested',
    'a[b]c',
    'a]b|//... [c]',
    String.raw`a\]b`,
    '**bold** https://www.example.com $x$ &amp;',
    '"quoted"',
  ];
  for (const plugin of [remarkFlow, remarkInteraction, remarkCustomVariable]) {
    for (const name of names) {
      const got = only(`?[%{{ ${name} }} 男 | 女 | 秘密]`, plugin);
      assert.deepEqual(got, {
        variableName: name,
        buttonTexts: ['男', '女', '秘密'],
        buttonValues: ['男', '女', '秘密'],
        isMultiSelect: false,
      });
    }
  }
});

test('Python-only marker whitespace is trimmed without consuming U+FEFF from the key', () => {
  const got = only(
    '?[%{{\u0085\u001c\u001d\u001e\u001f\ufeff问题？\ufeff\u0085}} 男 | 女]'
  );
  assert.equal(got.variableName, '\ufeff问题？\ufeff');
  assert.deepEqual(got.buttonTexts, ['男', '女']);
});

test('a bracket inside an assignment belongs to the name', () => {
  const got = only('?[%{{a]b}} 男 | 女]');
  assert.equal(got.variableName, 'a]b');
  assert.deepEqual(got.buttonTexts, ['男', '女']);
});

test('opaque variable delimiters and Markdown syntax survive with escaped option content', () => {
  const name = String.raw`问题 {{内部} [a] | // ... \] **literal**`;
  const source = `?[%{{ ${name} }} ${escapeInteractionText('https://example.com/a|b...')} | other]`;
  const got = only(source);
  assert.equal(got.variableName, name);
  assert.deepEqual(got.buttonTexts, ['https://example.com/a|b...', 'other']);
  assert.deepEqual(extractVariableNames(source), [name]);
});

test('a marker closing on the next source chunk still ends before the option syntax', () => {
  // These prefixes are the states reached while an SSE response is being appended. No prefix
  // is a complete interaction, so none may create a partial button before the final `]` arrives.
  const source = '?[%{{ question] | // ... } name }} A | B]';
  for (let end = 1; end < source.length; end += 1) {
    assert.equal(
      interactions(render(source.slice(0, end))).length,
      0,
      `prefix ${end}`
    );
  }
  assert.equal(only(source).variableName, 'question] | // ... } name');
});

test('invalid and unclosed leading markers are kept whole instead of finding a nested key', () => {
  for (const source of [
    '?[%{{bad\n{{inner}} A | B]',
    '?[%{{bad\u0085key}} A | B]',
    '?[%{{bad\u0000key}} A | B]',
    '?[%{{bad]unclosed A | B]',
    '?[%{{ }} A | B]',
    '?[%{{ broken ?[INNER | NEXT]',
    '?[%{{ broken ?[INNER | NEXT]\n',
    '?[%{{ broken ?[INNER | NEXT] }}',
  ]) {
    assert.equal(interactions(render(source)).length, 0, source);
  }
});

test('ordinary multiline marker padding is accepted without allowing a newline in the key', () => {
  const got = only('?[%{{\n question with spaces \r\n}} A | B]');
  assert.equal(got.variableName, 'question with spaces');
});

test('padded serialization preserves a final single brace in an opaque key', () => {
  const got = only(`?[${formatVariableAssignment('question}')} A | B]`);
  assert.equal(got.variableName, 'question}');
  const early = only('?[%{{question}}} A | B]');
  assert.equal(early.variableName, 'question');
  assert.deepEqual(early.buttonTexts, ['} A', 'B']);
});

test('the shared contract interactions survive every actual Markdown plugin path', () => {
  for (const plugin of [remarkFlow, remarkInteraction, remarkCustomVariable]) {
    for (const sample of contractCases.interactions) {
      assert.deepEqual(only(sample.source, plugin), {
        variableName: sample.name,
        buttonTexts: sample.buttons,
        buttonValues: sample.values,
        isMultiSelect: false,
      });
    }
  }
});

test('original VFile offsets preserve invalid NUL and a valid literal replacement character', () => {
  const tree = render(
    '前缀🙂 ?[%{{bad\u0000key}} A | B] 中间 ?[%{{bad\ufffdkey}} A | B]'
  );
  const found = interactions(tree);
  assert.equal(found.length, 1);
  assert.equal(found[0].variableName, 'bad\ufffdkey');
  assert.ok(JSON.stringify(tree).includes('bad\\u0000key'));
});

test('string and byte-valued VFiles preserve raw key validity through every plugin', () => {
  const source =
    '前缀🙂 ?[%{{bad\u0000key}} A | B] 中间 ?[%{{good\ufffd题}} C | D] 尾部 {{raw\u0000题}}';
  const encoded = new TextEncoder().encode(source);
  const storage = new Uint8Array(encoded.length + 6);
  storage.set(encoded, 3);
  const values = [
    source,
    Buffer.from(source, 'utf8'),
    encoded,
    storage.subarray(3, 3 + encoded.length),
  ];
  for (const plugin of [remarkFlow, remarkInteraction, remarkCustomVariable]) {
    for (const value of values) {
      // unified creates a real VFile for both parse and runSync, retaining its supported value
      // representation. Token offsets are decoded UTF-16 offsets, not UTF-8 byte offsets.
      const tree = render({ value }, plugin);
      assert.deepEqual(interactions(tree), [
        {
          variableName: 'good\ufffd题',
          buttonTexts: ['C', 'D'],
          buttonValues: ['C', 'D'],
          isMultiSelect: false,
        },
      ]);
      const serialized = JSON.stringify(tree);
      assert.ok(serialized.includes('bad\\u0000key'));
      assert.ok(serialized.includes('raw\\u0000题'));
    }
  }
});

test('shared marker boundaries are atomic in every actual Markdown plugin path', () => {
  for (const plugin of [remarkFlow, remarkInteraction, remarkCustomVariable]) {
    for (const sample of contractCases.boundary_cases) {
      const found = interactions(render(sample.source, plugin));
      assert.equal(found.length, sample.interaction_count, sample.source);
      if (sample.interaction_count) {
        const expected = {
          buttonTexts: sample.buttons,
          buttonValues: sample.values,
          isMultiSelect: false,
        };
        assert.deepEqual(
          found[0],
          sample.name === null
            ? expected
            : { ...expected, variableName: sample.name },
          sample.source
        );
      }
    }
  }
});

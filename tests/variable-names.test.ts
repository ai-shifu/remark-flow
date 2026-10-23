import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createVariableExpressionRegex,
  extractVariableNames,
  findDocumentVariableMarkers,
  findVariableMarkers,
  formatVariableAssignment,
  formatVariableReference,
  InteractionParser,
  isValidVariableName,
  normalizeVariableName,
  readVariableMarker,
  trimVariablePadding,
  VARIABLE_ASSIGNMENT_SOURCE,
  VARIABLE_NAME_SOURCE,
  VARIABLE_REFERENCE_SOURCE,
} from '../src/index';
import remarkCustomVariable from '../src/remark-custom-variable';
import {
  createParentNode,
  createTextNode,
  findCustomVariableNodes,
} from './test-utils';

const names = [
  'gender',
  '_user_1',
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
  'has  two spaces',
  'a\u00a0b',
  'a{b',
  'a}b',
  'a}',
  '{{nested',
  'a[b]c',
  'a]b|//... [c]',
  String.raw`a\]b`,
  '"quoted"',
];

describe('the shared variable-name grammar', () => {
  test('preserves a long internal padding run without treating it as edge padding', () => {
    const name = `a${' '.repeat(65536)}b`;
    expect(trimVariablePadding(`\u0085 ${name} \t`)).toBe(name);
    expect(normalizeVariableName(` ${name} `)).toBe(name);
    expect(extractVariableNames(`{{ ${name} }}`)).toEqual([name]);
    const pattern = new RegExp(`^${VARIABLE_REFERENCE_SOURCE}$`, 'u');
    expect(pattern.exec(`{{ ${name} }}`)?.[1]).toBe(name);
    expect(pattern.exec(`{{ ${name}`)).toBeNull();
    expect(readVariableMarker(`{{ ${name}`)).toBeNull();
  });
  test.each(names)('keeps the exact name %s', name => {
    expect(normalizeVariableName(` ${name} `)).toBe(name);
    expect(isValidVariableName(name)).toBe(true);
    expect(new RegExp(`^${VARIABLE_NAME_SOURCE}$`, 'u').test(name)).toBe(true);
    const expression = `{{ ${name} }}`;
    expect(createVariableExpressionRegex('gu').exec(expression)?.[1]).toBe(
      name
    );
    expect(
      new RegExp(VARIABLE_REFERENCE_SOURCE, 'u').exec(expression)?.[1]
    ).toBe(name);
    expect(
      new RegExp(VARIABLE_ASSIGNMENT_SOURCE, 'u').exec(`%${expression}`)?.[1]
    ).toBe(name);
  });

  test.each([
    '',
    '   ',
    'a\tb',
    'a\nb',
    'a\rb',
    'a\u0000b',
    'a\u007fb',
    'a\u0085b',
    'a\u2028b',
    'a\u2029b',
  ])(
    'rejects a blank name or an internal control or line separator: %s',
    name => {
      expect(normalizeVariableName(name)).toBeNull();
      expect(isValidVariableName(name)).toBe(false);
      expect(extractVariableNames(`{{${name}}}`)).toEqual([]);
    }
  );

  test('extracts assignments and references in order without changing existing source scope', () => {
    const text = [
      '?[%{{ 你的性别是？ }} 男 | 女 | 秘密]',
      '{{你的性别是？}} {{你的性别是?}}',
      '`{{café}}` <!-- {{آپ؟}} -->',
      '{{a|b}} {{a...b}} {{a//b}} {{has space}}',
    ].join('\n');
    expect(extractVariableNames(text)).toEqual([
      '你的性别是？',
      '你的性别是?',
      'café',
      'آپ؟',
      'a|b',
      'a...b',
      'a//b',
      'has space',
    ]);
  });

  test('keeps incomplete literal examples inside their own code and HTML boundaries', () => {
    for (const literal of [
      '`{{`',
      '``{{ incomplete ` example``',
      '<span title="a > {{">',
      "<span title='{{'>",
      '<!-- {{ -->',
      '<![CDATA[ {{ ]]>',
      '<?example {{ ?>',
      '<!DOCTYPE {{ >',
    ]) {
      expect(extractVariableNames(`${literal} ?[%{{ q }} A|B]`)).toEqual(['q']);
    }
    for (const [opening, closing] of [
      ['```', '```'],
      ['```', '````'],
      ['~~~', '~~~~'],
      ['  ~~~', '  ~~~~'],
    ]) {
      const source = `${opening}md\n%{{ inner }}\n{{ unclosed\n${closing}\n?[%{{ q }} A|B]`;
      expect(extractVariableNames(source)).toEqual(['inner', 'q']);
    }
    expect(extractVariableNames(String.raw`\{{ skipped }} {{ q }}`)).toEqual([
      'q',
    ]);
    expect(extractVariableNames(String.raw`\\{{ kept }}`)).toEqual(['kept']);
    expect(
      extractVariableNames('`%{{ code }}` <span title="%{{ attr }}">')
    ).toEqual(['code', 'attr']);
    expect(
      extractVariableNames('`{{` '.repeat(3000) + '?[%{{ q }} A|B]')
    ).toEqual(['q']);
  });

  test('returns original document ranges for complete, invalid, and unclosed markers', () => {
    const source = '🙂 Show `{{` then ?[%{{ q }} A|B] {{bad\nkey}} {{unclosed';
    const ranges = findDocumentVariableMarkers(source);
    const codeOpening = source.indexOf('{{');
    const question = source.indexOf('{{ q }}');
    const invalid = source.indexOf('{{bad');
    const unclosed = source.indexOf('{{unclosed');
    expect(ranges).toEqual([
      { start: codeOpening, end: codeOpening + 2, rawName: '', name: null },
      {
        start: question,
        end: question + '{{ q }}'.length,
        rawName: ' q ',
        name: 'q',
      },
      {
        start: invalid,
        end: invalid + '{{bad\nkey}}'.length,
        rawName: 'bad\nkey',
        name: null,
      },
      { start: unclosed, end: source.length, rawName: 'unclosed', name: null },
    ]);
    expect(extractVariableNames(source)).toEqual(['q']);
    expect(findDocumentVariableMarkers('{{open ?[A|B]')).toEqual([
      {
        start: 0,
        end: '{{open ?[A|B]'.length,
        rawName: 'open ?[A|B]',
        name: null,
      },
    ]);
    // Raw APIs intentionally retain their original syntax-only behavior.
    expect(findVariableMarkers('{{open ?[A|B]')).toEqual([]);
    expect(findVariableMarkers(String.raw`\{{ kept }}`)[0].name).toBe('kept');
  });

  test.each(
    ['`', '``'].flatMap(ticks =>
      [
        '\n\n',
        '\n \t\n',
        '\r\n\r\n',
        '\n```text\nexample\n```\n',
        '\n~~~\nexample\n~~~\n',
      ].map(boundary => ({ ticks, boundary }))
    )
  )(
    'does not pair $ticks across a paragraph or fence: $boundary',
    ({ ticks, boundary }) => {
      const source = `Show ${ticks}{{${boundary}${ticks} then ?[%{{ q }} A|B]`;
      const marker = readVariableMarker(source, source.indexOf('{{'));
      expect(marker).not.toBeNull();
      expect(findDocumentVariableMarkers(source)).toEqual([marker]);
      expect(extractVariableNames(source)).toEqual(
        marker?.name === null ? [] : [marker?.name]
      );
    }
  );

  test('keeps literal-local ranges in the original source and does not deduplicate them', () => {
    const source = '🙂 `%{{ q }}` <span title="%{{ q }}"> {{ q }}';
    const ranges = findDocumentVariableMarkers(source);
    expect(ranges.map(marker => marker.name)).toEqual(['q', 'q', 'q']);
    for (const marker of ranges) {
      expect(source.slice(marker.start, marker.end)).toBe('{{ q }}');
      expect(marker.rawName).toBe(' q ');
    }
    expect(extractVariableNames(source)).toEqual(['q']);
    const fenced = '~~~md\n{{unclosed\n~~~~\n{{ outside }}';
    const markers = findDocumentVariableMarkers(fenced);
    expect(markers[0]).toEqual({
      start: fenced.indexOf('{{'),
      end: fenced.indexOf('~~~~'),
      rawName: 'unclosed\n',
      name: null,
    });
    expect(markers[1].name).toBe('outside');
    expect(fenced.slice(markers[1].start, markers[1].end)).toBe(
      '{{ outside }}'
    );
    const html = '<span title="{{"> {{ outside }}';
    const htmlMarkers = findDocumentVariableMarkers(html);
    expect(htmlMarkers[0].end).toBe(html.indexOf('>') + 1);
    expect(htmlMarkers[0].name).toBeNull();
    expect(htmlMarkers[1].name).toBe('outside');
  });

  test('keeps a code opening after an escaped first tick in the same run', () => {
    for (const width of [2, 3, 4]) {
      const ticks = '`'.repeat(width);
      const source = `Show \\${ticks}{{${ticks.slice(1)} then ?[%{{ q }} A|B]`;
      expect(extractVariableNames(source)).toEqual(['q']);
    }
  });

  test('does not share matcher state or normalize punctuation and case', () => {
    const first = createVariableExpressionRegex();
    first.exec('{{one}} {{two}}');
    expect(createVariableExpressionRegex().lastIndex).toBe(0);
    expect(
      extractVariableNames('{{Name}} {{name}} {{问题?}} {{问题？}}')
    ).toEqual(['Name', 'name', '问题?', '问题？']);
  });

  test.each([
    '\u0009',
    '\u000a',
    '\u000b',
    '\u000c',
    '\u000d',
    '\u001c',
    '\u001d',
    '\u001e',
    '\u001f',
    '\u0020',
    '\u0085',
    '\u00a0',
    '\u1680',
    '\u2000',
    '\u2001',
    '\u2002',
    '\u2003',
    '\u2004',
    '\u2005',
    '\u2006',
    '\u2007',
    '\u2008',
    '\u2009',
    '\u200a',
    '\u2028',
    '\u2029',
    '\u202f',
    '\u205f',
    '\u3000',
  ])('uses the Python whitespace definition for U+%s', whitespace => {
    expect(normalizeVariableName(`${whitespace}问题？${whitespace}`)).toBe(
      '问题？'
    );
    const point = whitespace.codePointAt(0)!;
    const forbiddenInside =
      point <= 0x1f ||
      (point >= 0x7f && point <= 0x9f) ||
      point === 0x2028 ||
      point === 0x2029;
    expect(isValidVariableName(`a${whitespace}b`)).toBe(!forbiddenInside);
    expect(
      extractVariableNames(`{{${whitespace}问题？${whitespace}}}`)
    ).toEqual(['问题？']);
    expect(
      new InteractionParser().parseToRemarkFormat(
        `?[%{{${whitespace}问题？${whitespace}}} 男 | 女]`
      ).variableName
    ).toBe('问题？');
  });

  test.each(['\ufeffname', 'name\ufeff', 'a\ufeffb', '\ufeff'])(
    'preserves U+FEFF as a real key character: %s',
    name => {
      expect(normalizeVariableName(` ${name} `)).toBe(name);
      expect(isValidVariableName(name)).toBe(true);
      expect(extractVariableNames(`{{ ${name} }}`)).toEqual([name]);
      expect(
        new InteractionParser().parseToRemarkFormat(`?[%{{ ${name} }} A | B]`)
          .variableName
      ).toBe(name);
    }
  );

  test('reads the first closing marker once, without decoding or nested extraction', () => {
    const source = 'prefix {{ outer {{inner }} suffix {{ next }}';
    expect(findVariableMarkers(source).map(marker => marker.name)).toEqual([
      'outer {{inner',
      'next',
    ]);
    expect(extractVariableNames(source)).toEqual(['outer {{inner', 'next']);
    expect(readVariableMarker('{{a}}}')).toMatchObject({
      rawName: 'a',
      name: 'a',
      end: 5,
    });
    expect(readVariableMarker(String.raw`{{a\}b}}`)).toMatchObject({
      name: String.raw`a\}b`,
    });
    expect(readVariableMarker('no marker')).toBeNull();
    expect(readVariableMarker('{{name}}', -1)).toBeNull();
    expect(readVariableMarker('{{name}}', 0.5)).toBeNull();
    expect(readVariableMarker('{{name}}', 99)).toBeNull();
    expect(readVariableMarker('{{unclosed')).toBeNull();
    expect(
      findVariableMarkers('{{bad\n{{inner}} {{good}}').map(
        marker => marker.name
      )
    ).toEqual([null, 'good']);
    expect(extractVariableNames('{{bad\n{{inner}} {{good}}')).toEqual(['good']);
  });

  test('serializes names with padding, including a final single brace', () => {
    for (const name of names) {
      const reference = formatVariableReference(name);
      expect(reference).toBe(`{{ ${name} }}`);
      expect(readVariableMarker(reference!)?.name).toBe(name);
      expect(extractVariableNames(reference!)).toEqual([name]);
      expect(formatVariableAssignment(name)).toBe(`%${reference}`);
    }
    expect(normalizeVariableName('a}}b')).toBeNull();
    expect(formatVariableReference('a}}b')).toBeNull();
    expect(formatVariableAssignment('')).toBeNull();
  });
});

describe('variable names in interactions', () => {
  const parser = new InteractionParser();

  test.each(names)(
    'does not read delimiters inside %s as option syntax',
    name => {
      const source = `?[%{{ ${name} }} 男 | 女 | 秘密]`;
      const expected = {
        variableName: name,
        buttonTexts: ['男', '女', '秘密'],
        buttonValues: ['男', '女', '秘密'],
        isMultiSelect: false,
      };
      expect(parser.parseToRemarkFormat(source)).toEqual(expected);

      const tree = createParentNode([createTextNode(source)]);
      remarkCustomVariable()(tree);
      expect(findCustomVariableNodes(tree)[0].data.hProperties).toEqual(
        expected
      );
    }
  );

  test('still applies display values, multi-select and a text input after the name', () => {
    expect(
      parser.parseToRemarkFormat(
        '?[%{{问题...|//？}} 是//yes || 否//no || ...说明]'
      )
    ).toEqual({
      variableName: '问题...|//？',
      buttonTexts: ['是', '否'],
      buttonValues: ['yes', 'no'],
      placeholder: '说明',
      isMultiSelect: true,
    });
  });

  test.each(['a\tb', 'a\u0000b', 'a\u0085b', 'a\u2028b'])(
    'does not assign to an invalid name %s',
    name => {
      expect(
        parser.parseToRemarkFormat(`?[%{{${name}}} 男 | 女]`).variableName
      ).toBeUndefined();
    }
  );

  test('reads brackets inside the marker before the closing interaction bracket', () => {
    const source = '?[%{{a]b}} 男 | 女]';
    expect(parser.parseToRemarkFormat(source)).toEqual({
      variableName: 'a]b',
      buttonTexts: ['男', '女'],
      buttonValues: ['男', '女'],
      isMultiSelect: false,
    });
  });

  test('the first closing marker wins and its remaining text is option content', () => {
    expect(parser.parseToRemarkFormat('?[%{{a}}b}} 男 | 女]')).toEqual({
      variableName: 'a',
      buttonTexts: ['b}} 男', '女'],
      buttonValues: ['b}} 男', '女'],
      isMultiSelect: false,
    });
  });

  test('does not turn an unclosed assignment into a truncated button', () => {
    const source = '?[%{{a]b 男 | 女]';
    expect(parser.parseToRemarkFormat(source)).toEqual({ placeholder: source });
  });

  test.each([
    '?[%{{ broken ?[INNER | NEXT]',
    '?[%{{ broken ?[INNER | NEXT]\n',
    '?[%{{ broken ?[INNER | NEXT] }}',
  ])('the text-tree fallback does not create buttons inside %s', source => {
    const tree = createParentNode([createTextNode(source)]);
    remarkCustomVariable()(tree);
    expect(findCustomVariableNodes(tree)).toEqual([]);
    expect(tree.children[0]).toMatchObject({ type: 'text', value: source });
  });
});

describe('malformed HTML closing searches', () => {
  test.each([
    ['<!--', '-->'],
    ['<![CDATA[', ']]>'],
    ['<?', '?>'],
    ['<!A', '>'],
  ])(
    'does linear delimiter-search work for repeated %s openings',
    (opening, closing) => {
      const source = `${opening.repeat(4096)}{{ visible }}`;
      const originalIndexOf = String.prototype.indexOf;
      let searchedCharacters = 0;
      const search = jest
        .spyOn(String.prototype, 'indexOf')
        .mockImplementation(function (
          this: string,
          needle: string,
          from = 0
        ): number {
          if (needle === closing)
            searchedCharacters += Math.max(0, this.length - from);
          return originalIndexOf.call(this, needle, from);
        });
      let names: string[];
      try {
        names = extractVariableNames(source);
      } finally {
        search.mockRestore();
      }
      expect(names).toEqual(['visible']);
      expect(searchedCharacters).toBeLessThanOrEqual(source.length);
    }
  );

  test('keeps complete HTML bodies and resets failed-search knowledge for each document', () => {
    expect(extractVariableNames('<!-- {{ incomplete }}')).toEqual([
      'incomplete',
    ]);
    expect(
      extractVariableNames('<!-- {{ complete }} --> {{ outside }}')
    ).toEqual(['complete', 'outside']);
    expect(
      extractVariableNames(
        `${'<!--'.repeat(4096)}{{ inside }} --> {{ outside }}`
      )
    ).toEqual(['inside', 'outside']);
    expect(
      extractVariableNames('<span title="{{ attribute }}"> {{ outside }}')
    ).toEqual(['attribute', 'outside']);
  });
});

describe('document block literal boundaries', () => {
  test.each([
    ['<!--', '-->'],
    ['<?x', '?>'],
    ['<![CDATA[', ']]>'],
    ['<!DOCTYPE', '>'],
  ])('bounds %s examples through the physical closing line', (open, close) => {
    for (const eol of ['\n', '\r\n', '\r']) {
      for (const indent of ['', '   ']) {
        const prefix = `${indent}${open}${eol}{{ unfinished${eol}${close} {{ still literal`;
        const source = `${prefix}${eol}?[%{{ real }} A|B]`;
        expect(extractVariableNames(source)).toEqual(['real']);
        const markers = findDocumentVariableMarkers(source);
        expect(markers.map(marker => marker.name)).toEqual([
          null,
          null,
          'real',
        ]);
        expect(markers[1].end).toBe(prefix.length);
        expect(source.slice(markers[2].start, markers[2].end)).toBe(
          '{{ real }}'
        );
        expect(
          extractVariableNames(
            `${indent}${open} {{ example }} ${close} {{ closing }}${eol}{{ real }}`
          )
        ).toEqual(['example', 'closing', 'real']);
      }
      expect(
        extractVariableNames(
          `Text ${open}${close} {{ unfinished${eol}{{ real }}`
        )
      ).toEqual([]);
    }
  });

  test.each(['    ', '\t', ' \t', '  \t', '   \t'])(
    'bounds an incomplete indented example after %j',
    indentation => {
      const prefix = `${indentation}{{ unfinished`;
      for (const ending of ['{{ real }}', '?[%{{ real }} A|B]']) {
        const source = `${prefix}\n\n${ending}`;
        expect(extractVariableNames(source)).toEqual(['real']);
        expect(findDocumentVariableMarkers(source)[0]).toMatchObject({
          start: indentation.length,
          end: prefix.length,
          name: null,
        });
      }
    }
  );

  test('includes interior blank code lines while leaving trailing blanks outside', () => {
    const source = '    {{ example }}\n\n    {{ complete }}\n\n{{ real }}';
    expect(extractVariableNames(source)).toEqual([
      'example',
      'complete',
      'real',
    ]);
    expect(
      extractVariableNames('Paragraph\n    {{ unfinished\n\n{{ real }}')
    ).toEqual([]);
  });

  test.each(['script', 'style', 'pre', 'textarea'])(
    'bounds an incomplete raw %s body at its matching closing token',
    name => {
      const prefix = `  <${name} title="{{ attribute }}">\n{{ unfinished\n</${name.toUpperCase()} >`;
      for (const ending of ['{{ real }}', '?[%{{ real }} A|B]']) {
        const source = `${prefix}\n${ending}`;
        expect(extractVariableNames(source)).toEqual(['attribute', 'real']);
        expect(findDocumentVariableMarkers(source)[1]).toMatchObject({
          end: prefix.length,
          name: null,
        });
      }
      expect(
        extractVariableNames(`<${name}>{{ example }}</${name}>{{ real }}`)
      ).toEqual(['example', 'real']);
      expect(extractVariableNames(`<${name}>{{ unfinished`)).toEqual([]);
    }
  );

  test('keeps raw HTML attribute examples in their existing opening-token scope', () => {
    expect(
      extractVariableNames('<script title="{{">{{ body }}</script>{{ real }}')
    ).toEqual(['body', 'real']);
    expect(
      extractVariableNames('<script/>{{ unfinished\n</script>\n{{ real }}')
    ).toEqual([]);
    expect(extractVariableNames('{{ <script> name }}')).toEqual([
      '<script> name',
    ]);
  });

  test.each(['\u0060\u0060\u0060', '~~~'])(
    'preserves complete names in %s info strings without reclaiming a later fence',
    fence => {
      expect(extractVariableNames(`${fence}{{language}}\nx\n${fence}`)).toEqual(
        ['language']
      );
      for (const ending of ['', '\n']) {
        const source = `${fence}\nexample\n${fence}\n{{ unfinished\n${fence}\nexample\n${fence}\n{{ real }}${ending}`;
        expect(extractVariableNames(source)).toEqual([]);
        expect(findDocumentVariableMarkers(source)).toHaveLength(1);
      }
    }
  );
});

describe('complete inline math and link-resource boundaries', () => {
  test.each([
    '$x {{ unfinished$',
    '$$x {{ unfinished$$',
    '$x {{ example }}$',
    '$$x {{ example }}$$',
    '[label](url "{{")',
    "[label](url '{{')",
    '[label](url ({{))',
    '[label](url(path) "{{")',
    '[label](url<path "{{")',
    '[label](url (({{))',
    '[label]( (url(path)) "{{")',
    '[label](<url(path)> "{{")',
    '[label](url "{{ example }}")',
    '[label {{ name }}](url "{{")',
    '[outer ![inner](u)](u "{{")',
    '![outer [inner](u)](u "{{")',
  ])('bounds a complete literal without hiding a later key: %s', prefix => {
    const names = prefix.includes('{{ example }}')
      ? ['example', 'real']
      : prefix.includes('{{ name }}')
        ? ['name', 'real']
        : ['real'];
    const source = `${prefix}\n\n?[%{{ real }} A|B]`;
    expect(extractVariableNames(source)).toEqual(names);
    const markers = findDocumentVariableMarkers(source);
    expect(markers[markers.length - 1]?.name).toBe('real');
  });

  test.each([
    '$x {{ unfinished',
    '[outer [inner](u)](u "{{")',
    String.raw`\[label](url "{{")`,
    '$x {{ unfinished\n\nend$',
  ])('does not claim an incomplete or inactive literal: %s', prefix => {
    expect(extractVariableNames(`${prefix}\n\n?[%{{ real }} A|B]`)).toEqual([]);
  });

  test('keeps raw-marker priority and native math closing semantics', () => {
    expect(extractVariableNames('{{ $x [label](url) }}')).toEqual([
      '$x [label](url)',
    ]);
    expect(extractVariableNames(String.raw`$x \$ {{ real }}`)).toEqual([
      'real',
    ]);
    expect(
      extractVariableNames(
        'Show `{{\n<script>\n` then ?[%{{ hidden }} A|B]\n</script>\n{{ real }}'
      )
    ).toEqual(['real']);
  });
});

test('bounds resource scanning work when nested destinations never close', () => {
  const originalTest = RegExp.prototype.test;
  for (const ending of ['', ')']) {
    const source = '[x]('.repeat(4096) + ending;
    let visits = 0;
    const spy = jest
      .spyOn(RegExp.prototype, 'test')
      .mockImplementation(function (this: RegExp, value: string): boolean {
        if (this.source === String.raw`[\t\n\r ]`) visits++;
        return originalTest.call(this, value);
      });
    try {
      expect(extractVariableNames(source)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
    // Native destination nesting is capped at 32; repeated failed candidates
    // may revisit only that bounded prefix, not the whole remaining document.
    expect(visits).toBeLessThan(source.length * 128);
  }
});

test.each([2, 3, 4])(
  'retains an escaped-first-dollar suffix of width %s',
  width => {
    const source = `Show \\${'$'.repeat(width)}x {{ unfinished${'$'.repeat(width - 1)} then {{ real }}`;
    expect(extractVariableNames(source)).toEqual(['real']);
  }
);

test('an unfinished link resource leaves a raw marker in its original scope', () => {
  expect(extractVariableNames('[label](url "{{\n\n?[%{{ real }} A|B]')).toEqual(
    ['?[%{{ real']
  );
});

test.each(['`', '$'])(
  'does not pair %s across ATX heading boundaries',
  delimiter => {
    for (const source of [
      `# Heading ${delimiter}{{\nq${delimiter} then ?[%{{ real }} A|B]`,
      `Show ${delimiter}{{\n# Heading q${delimiter} then ?[%{{ real }} A|B]`,
    ]) {
      const name = source
        .slice(source.indexOf('{{') + 2, source.indexOf('}}'))
        .trim();
      expect(extractVariableNames(source)).toEqual([name]);
      expect(findDocumentVariableMarkers(source)[0]?.name).toBe(name);
    }
    expect(
      extractVariableNames(
        `# Heading ${delimiter}{{${delimiter} then ?[%{{ real }} A|B]`
      )
    ).toEqual(['real']);
  }
);

test.each(['script', 'style', 'pre', 'textarea'])(
  'keeps %s closing-line content in its raw block',
  tag => {
    const prefix = `<${tag}>\ncode\n</${tag}> {{ unfinished`;
    expect(extractVariableNames(`${prefix}\n?[%{{ real }} A|B]`)).toEqual([
      'real',
    ]);
    expect(
      extractVariableNames(
        `<${tag}>\ncode\n</${tag}> {{ example }}\n{{ real }}`
      )
    ).toEqual(['example', 'real']);
  }
);

test('does not invent a title-only resource without a destination', () => {
  expect(
    extractVariableNames('[label]( "{{ words")\n\n?[%{{ real }} A|B]')
  ).toEqual([]);
});

test.each([32, 33])(
  'uses the native destination nesting limit at depth %s',
  depth => {
    const destination = '('.repeat(depth) + 'x' + ')'.repeat(depth);
    const source = `[label](${destination} "{{")\n\n?[%{{ real }} A|B]`;
    expect(extractVariableNames(source)).toEqual(depth === 32 ? ['real'] : []);
  }
);

test.each(['$', '`', '[label](u "'])(
  'keeps interaction marker bodies raw before %s literal rules',
  literal => {
    const source = `?[%{{ q }} A ${literal}{{ y${literal} | B]\n\n?[%{{ real }} C|D]`;
    expect(extractVariableNames(source)).toEqual(['q']);
    const markers = findDocumentVariableMarkers(source);
    expect(markers.map(marker => marker.name)).toEqual(['q', null]);
  }
);

test.each(['[', '!['])(
  'keeps later variables visible after many %s label ancestors and complete links',
  opening => {
    const source = `${opening.repeat(4096)}${'[x](u)'.repeat(4096)} {{ real }}`;
    expect(extractVariableNames(source)).toEqual(['real']);
  }
);

test('returns no marker ranges for a large literal document without openings', () => {
  const source = '`a'.repeat(500_000);
  expect(findDocumentVariableMarkers(source)).toEqual([]);
});

describe('document container, ordinary HTML and line-ending boundaries', () => {
  test.each(['\n', '\r\n', '\r'])(
    'does not pair code or math across a Setext underline with %j',
    eol => {
      for (const delimiter of ['`', '$']) {
        for (const underline of ['=', '===', '-', '--']) {
          const source = `Text ${delimiter}{{ unfinished${eol}${underline}${eol}${delimiter} end${eol}${eol}?[%{{ real }} A|B]`;
          expect(extractVariableNames(source)).toEqual([]);
        }
        const continued = `Text ${delimiter}{{ unfinished${eol}== ordinary text${eol}${delimiter} end${eol}${eol}?[%{{ real }} A|B]`;
        expect(extractVariableNames(continued)).toEqual(['real']);
      }
    }
  );

  test.each(['\n', '\r\n', '\r'])(
    'bounds reference resources and completed blocks with %j',
    eol => {
      const question = '?[%{{ real }} A|B]';
      for (const prefix of [
        ['[foo]: /url "{{ unfinished"', ''],
        ['[foo]: <{{unfinished>', ''],
        ['[foo]: {{unfinished', ''],
        ['[foo]: /url', '  "{{ unfinished"', ''],
        ['# Title', '    {{ unfinished', ''],
        ['~~~', 'code', '~~~', '    {{ unfinished', ''],
        ['---', '    {{ unfinished', ''],
        ['?[ unfinished', '', '`{{`', ''],
      ]) {
        const source = [...prefix, question].join(eol);
        expect(extractVariableNames(source)).toEqual(['real']);
      }
      expect(
        extractVariableNames(
          `[foo]: /url "{{ example }}"${eol}${eol}${question}`
        )
      ).toEqual(['example', 'real']);
      expect(
        extractVariableNames(
          `paragraph${eol}[foo]: /url "{{ unfinished"${eol}${eol}${question}`
        )
      ).toEqual([]);
      expect(
        extractVariableNames(
          `paragraph${eol}    {{ unfinished${eol}${eol}${question}`
        )
      ).toEqual([]);
      expect(
        extractVariableNames(`?[ {{ unfinished${eol}${eol}${question}`)
      ).toEqual([]);
    }
  );

  test.each(['\n', '\r\n', '\r'])(
    'keeps literal examples local with %j line endings',
    eol => {
      for (const prefix of [
        ['- ~~~', '  {{ unfinished', '  ~~~'],
        ['> ~~~', '> {{ unfinished', '> ~~~'],
        ['> - ~~~', '>   {{ unfinished', '>   ~~~'],
        ['- > ~~~', '  > {{ unfinished', '  > ~~~'],
        ['1. ```', '   {{ unfinished', '   ```'],
        ['~~~', '{{ unfinished', '~~~'],
        ['<div>', '{{ unfinished', '</div>', ''],
        ['<custom-tag>', '{{ unfinished', '</custom-tag>', ''],
      ]) {
        const source = prefix.join(eol) + eol + '?[%{{ real }} A|B]';
        expect(extractVariableNames(source)).toEqual(['real']);
        const markers = findDocumentVariableMarkers(source);
        expect(markers.map(marker => marker.name)).toEqual([null, 'real']);
        for (const marker of markers) {
          expect(source.slice(marker.start, marker.start + 2)).toBe('{{');
          expect(
            source.slice(
              marker.start + 2,
              marker.name === null ? marker.end : marker.end - 2
            )
          ).toBe(marker.rawName);
        }
      }
    }
  );

  test.each(['\n', '\r\n', '\r'])(
    'preserves complete literal names and raw offsets with %j',
    eol => {
      const source = [
        '🙂',
        '- ~~~{{ language }}',
        '  {{ example }}',
        '  ~~~',
        '?[%{{ real }} A|B]',
      ].join(eol);
      expect(extractVariableNames(source)).toEqual([
        'language',
        'example',
        'real',
      ]);
      const markers = findDocumentVariableMarkers(source);
      expect(
        markers.map(marker => source.slice(marker.start + 2, marker.end - 2))
      ).toEqual(markers.map(marker => marker.rawName));
    }
  );

  test('preserves marker-first ownership and complete HTML tokens across blank lines', () => {
    expect(
      extractVariableNames('{{ - ~~~\n{{ example }}\n~~~\n{{ real }}')
    ).toEqual(['real']);
    expect(
      extractVariableNames(
        '<div title="{{ attr }}\n\nstill">\n{{ unfinished\n</div>\n\n{{ real }}'
      )
    ).toEqual(['attr', 'real']);
    expect(
      extractVariableNames(
        'paragraph\n<custom-tag>\n{{ unfinished\n</custom-tag>\n\n{{ real }}'
      )
    ).toEqual([]);
  });
});

test.each(['ticks', 'lines'])(
  'bounds retained indexing state for large %s documents containing a marker',
  kind => {
    const source = (kind === 'ticks' ? '`a' : '\n').repeat(50_000) + '{{ x }}';
    const originalSet = Map.prototype.set;
    let peakEntries = 0;
    const spy = jest.spyOn(Map.prototype, 'set').mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
      value: unknown
    ) {
      const result = originalSet.call(this, key, value);
      peakEntries = Math.max(peakEntries, this.size);
      return result;
    });
    let names;
    try {
      names = extractVariableNames(source);
    } finally {
      spy.mockRestore();
    }
    expect(names).toEqual(['x']);
    // Retained object maps scale with distinct delimiter widths, never the number
    // of ordinary lines or runs. Numeric positions use compact typed storage.
    expect(peakEntries).toBeLessThanOrEqual(4);
  }
);

test.each(['`', '$'])(
  'does not pair %s through confirmed native block interruptions',
  delimiter => {
    for (const boundary of ['> ', '- ', '1. ', '---\n', '<div>\n']) {
      const source = `Text ${delimiter}{{ unfinished\n${boundary}${delimiter} end\n\n?[%{{ real }} A|B]`;
      expect(extractVariableNames(source)).toEqual([]);
    }
    for (const prefix of ['> ', '- ', '1. ']) {
      const source = `${prefix}${delimiter}{{${delimiter} end ?[%{{ real }} A|B]`;
      expect(extractVariableNames(source)).toEqual(['real']);
    }
    for (const [first, continuation] of [
      ['> ', '> '],
      ['- ', '  '],
      ['1. ', '   '],
      ['> ', ''],
    ]) {
      const source = `${first}${delimiter}{{\n${continuation}word${delimiter} end ?[%{{ real }} A|B]`;
      expect(extractVariableNames(source)).toEqual(['real']);
    }
  }
);

describe('container document contexts', () => {
  const outside = '?[%{{ real }} A|B]';
  const containers = [
    ['> ', '> '],
    ['- ', '  '],
    ['> - ', '>   '],
    ['2. ', '   '],
  ];
  test.each(['\n', '\r\n', '\r'])(
    'bounds nested literal examples with %j physical lines',
    eol => {
      for (const [first, rest] of containers) {
        for (const delimiter of ['`', '$']) {
          const source = `${first}Text ${delimiter}{{ unfinished${eol}${rest}# Heading ${delimiter} end${eol}${eol}${outside}`;
          expect(extractVariableNames(source)).toEqual([]);
          const continued = `${first}Text ${delimiter}{{ unfinished${eol}${rest}continued ${delimiter} end${eol}${eol}${outside}`;
          expect(extractVariableNames(continued)).toEqual(['real']);
        }
        for (const [opening, closing] of [
          ['<div>', '</div>'],
          ['<script>', '</script>'],
          ['<!--', '-->'],
          ['<?x', '?>'],
          ['<![CDATA[', ']]>'],
          ['<!DOCTYPE', '>'],
        ]) {
          const source = `${first}${opening}${eol}${rest}{{ unfinished${eol}${rest}${closing}${eol}${eol}${outside}`;
          expect(extractVariableNames(source)).toEqual(['real']);
          const markers = findDocumentVariableMarkers(source);
          const marker = markers[markers.length - 1];
          expect(marker?.name).toBe('real');
          expect(source.slice(marker?.start, marker?.end)).toBe('{{ real }}');
        }
        for (const resource of [
          `[foo]: /url "{{ unfinished"`,
          `[foo]: /url${eol}${rest}  "{{ unfinished"`,
          `[foo]:${eol}${rest}/url "{{ unfinished"`,
        ]) {
          const source = `${first}${resource}${eol}${eol}${outside}`;
          expect(extractVariableNames(source)).toEqual(['real']);
        }
      }
      for (const source of [
        `> [foo]: /url${eol}"{{ unfinished"${eol}${eol}${outside}`,
        `> [foo]:${eol}/url "{{ unfinished"${eol}${eol}${outside}`,
      ])
        expect(extractVariableNames(source)).toEqual(['real']);
      expect(
        extractVariableNames(
          `> Intro${eol}> [foo]: /url "{{ unfinished"${eol}${eol}${outside}`
        )
      ).toEqual([]);
      expect(
        extractVariableNames(
          `Text \u0060{{ unfinished${eol}2. # heading${eol}\u0060 end${eol}${eol}${outside}`
        )
      ).toEqual(['real']);
    }
  );

  test.each([
    '<script>\n</script>',
    '<!--\n-->',
    '<?x\n?>',
    '<![CDATA[\n]]>',
    '<!DOCTYPE\n>',
  ])('starts indented code after a completed %s block', prefix => {
    expect(
      extractVariableNames(`${prefix}\n    {{ unfinished\n\n${outside}`)
    ).toEqual(['real']);
  });

  test.each([
    '?[ unfinished\n~~~\n{{ x\n~~~',
    '?[ unfinished\n# Heading',
    '?[ unfinished\n---\n~~~\n{{ x\n~~~',
  ])('bounds only the document interaction candidate at %s', prefix => {
    expect(extractVariableNames(`${prefix}\n${outside}`)).toEqual(['real']);
  });
});

describe('projected container code blocks', () => {
  test.each(['\n', '\r\n', '\r'])('keeps code boundaries in %j source', eol => {
    const outside = '?[%{{ real }} A|B]';
    for (const prefix of [
      '>     {{ unfinished',
      '> >     {{ unfinished',
      '>\t  {{ unfinished',
      '> \t  {{ unfinished',
      '-     {{ unfinished',
      '- Intro\n\n      {{ unfinished',
      '2. Intro\n\n       {{ unfinished',
      '>     {{ unfinished\n>\n>     still code',
      '- Intro\n\n    ```\n  {{ unfinished\n    ```',
      '2. Intro\n\n    ~~~\n   {{ unfinished\n    ~~~',
      '> \t~~~\n> {{ unfinished\n> \t~~~',
      '> \t```\n> {{ unfinished\n> \t```',
      '- Intro\n\n\t~~~\n  {{ unfinished\n\t~~~',
    ]) {
      const source = `${prefix}\n\n${outside}`.replace(/\n/g, eol);
      expect(extractVariableNames(source)).toEqual(['real']);
      const markers = findDocumentVariableMarkers(source);
      const real = markers[markers.length - 1];
      expect(source.slice(real.start, real.end)).toBe('{{ real }}');
      expect(markers[0].name).toBeNull();
      expect(markers[0].end).toBeLessThan(real.start);
    }
    for (const prefix of [
      '> \t{{ unfinished',
      '> Intro\n>     {{ unfinished',
      'Paragraph\n    {{ unfinished',
      '>     ```\n> {{ unfinished\n>     ```',
    ]) {
      const source = `${prefix}\n\n${outside}`.replace(/\n/g, eol);
      expect(extractVariableNames(source)).toEqual([]);
    }
    for (const source of [
      '>     {{ unfinished\n> ?[%{{ real }} A|B]',
      '-     {{ unfinished\n?[%{{ real }} A|B]',
      '>     {{ complete }}\n>\n>     {{ unfinished\n\n?[%{{ real }} A|B]',
    ]) {
      const original = source.replace(/\n/g, eol);
      expect(extractVariableNames(original)).toEqual(
        source.includes('{{ complete }}') ? ['complete', 'real'] : ['real']
      );
    }
  });
});

const containerTabCases: {
  id: string;
  source: string;
  names: string[];
}[] = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'tests/fixtures/container-tab-cases.json'),
    'utf8'
  )
);
test.each(containerTabCases)(
  'matches native four-column container indentation: $id',
  ({ source, names }) => {
    for (const eol of ['\n', '\r\n', '\r']) {
      const original = source.replace(/\n/g, eol);
      expect(extractVariableNames(original)).toEqual(names);
      const markers = findDocumentVariableMarkers(original);
      for (const marker of markers) {
        expect(original.slice(marker.start, marker.start + 2)).toBe('{{');
      }
    }
  }
);

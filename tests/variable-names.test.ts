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

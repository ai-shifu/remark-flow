import {
  createVariableExpressionRegex,
  extractVariableNames,
  InteractionParser,
  isValidVariableName,
  normalizeVariableName,
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
];

describe('the shared variable-name grammar', () => {
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
    'a b',
    'a\tb',
    'a\nb',
    'a\rb',
    'a\u00a0b',
    'a{b',
    'a}b',
  ])('rejects a blank name, internal whitespace or a brace: %s', name => {
    expect(normalizeVariableName(name)).toBeNull();
    expect(isValidVariableName(name)).toBe(false);
    expect(extractVariableNames(`{{${name}}}`)).toEqual([]);
  });

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
    ]);
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
    expect(isValidVariableName(`a${whitespace}b`)).toBe(false);
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

  test.each(['has space', 'a\tb', 'a{b', 'a}b'])(
    'does not assign to an invalid name %s',
    name => {
      expect(
        parser.parseToRemarkFormat(`?[%{{${name}}} 男 | 女]`).variableName
      ).toBeUndefined();
    }
  );

  test('does not change the existing closing bracket boundary', () => {
    const source = '?[%{{a]b}} 男 | 女]';
    expect(parser.parseToRemarkFormat(source)).toEqual({ placeholder: source });
  });
});

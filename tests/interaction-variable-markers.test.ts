import {
  COMPILED_REGEXES,
  InteractionParser,
  InteractionType,
} from '../src/interaction-parser';
import {
  extractVariableNames,
  findDocumentVariableMarkers,
  VARIABLE_ASSIGNMENT_SOURCE,
} from '../src/variable-name';

describe.each(['%', ''])('interaction assignment prefix %j', prefix => {
  const parser = new InteractionParser();

  test.each([
    ['', { placeholder: '', isMultiSelect: false }],
    ['...Explain', { placeholder: 'Explain', isMultiSelect: false }],
    [
      'Ready//ready',
      {
        buttonTexts: ['Ready'],
        buttonValues: ['ready'],
        isMultiSelect: false,
      },
    ],
    [
      'First//one | Second//two',
      {
        buttonTexts: ['First', 'Second'],
        buttonValues: ['one', 'two'],
        isMultiSelect: false,
      },
    ],
    [
      'First//one || Second//two',
      {
        buttonTexts: ['First', 'Second'],
        buttonValues: ['one', 'two'],
        isMultiSelect: true,
      },
    ],
    [
      'First//one | Second//two | ...Explain',
      {
        buttonTexts: ['First', 'Second'],
        buttonValues: ['one', 'two'],
        placeholder: 'Explain',
        isMultiSelect: false,
      },
    ],
    [
      'First//one || Second//two || ...Explain',
      {
        buttonTexts: ['First', 'Second'],
        buttonValues: ['one', 'two'],
        placeholder: 'Explain',
        isMultiSelect: true,
      },
    ],
  ])('assigns the answer for content %j', (body, expected) => {
    expect(
      parser.parseToRemarkFormat(`?[${prefix}{{ answer }} ${body}]`)
    ).toEqual({ variableName: 'answer', ...expected });
  });

  test('keeps opaque keys, Python padding, and regex captures consistent', () => {
    const name = '\ufeffWhich [path] | level//hint... }?';
    const inner = `\u0085 ${prefix}{{ ${name} }} A | B`;
    expect(parser.parseToRemarkFormat(`?[${inner}]`)).toEqual({
      variableName: name,
      buttonTexts: ['A', 'B'],
      buttonValues: ['A', 'B'],
      isMultiSelect: false,
    });
    expect(COMPILED_REGEXES.LAYER2_VARIABLE.exec(inner)?.slice(1)).toEqual([
      name,
      ' A | B',
    ]);
  });

  test.each(['', ' ', 'bad\nkey', 'bad\u0000key', 'bad\u2028key'])(
    'rejects an invalid leading name %j',
    name => {
      const source = `?[${prefix}{{${name}}} A | B]`;
      expect(parser.parse(source).error).toBe('Invalid variable name');
      expect(parser.parseToRemarkFormat(source)).toEqual({
        placeholder: source,
      });
    }
  );

  test('does not turn a marker after option text into an assignment', () => {
    const button = `Show ${prefix}{{answer}}`;
    expect(parser.parse(`?[${button}]`).type).toBe(
      InteractionType.NON_ASSIGNMENT_BUTTON
    );
    expect(parser.parseToRemarkFormat(`?[${button}]`)).toEqual({
      buttonTexts: [button],
      buttonValues: [button],
      isMultiSelect: false,
    });
  });
});

test('interaction compatibility leaves document references and assignment format unchanged', () => {
  const source = '{{answer}} %{{answer}} ?[{{answer}} A | B]';
  expect(
    findDocumentVariableMarkers(source).map(marker => marker.name)
  ).toEqual(['answer', 'answer', 'answer']);
  expect(extractVariableNames(source)).toEqual(['answer']);
  const assignment = new RegExp(`^${VARIABLE_ASSIGNMENT_SOURCE}$`);
  expect(assignment.test('%{{answer}}')).toBe(true);
  expect(assignment.test('{{answer}}')).toBe(false);
});

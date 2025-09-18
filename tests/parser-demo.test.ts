import { InteractionParser, InteractionType } from '../src/interaction-parser';

describe('InteractionParser Sample and Test', () => {
  let parser: InteractionParser;

  beforeEach(() => {
    parser = new InteractionParser();
  });

  describe('parseToRemarkFormat Method Test', () => {
    test('Test Variable Syntax Parsing', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{name}}...Enter your name]'
      );

      expect(result).toEqual({
        variableName: 'name',
        placeholder: 'Enter your name',
        isMultiSelect: false,
      });
    });

    test('Test Button Syntax Parsing', () => {
      const result = parser.parseToRemarkFormat(
        '?[Save//save | Cancel//cancel]'
      );

      expect(result).toEqual({
        buttonTexts: ['Save', 'Cancel'],
        buttonValues: ['save', 'cancel'],
      });
    });

    test('Test Composite Syntax Parsing', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{color}} Red//red | Blue//blue | ...Custom color]'
      );

      expect(result).toEqual({
        variableName: 'color',
        buttonTexts: ['Red', 'Blue'],
        buttonValues: ['red', 'blue'],
        placeholder: 'Custom color',
        isMultiSelect: false,
      });
    });
  });

  describe('parse Method Detailed Test', () => {
    test('Test Result Contains Type Information', () => {
      const result = parser.parse('?[%{{action}} Confirm | Cancel]');

      expect(result.type).toBe(InteractionType.BUTTONS_ONLY);
      expect('variable' in result).toBe(true);
      if ('variable' in result) {
        expect(result.variable).toBe('action');
      }
    });

    test('Test Non-Variable Button Parsing', () => {
      const result = parser.parse('?[Start | Pause | Stop]');

      expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
      if (result.type === InteractionType.NON_ASSIGNMENT_BUTTON) {
        expect(result.buttons).toHaveLength(3);
        expect(result.buttons.map(b => b.display)).toEqual([
          'Start',
          'Pause',
          'Stop',
        ]);
      }
    });

    test('Test Error Handling', () => {
      const result = parser.parse('Invalid syntax');

      expect(result.error).toBeDefined();
      expect(result.type).toBe(null);
    });
  });

  describe('Multi-Select Syntax Tests', () => {
    test('Test Multi-Select Button Parsing', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{options}} Option A||Option B||Option C]'
      );

      expect(result).toEqual({
        variableName: 'options',
        buttonTexts: ['Option A', 'Option B', 'Option C'],
        buttonValues: ['Option A', 'Option B', 'Option C'],
        isMultiSelect: true,
      });
    });

    test('Test Multi-Select with Custom Values', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{theme}} Light Theme//light||Dark Theme//dark||Auto//auto]'
      );

      expect(result).toEqual({
        variableName: 'theme',
        buttonTexts: ['Light Theme', 'Dark Theme', 'Auto'],
        buttonValues: ['light', 'dark', 'auto'],
        isMultiSelect: true,
      });
    });

    test('Test Multi-Select with Text Input', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{colors}} Red||Blue||Green||...Custom color]'
      );

      expect(result).toEqual({
        variableName: 'colors',
        buttonTexts: ['Red', 'Blue', 'Green'],
        buttonValues: ['Red', 'Blue', 'Green'],
        placeholder: 'Custom color',
        isMultiSelect: true,
      });
    });

    test('Test Multi-Select Type Detection', () => {
      const result1 = parser.parse('?[%{{options}} A||B||C]');
      expect(result1.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('isMultiSelect' in result1) {
        expect(result1.isMultiSelect).toBe(true);
      }

      const result2 = parser.parse('?[%{{options}} A||B||...custom]');
      expect(result2.type).toBe(InteractionType.BUTTONS_MULTI_WITH_TEXT);
      if ('isMultiSelect' in result2) {
        expect(result2.isMultiSelect).toBe(true);
      }
    });

    test('Test Single vs Multi-Select Distinction', () => {
      const singleSelect = parser.parseToRemarkFormat(
        '?[%{{theme}} Light | Dark]'
      );
      const multiSelect = parser.parseToRemarkFormat(
        '?[%{{theme}} Light||Dark]'
      );

      expect(singleSelect.isMultiSelect).toBe(false);
      expect(multiSelect.isMultiSelect).toBe(true);
    });
  });

  describe('Actual Usage Scenario Demo', () => {
    test('Simulate User Input Scenario', () => {
      const testCases = [
        {
          input: '?[%{{username}}...Enter your username]',
          expected: 'TEXT_ONLY',
          description: 'Pure Text Input',
        },
        {
          input: '?[%{{theme}} Light | Dark]',
          expected: 'BUTTONS_ONLY',
          description: 'Pure Button Selection',
        },
        {
          input:
            '?[%{{size}} Small//S | Medium//M | Large//L | ...Other sizes]',
          expected: 'BUTTONS_WITH_TEXT',
          description: 'Button + Text Input',
        },
        {
          input: '?[%{{options}} A||B||C]',
          expected: 'BUTTONS_MULTI_SELECT',
          description: 'Multi-Select Buttons',
        },
        {
          input: '?[%{{colors}} Red||Blue||...Custom]',
          expected: 'BUTTONS_MULTI_WITH_TEXT',
          description: 'Multi-Select + Text Input',
        },
        {
          input: '?[Confirm | Cancel]',
          expected: 'NON_ASSIGNMENT_BUTTON',
          description: 'Non-Assignment Button',
        },
      ];

      testCases.forEach(testCase => {
        const result = parser.parse(testCase.input);
        expect(result.type).toBe(
          InteractionType[testCase.expected as keyof typeof InteractionType]
        );
        console.log(
          `✅ ${testCase.description}: ${testCase.input} -> ${result.type}`
        );
      });
    });
  });
});

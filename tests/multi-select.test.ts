import { InteractionParser, InteractionType } from '../src/interaction-parser';

describe('Multi-Select Functionality Tests', () => {
  let parser: InteractionParser;

  beforeEach(() => {
    parser = new InteractionParser();
  });

  describe('Basic Multi-Select Syntax', () => {
    test('should parse basic multi-select buttons', () => {
      const result = parser.parse(
        '?[%{{options}} Option A||Option B||Option C]'
      );

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('variable' in result) {
        expect(result.variable).toBe('options');
        expect(result.buttons).toHaveLength(3);
        expect(result.buttons!.map(b => b.display)).toEqual([
          'Option A',
          'Option B',
          'Option C',
        ]);
        expect(result.buttons!.map(b => b.value)).toEqual([
          'Option A',
          'Option B',
          'Option C',
        ]);
        expect(result.isMultiSelect).toBe(true);
      }
    });

    test('should parse multi-select with custom values', () => {
      const result = parser.parse(
        '?[%{{lang}} JavaScript//js||TypeScript//ts||Python//py]'
      );

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('variable' in result) {
        expect(result.variable).toBe('lang');
        expect(result.buttons).toHaveLength(3);
        expect(result.buttons!.map(b => b.display)).toEqual([
          'JavaScript',
          'TypeScript',
          'Python',
        ]);
        expect(result.buttons!.map(b => b.value)).toEqual(['js', 'ts', 'py']);
        expect(result.isMultiSelect).toBe(true);
      }
    });

    test('should parse multi-select with text input', () => {
      const result = parser.parse(
        '?[%{{skills}} React||Vue||Angular||...Other framework]'
      );

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_WITH_TEXT);
      if ('variable' in result) {
        expect(result.variable).toBe('skills');
        expect(result.buttons).toHaveLength(3);
        expect(result.buttons!.map(b => b.display)).toEqual([
          'React',
          'Vue',
          'Angular',
        ]);
        expect(result.question).toBe('Other framework');
        expect(result.isMultiSelect).toBe(true);
      }
    });

    test('should distinguish single vs multi-select', () => {
      const singleResult = parser.parse('?[%{{theme}} Light | Dark]');
      const multiResult = parser.parse('?[%{{theme}} Light||Dark]');

      expect(singleResult.type).toBe(InteractionType.BUTTONS_ONLY);
      if ('isMultiSelect' in singleResult) {
        expect(singleResult.isMultiSelect).toBe(false);
      }

      expect(multiResult.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('isMultiSelect' in multiResult) {
        expect(multiResult.isMultiSelect).toBe(true);
      }
    });
  });

  describe('Separator Detection and Fault Tolerance', () => {
    test('should detect double pipe as multi-select', () => {
      const result = parser.parse('?[%{{colors}} Red||Blue||Green]');

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('isMultiSelect' in result) {
        expect(result.isMultiSelect).toBe(true);
      }
    });

    test('should detect single pipe as single-select', () => {
      const result = parser.parse('?[%{{colors}} Red | Blue | Green]');

      expect(result.type).toBe(InteractionType.BUTTONS_ONLY);
      if ('isMultiSelect' in result) {
        expect(result.isMultiSelect).toBe(false);
      }
    });

    test('should handle mixed separators - first separator type wins', () => {
      // Double pipe appears first - multi-select mode, single pipe is part of value
      const doubleFirstResult = parser.parse('?[%{{opt}} A||B | C]');
      expect(doubleFirstResult.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if (
        'isMultiSelect' in doubleFirstResult &&
        'buttons' in doubleFirstResult
      ) {
        expect(doubleFirstResult.isMultiSelect).toBe(true);
        expect(doubleFirstResult.buttons!.map(b => b.display)).toEqual([
          'A',
          'B | C',
        ]);
      }

      // Single pipe appears first - single-select mode, double pipe is part of value
      const singleFirstResult = parser.parse('?[%{{opt}} A | B||C]');
      expect(singleFirstResult.type).toBe(InteractionType.BUTTONS_ONLY);
      if (
        'isMultiSelect' in singleFirstResult &&
        'buttons' in singleFirstResult
      ) {
        expect(singleFirstResult.isMultiSelect).toBe(false);
        expect(singleFirstResult.buttons!.map(b => b.display)).toEqual([
          'A',
          'B||C',
        ]);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty multi-select content', () => {
      const result = parser.parse('?[%{{empty}} ||]');

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('variable' in result) {
        expect(result.variable).toBe('empty');
        expect(result.isMultiSelect).toBe(true);
        // Should handle empty buttons gracefully
      }
    });

    test('should handle single option as non-multi-select', () => {
      const result = parser.parse('?[%{{single}} OnlyOption]');

      expect(result.type).toBe(InteractionType.BUTTONS_ONLY);
      if ('variable' in result) {
        expect(result.variable).toBe('single');
        expect(result.buttons).toHaveLength(1);
        expect(result.isMultiSelect).toBe(false);
      }
    });

    test('should handle whitespace around separators', () => {
      const result = parser.parse(
        '?[%{{opts}} Option A || Option B || Option C]'
      );

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('variable' in result) {
        expect(result.buttons!.map(b => b.display)).toEqual([
          'Option A',
          'Option B',
          'Option C',
        ]);
        expect(result.isMultiSelect).toBe(true);
      }
    });

    test('should handle complex mixed format', () => {
      const result = parser.parse(
        '?[%{{complex}} Option A//a||Option B||Option C//c||...Custom option]'
      );

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_WITH_TEXT);
      if ('variable' in result) {
        expect(result.variable).toBe('complex');
        expect(result.buttons!.map(b => b.display)).toEqual([
          'Option A',
          'Option B',
          'Option C',
        ]);
        expect(result.buttons!.map(b => b.value)).toEqual([
          'a',
          'Option B',
          'c',
        ]);
        expect(result.question).toBe('Custom option');
        expect(result.isMultiSelect).toBe(true);
      }
    });
  });

  describe('Unicode and Internationalization', () => {
    test('should handle Chinese multi-select', () => {
      const result = parser.parse(
        '?[%{{技能}} 前端开发||后端开发||全栈开发||...其他技能]'
      );

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_WITH_TEXT);
      if ('variable' in result) {
        expect(result.variable).toBe('技能');
        expect(result.buttons!.map(b => b.display)).toEqual([
          '前端开发',
          '后端开发',
          '全栈开发',
        ]);
        expect(result.question).toBe('其他技能');
        expect(result.isMultiSelect).toBe(true);
      }
    });

    test('should handle emoji in multi-select', () => {
      const result = parser.parse('?[%{{mood}} 😊 Happy||😢 Sad||😡 Angry]');

      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('variable' in result) {
        expect(result.buttons!.map(b => b.display)).toEqual([
          '😊 Happy',
          '😢 Sad',
          '😡 Angry',
        ]);
        expect(result.isMultiSelect).toBe(true);
      }
    });
  });

  describe('parseToRemarkFormat Multi-Select', () => {
    test('should format multi-select for remark output', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{tags}} React||Vue||Angular||...Other]'
      );

      expect(result).toEqual({
        variableName: 'tags',
        buttonTexts: ['React', 'Vue', 'Angular'],
        buttonValues: ['React', 'Vue', 'Angular'],
        placeholder: 'Other',
        isMultiSelect: true,
      });
    });

    test('should format multi-select with custom values for remark', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{lang}} JavaScript//js||TypeScript//ts]'
      );

      expect(result).toEqual({
        variableName: 'lang',
        buttonTexts: ['JavaScript', 'TypeScript'],
        buttonValues: ['js', 'ts'],
        isMultiSelect: true,
      });
    });

    test('should format pure multi-select buttons for remark', () => {
      const result = parser.parseToRemarkFormat(
        '?[%{{colors}} Red||Blue||Green]'
      );

      expect(result).toEqual({
        variableName: 'colors',
        buttonTexts: ['Red', 'Blue', 'Green'],
        buttonValues: ['Red', 'Blue', 'Green'],
        isMultiSelect: true,
      });
    });
  });

  describe('Error Handling', () => {
    test('should gracefully handle malformed multi-select syntax', () => {
      const result = parser.parse('?[%{{invalid}} A||B||');

      // Should not throw error, should provide some reasonable fallback
      expect(result.error).toBeDefined();
      expect(result.type).toBe(null);
    });

    test('should handle empty variable name with multi-select', () => {
      const result = parser.parse('?[%{{}} Option A||Option B]');

      // Should handle gracefully - treat as non-variable buttons
      expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
      if (result.type === InteractionType.NON_ASSIGNMENT_BUTTON) {
        expect(result.buttons).toHaveLength(2);
      }
    });
  });

  describe('Performance and Large Data', () => {
    test('should handle many multi-select options efficiently', () => {
      const manyOptions = Array.from(
        { length: 50 },
        (_, i) => `Option${i}`
      ).join('||');
      const input = `?[%{{many}} ${manyOptions}]`;

      const startTime = Date.now();
      const result = parser.parse(input);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10); // Should complete in under 10ms
      expect(result.type).toBe(InteractionType.BUTTONS_MULTI_SELECT);
      if ('variable' in result) {
        expect(result.buttons).toHaveLength(50);
        expect(result.isMultiSelect).toBe(true);
      }
    });
  });
});

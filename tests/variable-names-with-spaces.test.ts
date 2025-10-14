import { InteractionParser } from '../src/interaction-parser';

describe('Variable names strict validation (NO spaces allowed)', () => {
  let parser: InteractionParser;

  beforeEach(() => {
    parser = new InteractionParser();
  });

  test('should NOT parse variable names containing spaces - treat as non-assignment button', () => {
    const result = parser.parse('?[%{{User Name}}...Enter your name]');

    // Should be treated as non-assignment button since %{{User Name}} is invalid
    expect(result.type).toBe('non_assignment_button');
    expect((result as any).buttons).toEqual([
      {
        display: '%{{User Name}}...Enter your name',
        value: '%{{User Name}}...Enter your name',
      },
    ]);
  });

  test('should NOT parse variable names with spaces between braces', () => {
    const result = parser.parse('?[%{{ username }}...Enter name]');

    // Should be treated as non-assignment button
    expect(result.type).toBe('non_assignment_button');
    expect((result as any).buttons).toEqual([
      {
        display: '%{{ username }}...Enter name',
        value: '%{{ username }}...Enter name',
      },
    ]);
  });

  test('should support valid variable names without spaces', () => {
    const result = parser.parse('?[%{{username}}...Enter your name]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('username');
    expect((result as any).question).toBe('Enter your name');
  });

  test('should support underscores in variable names', () => {
    const result = parser.parse('?[%{{user_name}}...Enter your name]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('user_name');
    expect((result as any).question).toBe('Enter your name');
  });

  test('should support numbers in variable names', () => {
    const result = parser.parse('?[%{{user123}}...Enter name]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('user123');
    expect((result as any).question).toBe('Enter name');
  });

  test('should support numbers at start of variable names', () => {
    const result = parser.parse('?[%{{123user}}...Enter name]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('123user');
    expect((result as any).question).toBe('Enter name');
  });

  test('should support Chinese variable names (no spaces)', () => {
    const result = parser.parse('?[%{{用户名}}...请输入姓名]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('用户名');
    expect((result as any).question).toBe('请输入姓名');
  });

  test('should support Japanese variable names', () => {
    const result = parser.parse('?[%{{ユーザー名}}...名前を入力]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('ユーザー名');
    expect((result as any).question).toBe('名前を入力');
  });

  test('should NOT support Chinese variable names with spaces', () => {
    const result = parser.parse('?[%{{用户 偏好}}...请选择偏好]');

    // Should be treated as non-assignment button
    expect(result.type).toBe('non_assignment_button');
    expect((result as any).buttons).toEqual([
      {
        display: '%{{用户 偏好}}...请选择偏好',
        value: '%{{用户 偏好}}...请选择偏好',
      },
    ]);
  });

  test('should support mixed Unicode variable names (no spaces)', () => {
    const result = parser.parse('?[%{{user用户123}}...Enter info]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('user用户123');
    expect((result as any).question).toBe('Enter info');
  });

  test('should NOT support special characters in variable names', () => {
    const result = parser.parse('?[%{{user-name}}...Enter name]');

    // Should be treated as non-assignment button
    expect(result.type).toBe('non_assignment_button');
    expect((result as any).buttons).toEqual([
      {
        display: '%{{user-name}}...Enter name',
        value: '%{{user-name}}...Enter name',
      },
    ]);
  });

  test('should NOT support empty variable names', () => {
    const result = parser.parse('?[%{{}}...Enter name]');

    // Should be treated as non-assignment button
    expect(result.type).toBe('non_assignment_button');
    expect((result as any).buttons).toEqual([
      { display: '%{{}}...Enter name', value: '%{{}}...Enter name' },
    ]);
  });

  test('should work correctly with parseToRemarkFormat for valid names', () => {
    const result = parser.parseToRemarkFormat(
      '?[%{{userPreference}} Option A | Option B]'
    );

    expect(result.variableName).toBe('userPreference');
    expect(result.buttonTexts).toEqual(['Option A', 'Option B']);
    expect(result.buttonValues).toEqual(['Option A', 'Option B']);
    expect(result.isMultiSelect).toBe(false);
  });

  test('should fallback correctly with parseToRemarkFormat for invalid names', () => {
    const result = parser.parseToRemarkFormat(
      '?[%{{User Preference}} Option A | Option B]'
    );

    // Should not have variableName since variable name is invalid
    expect(result.variableName).toBeUndefined();
    expect(result.buttonTexts).toEqual([
      '%{{User Preference}} Option A',
      'Option B',
    ]);
    expect(result.buttonValues).toEqual([
      '%{{User Preference}} Option A',
      'Option B',
    ]);
  });
});

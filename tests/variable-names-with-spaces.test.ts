import { InteractionParser } from '../src/interaction-parser';

describe('Variable names with spaces support', () => {
  let parser: InteractionParser;

  beforeEach(() => {
    parser = new InteractionParser();
  });

  test('should parse variable names containing spaces in text input', () => {
    const result = parser.parse('?[%{{User Name}}...Enter your name]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('User Name');
    expect((result as any).question).toBe('Enter your name');
  });

  test('should parse variable names containing spaces in button selection', () => {
    const result = parser.parse('?[%{{Favorite Color}} Red | Blue | Green]');

    expect(result.type).toBe('buttons_only');
    expect((result as any).variable).toBe('Favorite Color');
    expect((result as any).buttons).toEqual([
      { display: 'Red', value: 'Red' },
      { display: 'Blue', value: 'Blue' },
      { display: 'Green', value: 'Green' },
    ]);
    expect((result as any).isMultiSelect).toBe(false);
  });

  test('should parse variable names containing spaces in multi-select', () => {
    const result = parser.parse(
      '?[%{{Programming Language}} JavaScript||TypeScript||Python]'
    );

    expect(result.type).toBe('buttons_multi_select');
    expect((result as any).variable).toBe('Programming Language');
    expect((result as any).buttons).toEqual([
      { display: 'JavaScript', value: 'JavaScript' },
      { display: 'TypeScript', value: 'TypeScript' },
      { display: 'Python', value: 'Python' },
    ]);
    expect((result as any).isMultiSelect).toBe(true);
  });

  test('should parse variable names with spaces in combined format', () => {
    const result = parser.parse(
      '?[%{{Spending Power}} High spender | Mid spender | Price-sensitive | ...Other]'
    );

    expect(result.type).toBe('buttons_with_text');
    expect((result as any).variable).toBe('Spending Power');
    expect((result as any).buttons).toEqual([
      { display: 'High spender', value: 'High spender' },
      { display: 'Mid spender', value: 'Mid spender' },
      { display: 'Price-sensitive', value: 'Price-sensitive' },
    ]);
    expect((result as any).question).toBe('Other');
    expect((result as any).isMultiSelect).toBe(false);
  });

  test('should handle multiple words in variable names', () => {
    const result = parser.parse(
      '?[%{{Enterprise Annual Budget Range}}...Enter budget range]'
    );

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('Enterprise Annual Budget Range');
    expect((result as any).question).toBe('Enter budget range');
  });

  test('should parse variable names with spaces using parseToRemarkFormat', () => {
    const result = parser.parseToRemarkFormat(
      '?[%{{User Preference}} Option A | Option B]'
    );

    expect(result.variableName).toBe('User Preference');
    expect(result.buttonTexts).toEqual(['Option A', 'Option B']);
    expect(result.buttonValues).toEqual(['Option A', 'Option B']);
    expect(result.isMultiSelect).toBe(false);
  });

  test('should handle variable names with leading/trailing spaces', () => {
    const result = parser.parse('?[%{{ User Role }}...Select role]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('User Role'); // Should trim spaces
    expect((result as any).question).toBe('Select role');
  });

  test('should work with Chinese variable names containing spaces', () => {
    const result = parser.parse('?[%{{用户 偏好}}...请选择偏好]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('用户 偏好');
    expect((result as any).question).toBe('请选择偏好');
  });

  test('should handle mixed language variable names with spaces', () => {
    const result = parser.parse(
      '?[%{{Language 语言}} English//en | 中文//zh | 日本語//ja]'
    );

    expect(result.type).toBe('buttons_only');
    expect((result as any).variable).toBe('Language 语言');
    expect((result as any).buttons).toEqual([
      { display: 'English', value: 'en' },
      { display: '中文', value: 'zh' },
      { display: '日本語', value: 'ja' },
    ]);
  });

  test('should maintain backward compatibility with non-spaced variable names', () => {
    const result = parser.parse('?[%{{username}}...Enter username]');

    expect(result.type).toBe('text_only');
    expect((result as any).variable).toBe('username');
    expect((result as any).question).toBe('Enter username');
  });
});

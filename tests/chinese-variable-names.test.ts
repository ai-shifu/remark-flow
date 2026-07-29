import remarkInteraction from '../src/remark-interaction';
import {
  createTextNode,
  createParentNode,
  findCustomNodes,
} from './test-utils';

describe('Chinese Variable Names Support', () => {
  test('should support pure Chinese variable names', () => {
    const textNode = createTextNode('选择: ?[%{{颜色}} 红色 | 蓝色 | 绿色]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkInteraction();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');

    const props = customNodes[0].data.hProperties;
    expect(props.variableName).toBe('颜色');
    expect(props.buttonTexts).toEqual(['红色', '蓝色', '绿色']);
    expect(props.buttonValues).toEqual(['红色', '蓝色', '绿色']);
  });

  test('should support mixed Chinese and English variable names', () => {
    const textNode = createTextNode('Theme: ?[%{{主题theme}} light | dark]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkInteraction();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');

    const props = customNodes[0].data.hProperties;
    expect(props.variableName).toBe('主题theme');
    expect(props.buttonTexts).toEqual(['light', 'dark']);
    expect(props.buttonValues).toEqual(['light', 'dark']);
  });

  test('should support Chinese variable names with numbers and underscores', () => {
    const textNode = createTextNode('Config: ?[%{{配置_1}} option1 | option2]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkInteraction();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');

    const props = customNodes[0].data.hProperties;
    expect(props.variableName).toBe('配置_1');
    expect(props.buttonTexts).toEqual(['option1', 'option2']);
    expect(props.buttonValues).toEqual(['option1', 'option2']);
  });

  test('should support complex Chinese variable with placeholder', () => {
    const textNode = createTextNode('输入: ?[%{{用户名}}...请输入您的姓名]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkInteraction();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');

    const props = customNodes[0].data.hProperties;
    expect(props.variableName).toBe('用户名');
    expect(props.placeholder).toBe('请输入您的姓名');
    expect(props.buttonTexts).toBeUndefined();
    expect(props.buttonValues).toBeUndefined();
  });

  test('should support variable names starting with underscore', () => {
    const textNode = createTextNode('Private: ?[%{{_私有变量}} yes | no]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkInteraction();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');

    const props = customNodes[0].data.hProperties;
    expect(props.variableName).toBe('_私有变量');
    expect(props.buttonTexts).toEqual(['yes', 'no']);
    expect(props.buttonValues).toEqual(['yes', 'no']);
  });

  test('should allow variable names starting with a number', () => {
    // Aligned with the published 0.1.6 behavior and the permissive Python
    // parser: digits are allowed anywhere in the variable name.
    const textNode = createTextNode('Valid: ?[%{{1变量}} option]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkInteraction();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');

    const props = customNodes[0].data.hProperties;
    expect(props.variableName).toBe('1变量');
    expect(props.buttonTexts).toEqual(['option']);
    expect(props.buttonValues).toEqual(['option']);
  });

  test('should keep original text for empty variable name', () => {
    // Same guard as remark-custom-variable: %{{}} is malformed, so the text
    // node is preserved instead of being misparsed as display buttons.
    const textNode = createTextNode('Empty: ?[%{{}} option]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkInteraction();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(0);
    expect((parentNode.children[0] as unknown as { value: string }).value).toBe(
      'Empty: ?[%{{}} option]'
    );
  });
});

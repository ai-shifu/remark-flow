import remarkFlow from '../src/remark-flow';
import type { Literal } from 'unist';
import {
  createTextNode,
  createParentNode,
  findCustomNodes,
} from './test-utils';

describe('remarkFlow', () => {
  test('should process variable syntax first, then button syntax', () => {
    const textNode1 = createTextNode('Variable: ?[%{{color}} red | blue]');
    const textNode2 = createTextNode(' Button: ?[Submit]');
    const parentNode = createParentNode([textNode1, textNode2]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(2);

    // First should be variable
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('color');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual([
      'red',
      'blue',
    ]);

    // Second should be button (now also custom-variable)
    expect(customNodes[1].data.hName).toBe('custom-variable');
    expect(customNodes[1].data.hProperties.buttonTexts).toEqual(['Submit']);
    expect(customNodes[1].data.hProperties.variableName).toBeUndefined();
  });

  test('should process both variable and button syntax in same text', () => {
    // This text contains both variable and button syntax
    const textNode = createTextNode('Mixed: ?[%{{action}} save] and ?[Cancel]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    // Both should be processed: variable first, then button in remaining text
    expect(customNodes).toHaveLength(2);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('action');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['save']);

    expect(customNodes[1].data.hName).toBe('custom-variable');
    expect(customNodes[1].data.hProperties.buttonTexts).toEqual(['Cancel']);
    expect(customNodes[1].data.hProperties.variableName).toBeUndefined();
  });

  test('should process button syntax when no variable syntax present', () => {
    const textNode = createTextNode('Click: ?[Submit] or ?[Cancel]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(2);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['Submit']);
    expect(customNodes[0].data.hProperties.variableName).toBeUndefined();
    expect(customNodes[1].data.hName).toBe('custom-variable');
    expect(customNodes[1].data.hProperties.buttonTexts).toEqual(['Cancel']);
    expect(customNodes[1].data.hProperties.variableName).toBeUndefined();
  });

  test('should handle complex variable syntax', () => {
    const textNode = createTextNode(
      'Choose: ?[%{{color}} red | blue | green | ... custom color]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('color');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual([
      'red',
      'blue',
      'green',
    ]);
    expect(customNodes[0].data.hProperties.placeholder).toBe('custom color');
  });

  test('should handle placeholder-only variable syntax', () => {
    const textNode = createTextNode('Input: ?[%{{name}} ... enter your name]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('name');
    expect(customNodes[0].data.hProperties.buttonTexts).toBeUndefined();
    expect(customNodes[0].data.hProperties.placeholder).toBe('enter your name');
  });

  test('should handle Chinese button text with valid separators', () => {
    const textNode1 = createTextNode('变量: ?[%{{color}} 红色 | 蓝色]');
    const textNode2 = createTextNode(' 按钮: ?[提交]');
    const parentNode = createParentNode([textNode1, textNode2]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(2);

    // Find nodes by whether they have variableName or not
    const variableNode = customNodes.find(
      node => node.data.hProperties.variableName
    );
    const buttonNode = customNodes.find(
      node => !node.data.hProperties.variableName
    );

    expect(variableNode).toBeDefined();
    expect(variableNode.data.hProperties.variableName).toBe('color');
    expect(variableNode.data.hProperties.buttonTexts).toEqual(['红色', '蓝色']);

    expect(buttonNode).toBeDefined();
    expect(buttonNode.data.hProperties.buttonTexts).toEqual(['提交']);
    expect(buttonNode.data.hProperties.variableName).toBeUndefined();
  });

  test('should handle multi-select button syntax', () => {
    const textNode = createTextNode(
      'Select options: ?[%{{preferences}} Option A||Option B||Option C]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('preferences');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual([
      'Option A',
      'Option B',
      'Option C',
    ]);
    expect(customNodes[0].data.hProperties.buttonValues).toEqual([
      'Option A',
      'Option B',
      'Option C',
    ]);
    expect(customNodes[0].data.hProperties.isMultiSelect).toBe(true);
  });

  test('should handle multi-select with custom values', () => {
    const textNode = createTextNode(
      'Choose themes: ?[%{{themes}} Light Theme//light||Dark Theme//dark||High Contrast//hc]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('themes');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual([
      'Light Theme',
      'Dark Theme',
      'High Contrast',
    ]);
    expect(customNodes[0].data.hProperties.buttonValues).toEqual([
      'light',
      'dark',
      'hc',
    ]);
    expect(customNodes[0].data.hProperties.isMultiSelect).toBe(true);
  });

  test('should handle multi-select with text input', () => {
    const textNode = createTextNode(
      'Select colors: ?[%{{colors}} Red||Blue||Green||...Custom color name]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('colors');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual([
      'Red',
      'Blue',
      'Green',
    ]);
    expect(customNodes[0].data.hProperties.buttonValues).toEqual([
      'Red',
      'Blue',
      'Green',
    ]);
    expect(customNodes[0].data.hProperties.placeholder).toBe(
      'Custom color name'
    );
    expect(customNodes[0].data.hProperties.isMultiSelect).toBe(true);
  });

  test('should handle Chinese multi-select button text', () => {
    const textNode = createTextNode(
      '选择选项: ?[%{{选项}} 选项A||选项B||选项C]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(1);
    expect(customNodes[0].data.hName).toBe('custom-variable');
    expect(customNodes[0].data.hProperties.variableName).toBe('选项');
    expect(customNodes[0].data.hProperties.buttonTexts).toEqual([
      '选项A',
      '选项B',
      '选项C',
    ]);
    expect(customNodes[0].data.hProperties.isMultiSelect).toBe(true);
  });

  test('should distinguish between single and multi-select', () => {
    const textNode = createTextNode(
      'Single: ?[%{{single}} A | B] Multi: ?[%{{multi}} X||Y]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(2);

    // Find nodes by variable name
    const singleNode = customNodes.find(
      node => node.data.hProperties.variableName === 'single'
    );
    const multiNode = customNodes.find(
      node => node.data.hProperties.variableName === 'multi'
    );

    expect(singleNode).toBeDefined();
    expect(singleNode.data.hProperties.isMultiSelect).toBe(false);

    expect(multiNode).toBeDefined();
    expect(multiNode.data.hProperties.isMultiSelect).toBe(true);
  });

  test('should not modify nodes without any special syntax', () => {
    const textNode = createTextNode(
      'This is just normal text without any special syntax'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkFlow();
    plugin(parentNode);

    const customNodes = findCustomNodes(parentNode);
    expect(customNodes).toHaveLength(0);
    expect(parentNode.children).toHaveLength(1);
    expect((parentNode.children[0] as Literal).value).toBe(
      'This is just normal text without any special syntax'
    );
  });
});

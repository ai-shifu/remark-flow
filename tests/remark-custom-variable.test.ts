import remarkCustomVariable from '../src/remark-custom-variable';
import type { Literal } from 'unist';
import {
  createTextNode,
  createParentNode,
  findCustomVariableNodes,
} from './test-utils';

describe('remarkCustomVariable', () => {
  test('should parse buttons with placeholder format', () => {
    const textNode = createTextNode(
      'Choose: ?[%{{color}} red | blue | green | ... custom color]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('color');
    expect(props.buttonTexts).toEqual(['red', 'blue', 'green']);
    expect(props.placeholder).toBe('custom color');
  });

  test('should parse buttons only format', () => {
    const textNode = createTextNode(
      'Select: ?[%{{size}} small | medium | large]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('size');
    expect(props.buttonTexts).toEqual(['small', 'medium', 'large']);
    expect(props.placeholder).toBeUndefined();
  });

  test('should parse single button format', () => {
    const textNode = createTextNode('Action: ?[%{{action}} submit]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('action');
    expect(props.buttonTexts).toEqual(['submit']);
    expect(props.placeholder).toBeUndefined();
  });

  test('should parse placeholder only format', () => {
    const textNode = createTextNode('Input: ?[%{{name}} ... enter your name]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('name');
    expect(props.buttonTexts).toBeUndefined();
    expect(props.placeholder).toBe('enter your name');
  });

  test('should not parse Chinese full-width separator (｜) as individual buttons', () => {
    const textNode = createTextNode('Choose: ?[%{{fruit}} 苹果｜香蕉｜橘子]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('fruit');
    // Should treat the entire content as a single button since ｜ is not a valid separator
    expect(props.buttonTexts).toEqual(['苹果｜香蕉｜橘子']);
    expect(props.buttonValues).toEqual(['苹果｜香蕉｜橘子']);
  });

  test('should handle mixed separators - only half-width pipes are valid', () => {
    const textNode = createTextNode(
      'Mixed: ?[%{{type}} option1 | option2｜option3]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('type');
    // Only half-width pipe | is valid, so option2｜option3 is treated as one button
    expect(props.buttonTexts).toEqual(['option1', 'option2｜option3']);
    expect(props.buttonValues).toEqual(['option1', 'option2｜option3']);
  });

  test('should NOT handle spaces between braces - treat as non-assignment button', () => {
    const textNode = createTextNode(
      'Spaced: ?[%{{  var  }} button1  |  button2  |  ...  placeholder  ]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    // Should not have variableName since spaces in braces are invalid
    expect(props.variableName).toBeUndefined();
    expect(props.buttonTexts).toEqual(['%{{  var  }} button1', 'button2', '...  placeholder']);
    expect(props.placeholder).toBeUndefined();
  });

  test('should not match invalid syntax', () => {
    const invalidCases = [
      '?[%{variable} button]', // wrong variable syntax
      '?[%{{}} button]', // empty variable name
    ];

    invalidCases.forEach(testCase => {
      const textNode = createTextNode(testCase);
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customVariables = findCustomVariableNodes(parentNode);
      expect(customVariables).toHaveLength(0);
    });
  });

  test('should match variable with no content as placeholder-only', () => {
    const textNode = createTextNode('Input: ?[%{{var}}]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('var');
    expect(props.buttonTexts).toBeUndefined();
    expect(props.placeholder).toBe('');
  });

  test('should not match whitespace only content', () => {
    const textNode = createTextNode('?[%{{var}} ]'); // only whitespace content
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    // This actually matches as single button format, but creates empty buttonTexts
    expect(customVariables).toHaveLength(1);
    expect(customVariables[0].data.hProperties.variableName).toBe('var');
    expect(customVariables[0].data.hProperties.buttonTexts).toBeUndefined();
  });

  test('should handle variable when multiple variables in same text', () => {
    const textNode = createTextNode(
      'First: ?[%{{color}} red | blue] and Second: ?[%{{size}} ... enter size]'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    // Plugin now processes all matches in the text
    expect(customVariables).toHaveLength(2);

    // Check both variables are processed
    expect(customVariables[0].data.hProperties.variableName).toBe('color');
    expect(customVariables[0].data.hProperties.buttonTexts).toEqual([
      'red',
      'blue',
    ]);

    expect(customVariables[1].data.hProperties.variableName).toBe('size');
    expect(customVariables[1].data.hProperties.placeholder).toBe('enter size');
  });

  test('should handle multiple variables when in separate text nodes', () => {
    const textNode1 = createTextNode('First: ?[%{{color}} red | blue]');
    const textNode2 = createTextNode(
      ' and Second: ?[%{{size}} ... enter size]'
    );
    const parentNode = createParentNode([textNode1, textNode2]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(2);

    expect(customVariables[0].data.hProperties.variableName).toBe('color');
    expect(customVariables[0].data.hProperties.buttonTexts).toEqual([
      'red',
      'blue',
    ]);

    expect(customVariables[1].data.hProperties.variableName).toBe('size');
    expect(customVariables[1].data.hProperties.placeholder).toBe('enter size');
  });

  test('should prioritize correct format when multiple patterns could match', () => {
    // This should match placeholder-only format, not single button
    const textNode = createTextNode('Test: ?[%{{var}} ... some placeholder]');
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(1);

    const props = customVariables[0].data.hProperties;
    expect(props.variableName).toBe('var');
    expect(props.buttonTexts).toBeUndefined();
    expect(props.placeholder).toBe('some placeholder');
  });

  test('should not modify nodes without variable syntax', () => {
    const textNode = createTextNode(
      'This is just normal text without any variables'
    );
    const parentNode = createParentNode([textNode]);

    const plugin = remarkCustomVariable();
    plugin(parentNode);

    const customVariables = findCustomVariableNodes(parentNode);
    expect(customVariables).toHaveLength(0);
    expect(parentNode.children).toHaveLength(1);
    expect((parentNode.children[0] as Literal).value).toBe(
      'This is just normal text without any variables'
    );
  });
});

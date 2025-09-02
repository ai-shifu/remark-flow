import remarkFlow from '../src/remark-flow';
import type { Node, Parent, Literal } from 'unist';

describe('remarkFlow', () => {
  function createTextNode(value: string): Literal {
    return { type: 'text', value };
  }

  function createParentNode(children: Node[]): Parent {
    return { type: 'paragraph', children };
  }

  function findCustomNodes(tree: Node): any[] {
    const customNodes: any[] = [];

    function visit(node: any) {
      if (
        node.type === 'element' &&
        (node.data?.hName === 'custom-button' ||
          node.data?.hName === 'custom-variable')
      ) {
        customNodes.push(node);
      }
      if (node.children) {
        node.children.forEach(visit);
      }
    }

    visit(tree);
    return customNodes;
  }

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

  test('should handle Chinese button text', () => {
    const textNode1 = createTextNode('变量: ?[%{{color}} 红色｜蓝色]');
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

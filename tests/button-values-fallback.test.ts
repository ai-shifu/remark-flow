import remarkCustomVariable from '../src/remark-custom-variable';
import type { Node, Parent, Literal } from 'unist';

describe('ButtonValues Fallback Tests', () => {
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

  describe('Custom Variable - buttonValues always exists when has buttons', () => {
    test('should have buttonValues equal to buttonTexts when no // separator', () => {
      const textNode = createTextNode(
        'Select: ?[%{{color}} red | blue | green]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('color');
      expect(props.buttonTexts).toEqual(['red', 'blue', 'green']);
      expect(props.buttonValues).toEqual(['red', 'blue', 'green']); // fallback to buttonTexts
    });

    test('should have different buttonValues when // separator is used', () => {
      const textNode = createTextNode(
        'Select: ?[%{{color}} Red//r | Blue//b | Green//g]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('color');
      expect(props.buttonTexts).toEqual(['Red', 'Blue', 'Green']);
      expect(props.buttonValues).toEqual(['r', 'b', 'g']); // custom values
    });

    test('should handle mixed scenarios - some with //, some without', () => {
      const textNode = createTextNode(
        'Select: ?[%{{option}} Normal | Special//sp | Another]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('option');
      expect(props.buttonTexts).toEqual(['Normal', 'Special', 'Another']);
      expect(props.buttonValues).toEqual(['Normal', 'sp', 'Another']); // mixed fallback/custom
    });

    test('should have buttonValues for single button without //', () => {
      const textNode = createTextNode('Action: ?[%{{action}} submit]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('action');
      expect(props.buttonTexts).toEqual(['submit']);
      expect(props.buttonValues).toEqual(['submit']); // fallback to buttonTexts
    });

    test('should have buttonValues for single button with //', () => {
      const textNode = createTextNode(
        'Action: ?[%{{action}} Submit//save-action]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('action');
      expect(props.buttonTexts).toEqual(['Submit']);
      expect(props.buttonValues).toEqual(['save-action']); // custom value
    });

    test('should not have buttonValues when no buttons (text-only)', () => {
      const textNode = createTextNode('Input: ?[%{{name}}...enter your name]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('name');
      expect(props.placeholder).toBe('enter your name');
      expect(props.buttonTexts).toBeUndefined();
      expect(props.buttonValues).toBeUndefined();
    });
  });

  describe('Custom Button (now handled by remarkCustomVariable) - buttonValue fallback', () => {
    test('should have buttonValues equal to buttonTexts when no //', () => {
      const textNode = createTextNode('Click: ?[Submit]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.buttonTexts).toEqual(['Submit']);
      expect(props.buttonValues).toEqual(['Submit']); // fallback to buttonTexts
      expect(props.variableName).toBeUndefined(); // no variable for pure buttons
    });

    test('should have different buttonValues when // is used', () => {
      const textNode = createTextNode('Click: ?[Submit//save-action]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.buttonTexts).toEqual(['Submit']);
      expect(props.buttonValues).toEqual(['save-action']); // custom value
      expect(props.variableName).toBeUndefined(); // no variable for pure buttons
    });

    test('should parse multiple buttons without variable', () => {
      const textNode = createTextNode('Choose: ?[按钮1 | 按钮2 | 按钮3]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.buttonTexts).toEqual(['按钮1', '按钮2', '按钮3']);
      expect(props.buttonValues).toEqual(['按钮1', '按钮2', '按钮3']);
      expect(props.variableName).toBeUndefined();
    });

    test('should parse multiple buttons with Button//value syntax', () => {
      const textNode = createTextNode(
        'Choose: ?[Option A//opt_a | Option B//opt_b | Option C//opt_c]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.buttonTexts).toEqual(['Option A', 'Option B', 'Option C']);
      expect(props.buttonValues).toEqual(['opt_a', 'opt_b', 'opt_c']);
      expect(props.variableName).toBeUndefined();
    });
  });
});

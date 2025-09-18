import remarkCustomVariable from '../src/remark-custom-variable';
import {
  createTextNode,
  createParentNode,
  findCustomNodes,
} from './test-utils';

describe('ButtonValues Fallback Tests', () => {
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

  describe('Multi-Select ButtonValues Fallback Tests', () => {
    test('should have buttonValues equal to buttonTexts for multi-select without //', () => {
      const textNode = createTextNode(
        'Select: ?[%{{skills}} JavaScript||TypeScript||Python]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('skills');
      expect(props.buttonTexts).toEqual(['JavaScript', 'TypeScript', 'Python']);
      expect(props.buttonValues).toEqual([
        'JavaScript',
        'TypeScript',
        'Python',
      ]); // fallback to buttonTexts
      expect(props.isMultiSelect).toBe(true);
    });

    test('should have different buttonValues for multi-select with // separator', () => {
      const textNode = createTextNode(
        'Select: ?[%{{lang}} JavaScript//js||TypeScript//ts||Python//py]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('lang');
      expect(props.buttonTexts).toEqual(['JavaScript', 'TypeScript', 'Python']);
      expect(props.buttonValues).toEqual(['js', 'ts', 'py']); // custom values
      expect(props.isMultiSelect).toBe(true);
    });

    test('should handle mixed scenarios in multi-select - some with //, some without', () => {
      const textNode = createTextNode(
        'Select: ?[%{{stack}} Frontend||Backend//be||Fullstack]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('stack');
      expect(props.buttonTexts).toEqual(['Frontend', 'Backend', 'Fullstack']);
      expect(props.buttonValues).toEqual(['Frontend', 'be', 'Fullstack']); // mixed fallback/custom
      expect(props.isMultiSelect).toBe(true);
    });

    test('should have buttonValues for single multi-select button without //', () => {
      const textNode = createTextNode('Action: ?[%{{choice}} confirm]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('choice');
      expect(props.buttonTexts).toEqual(['confirm']);
      expect(props.buttonValues).toEqual(['confirm']); // fallback to buttonTexts
      expect(props.isMultiSelect).toBe(false); // single button is not multi-select
    });

    test('should handle multi-select with text input fallback', () => {
      const textNode = createTextNode(
        'Tags: ?[%{{tags}} React||Vue||Angular||...Other framework]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('tags');
      expect(props.buttonTexts).toEqual(['React', 'Vue', 'Angular']);
      expect(props.buttonValues).toEqual(['React', 'Vue', 'Angular']); // fallback to buttonTexts
      expect(props.placeholder).toBe('Other framework');
      expect(props.isMultiSelect).toBe(true);
    });

    test('should handle Chinese multi-select with mixed fallback', () => {
      const textNode = createTextNode(
        'Select: ?[%{{技能}} 前端开发||后端开发//backend||全栈工程师]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkCustomVariable();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('技能');
      expect(props.buttonTexts).toEqual(['前端开发', '后端开发', '全栈工程师']);
      expect(props.buttonValues).toEqual(['前端开发', 'backend', '全栈工程师']); // mixed
      expect(props.isMultiSelect).toBe(true);
    });
  });
});

import remarkInteraction from '../src/remark-interaction';
import type { Literal } from 'unist';
import {
  createTextNode,
  createParentNode,
  findCustomNodes,
} from './test-utils';

describe('remarkInteraction (Merged Plugin)', () => {
  describe('Variable Syntax (custom-variable)', () => {
    test('should parse text-only input', () => {
      const textNode = createTextNode('Input: ?[%{{name}}...enter your name]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('name');
      expect(props.placeholder).toBe('enter your name');
      expect(props.buttonTexts).toBeUndefined();
      expect(props.buttonValues).toBeUndefined();
    });

    test('should parse buttons-only', () => {
      const textNode = createTextNode(
        'Select: ?[%{{color}} red | blue | green]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('color');
      expect(props.buttonTexts).toEqual(['red', 'blue', 'green']);
      expect(props.buttonValues).toEqual(['red', 'blue', 'green']);
      expect(props.placeholder).toBeUndefined();
    });

    test('should parse buttons with custom values', () => {
      const textNode = createTextNode(
        'Select: ?[%{{color}} Red//r | Blue//b | Green//g]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('color');
      expect(props.buttonTexts).toEqual(['Red', 'Blue', 'Green']);
      expect(props.buttonValues).toEqual(['r', 'b', 'g']);
      expect(props.placeholder).toBeUndefined();
    });

    test('should parse buttons with text input', () => {
      const textNode = createTextNode(
        'Choose: ?[%{{color}} red | blue | green | ...custom color]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('color');
      expect(props.buttonTexts).toEqual(['red', 'blue', 'green']);
      expect(props.buttonValues).toEqual(['red', 'blue', 'green']);
      expect(props.placeholder).toBe('custom color');
    });
  });

  describe('Button Syntax (now custom-variable)', () => {
    test('should parse single button without value', () => {
      const textNode = createTextNode('Click: ?[Submit]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBeUndefined();
      expect(props.buttonTexts).toEqual(['Submit']);
      expect(props.buttonValues).toEqual(['Submit']);
      expect(props.placeholder).toBeUndefined();
    });

    test('should parse single button with custom value', () => {
      const textNode = createTextNode('Click: ?[Submit//save-action]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBeUndefined();
      expect(props.buttonTexts).toEqual(['Submit']);
      expect(props.buttonValues).toEqual(['save-action']);
      expect(props.placeholder).toBeUndefined();
    });

    test('should parse multiple buttons', () => {
      const textNode = createTextNode(
        'Actions: ?[Save//save | Cancel//cancel | Help]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBeUndefined();
      expect(props.buttonTexts).toEqual(['Save', 'Cancel', 'Help']);
      expect(props.buttonValues).toEqual(['save', 'cancel', 'Help']);
      expect(props.placeholder).toBeUndefined();
    });
  });

  describe('Multi-Select Syntax', () => {
    test('should parse multi-select variable buttons', () => {
      const textNode = createTextNode(
        'Select options: ?[%{{options}} Option A||Option B||Option C]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('options');
      expect(props.buttonTexts).toEqual(['Option A', 'Option B', 'Option C']);
      expect(props.buttonValues).toEqual(['Option A', 'Option B', 'Option C']);
      expect(props.isMultiSelect).toBe(true);
      expect(props.placeholder).toBeUndefined();
    });

    test('should parse multi-select with custom values', () => {
      const textNode = createTextNode(
        'Choose: ?[%{{features}} Feature A//feat_a||Feature B//feat_b||Feature C//feat_c]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('features');
      expect(props.buttonTexts).toEqual([
        'Feature A',
        'Feature B',
        'Feature C',
      ]);
      expect(props.buttonValues).toEqual(['feat_a', 'feat_b', 'feat_c']);
      expect(props.isMultiSelect).toBe(true);
    });

    test('should parse multi-select with text input', () => {
      const textNode = createTextNode(
        'Tags: ?[%{{tags}} JavaScript||TypeScript||Python||...Other language]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('tags');
      expect(props.buttonTexts).toEqual(['JavaScript', 'TypeScript', 'Python']);
      expect(props.buttonValues).toEqual([
        'JavaScript',
        'TypeScript',
        'Python',
      ]);
      expect(props.placeholder).toBe('Other language');
      expect(props.isMultiSelect).toBe(true);
    });

    test('should distinguish single vs multi-select correctly', () => {
      const textNode = createTextNode(
        'Single: ?[%{{theme}} Light | Dark] Multi: ?[%{{lang}} JS||TS||PY]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(2);

      // Find nodes by variable name
      const singleNode = customNodes.find(
        node => node.data.hProperties.variableName === 'theme'
      );
      const multiNode = customNodes.find(
        node => node.data.hProperties.variableName === 'lang'
      );

      expect(singleNode).toBeDefined();
      expect(singleNode.data.hProperties.isMultiSelect).toBe(false);
      expect(singleNode.data.hProperties.buttonTexts).toEqual([
        'Light',
        'Dark',
      ]);

      expect(multiNode).toBeDefined();
      expect(multiNode.data.hProperties.isMultiSelect).toBe(true);
      expect(multiNode.data.hProperties.buttonTexts).toEqual([
        'JS',
        'TS',
        'PY',
      ]);
    });

    test('should handle Chinese multi-select', () => {
      const textNode = createTextNode(
        '选择: ?[%{{技能}} 前端||后端||全栈||...其他技能]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('技能');
      expect(props.buttonTexts).toEqual(['前端', '后端', '全栈']);
      expect(props.buttonValues).toEqual(['前端', '后端', '全栈']);
      expect(props.placeholder).toBe('其他技能');
      expect(props.isMultiSelect).toBe(true);
    });
  });

  describe('Mixed Content', () => {
    test('should process variable first, then button in different text nodes', () => {
      const textNode1 = createTextNode('Variable: ?[%{{action}} save]');
      const textNode2 = createTextNode(' Button: ?[Continue//next]');
      const parentNode = createParentNode([textNode1, textNode2]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(2);

      // Find nodes by type
      const variableNode = customNodes.find(
        node => node.data.hName === 'custom-variable'
      );
      const buttonNode = customNodes.find(
        node => !node.data.hProperties.variableName
      );

      expect(variableNode).toBeDefined();
      expect(variableNode.data.hProperties.variableName).toBe('action');
      expect(variableNode.data.hProperties.buttonTexts).toEqual(['save']);
      expect(variableNode.data.hProperties.buttonValues).toEqual(['save']);

      expect(buttonNode).toBeDefined();
      expect(buttonNode.data.hProperties.buttonTexts).toEqual(['Continue']);
      expect(buttonNode.data.hProperties.buttonValues).toEqual(['next']);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty button content', () => {
      const textNode = createTextNode('Empty: ?[]');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.buttonTexts).toEqual(['']);
      expect(props.buttonValues).toEqual(['']);
    });

    test('should not parse Chinese full-width separators', () => {
      const textNode = createTextNode(
        'Choose: ?[%{{fruit}} Apple｜Banana｜Orange]'
      );
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(1);
      expect(customNodes[0].data.hName).toBe('custom-variable');

      const props = customNodes[0].data.hProperties;
      expect(props.variableName).toBe('fruit');
      // Should treat the entire content as a single button since ｜ is not a valid separator
      expect(props.buttonTexts).toEqual(['Apple｜Banana｜Orange']);
      expect(props.buttonValues).toEqual(['Apple｜Banana｜Orange']);
    });

    test('should not modify text without interaction syntax', () => {
      const textNode = createTextNode('This is normal text');
      const parentNode = createParentNode([textNode]);

      const plugin = remarkInteraction();
      plugin(parentNode);

      const customNodes = findCustomNodes(parentNode);
      expect(customNodes).toHaveLength(0);
      expect(parentNode.children).toHaveLength(1);
      expect((parentNode.children[0] as Literal).value).toBe(
        'This is normal text'
      );
    });
  });
});

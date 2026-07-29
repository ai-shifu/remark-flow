/**
 * Non-assignment (no-variable) interaction shapes.
 *
 * Mirrors the Python parser: interactions without %{{variable}} support the
 * full shape set — single/multi select buttons, text input (?[...question])
 * and buttons + text (?[A|B|...question]). The answer is not assigned to a
 * variable; hosts feed it back into the conversation context.
 */

import {
  InteractionParser,
  InteractionType,
  type NonAssignmentButtonResult,
} from '../src/interaction-parser';
import remarkInteraction from '../src/remark-interaction';
import remarkCustomVariable from '../src/remark-custom-variable';
import {
  createTextNode,
  createParentNode,
  findCustomNodes,
} from './test-utils';

describe('Non-assignment interaction parsing', () => {
  const parser = new InteractionParser();

  test('multi-select buttons keep isMultiSelect', () => {
    const result = parser.parse(
      '?[JavaScript||TypeScript||Python]'
    ) as NonAssignmentButtonResult;

    expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
    expect(result.buttons).toHaveLength(3);
    expect(result.isMultiSelect).toBe(true);
  });

  test('single-select buttons report isMultiSelect false', () => {
    const result = parser.parse(
      '?[Option A | Option B]'
    ) as NonAssignmentButtonResult;

    expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
    expect(result.isMultiSelect).toBe(false);
  });

  test('pure text input: ?[...question]', () => {
    const result = parser.parse(
      '?[...Tell me more]'
    ) as NonAssignmentButtonResult;

    expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
    expect(result.buttons).toEqual([]);
    expect(result.question).toBe('Tell me more');
    expect(result.isMultiSelect).toBe(false);
  });

  test('buttons with text input: ?[A | B | ...question]', () => {
    const result = parser.parse(
      '?[Option A | Option B | ...Other, please specify]'
    ) as NonAssignmentButtonResult;

    expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
    expect(result.buttons.map(b => b.display)).toEqual([
      'Option A',
      'Option B',
    ]);
    expect(result.question).toBe('Other, please specify');
    expect(result.isMultiSelect).toBe(false);
  });

  test('multi-select buttons with text input: ?[A || B || ...question]', () => {
    const result = parser.parse(
      '?[Option A || Option B || ...Other]'
    ) as NonAssignmentButtonResult;

    expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
    expect(result.buttons).toHaveLength(2);
    expect(result.question).toBe('Other');
    expect(result.isMultiSelect).toBe(true);
  });

  test('empty interaction ?[] keeps its historical shape', () => {
    const result = parser.parse('?[]') as NonAssignmentButtonResult;

    expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON);
    expect(result.buttons).toEqual([{ display: '', value: '' }]);
  });
});

describe('Non-assignment remark output', () => {
  const parser = new InteractionParser();

  test('multi-select maps isMultiSelect into props', () => {
    const props = parser.parseToRemarkFormat('?[A||B||C]');

    expect(props.variableName).toBeUndefined();
    expect(props.buttonTexts).toEqual(['A', 'B', 'C']);
    expect(props.isMultiSelect).toBe(true);
  });

  test('text input maps placeholder without buttons', () => {
    const props = parser.parseToRemarkFormat('?[...Anything to add?]');

    expect(props.variableName).toBeUndefined();
    expect(props.buttonTexts).toBeUndefined();
    expect(props.buttonValues).toBeUndefined();
    expect(props.placeholder).toBe('Anything to add?');
  });

  test('buttons with text maps buttons and placeholder', () => {
    const props = parser.parseToRemarkFormat(
      '?[Save//save | Cancel//cancel | ...Other]'
    );

    expect(props.variableName).toBeUndefined();
    expect(props.buttonTexts).toEqual(['Save', 'Cancel']);
    expect(props.buttonValues).toEqual(['save', 'cancel']);
    expect(props.placeholder).toBe('Other');
    expect(props.isMultiSelect).toBe(false);
  });
});

describe('Non-assignment plugin output parity', () => {
  test.each([
    ['?[A||B]'],
    ['?[...Tell me more]'],
    ['?[Option A | Option B | ...Other]'],
    ['?[Continue]'],
  ])('remarkInteraction and remarkCustomVariable agree on %s', input => {
    const run = (plugin: () => (tree: never) => void) => {
      const parent = createParentNode([createTextNode(input)]);
      plugin()(parent as never);
      return findCustomNodes(parent);
    };

    const a = run(remarkInteraction as never);
    const b = run(remarkCustomVariable as never);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].data.hProperties).toEqual(b[0].data.hProperties);
  });
});

import { visit } from 'unist-util-visit';
import type { Node, Parent, Literal } from 'unist';
import {
  InteractionParser,
  type RemarkCompatibleResult,
} from './interaction-parser';
import { INTERACTION_CONTENT_SOURCE } from './escaping';
import { INTERACTION_NODE, TOKENIZED_TREE } from './interaction-syntax';

interface InteractionElementNode extends Node {
  data: {
    hName: string;
    hProperties: RemarkCompatibleResult;
  };
}

/**
 * Create AST node segments
 */
function createSegments(
  value: string,
  startIndex: number,
  endIndex: number,
  parsedResult: RemarkCompatibleResult,
  hName: string
): Array<Literal | InteractionElementNode> {
  return [
    {
      type: 'text',
      value: value.substring(0, startIndex),
    } as Literal,
    {
      type: 'element',
      data: {
        hName,
        hProperties: parsedResult,
      },
    } as InteractionElementNode,
    {
      type: 'text',
      value: value.substring(endIndex),
    } as Literal,
  ];
}

/**
 * Parse `value` as one whole interaction, or return null if it should stay text.
 *
 * Invalid variable syntax is kept as text rather than misparsed: `%{variable}` with one brace,
 * or `%{{}}` with no name, would otherwise become display buttons.
 */
function parseWhole(
  value: string,
  parser: InteractionParser,
  warnLabel: string
): RemarkCompatibleResult | null {
  const whole = new RegExp(`^\\?\\[(${INTERACTION_CONTENT_SOURCE})\\]$`).exec(
    value
  );
  if (!whole) return null;
  const innerContent = whole[1];
  if (
    innerContent.includes('%{') &&
    (!innerContent.includes('%{{') || innerContent.includes('%{{}}'))
  ) {
    return null;
  }
  try {
    return parser.parseToRemarkFormat(value);
  } catch (error) {
    console.warn(`Failed to parse ${warnLabel} syntax:`, error);
    return null;
  }
}

/**
 * Shared visitor body for the remark plugins: find `?[...]` interaction
 * syntax and replace it with a `custom-variable` element.
 * remark-interaction and remark-custom-variable are thin wrappers around
 * this (they only differ in the warning label used on parse failures).
 *
 * @param tree - The AST to transform in place
 * @param warnLabel - Label used in the console warning on parse failures
 *
 * A tree parsed with the interaction tokenizer is marked so at its root, and its interactions
 * are the tokenizer's own nodes, which nothing else rewrites: each becomes an element, or text
 * if it does not parse. Text nodes are not read in such a tree -- any `?[` in one is something
 * Markdown has already rewritten, `\?[` with its escape consumed, and reading it as a question
 * would turn text the author escaped into buttons. A tree without the mark (parsed by another
 * processor, or built by hand) is read from its text nodes, as it always was.
 */
export function transformInteractionsInTree(
  tree: Node,
  warnLabel: string
): void {
  const rootData = tree.data as Record<string, unknown> | undefined;
  const parser = new InteractionParser();

  if (rootData?.[TOKENIZED_TREE] === true) {
    visit(
      tree,
      INTERACTION_NODE,
      (node: Literal, index: number | null, parent: Parent | null) => {
        if (index === null || parent === null) return;
        const value = node.value as string;
        const parsed = parseWhole(value, parser, warnLabel);
        parent.children.splice(
          index,
          1,
          parsed
            ? ({
                type: 'element',
                data: { hName: 'custom-variable', hProperties: parsed },
              } as InteractionElementNode)
            : ({ type: 'text', value } as Literal)
        );
      }
    );
    return;
  }

  visit(
    tree,
    'text',
    (node: Literal, index: number | null, parent: Parent | null) => {
      // Input validation
      if (index === null || parent === null) return;

      const value = node.value as string;

      // Check if contains interaction syntax
      const interactionRegex = new RegExp(
        `\\?\\[(${INTERACTION_CONTENT_SOURCE})\\](?!\\()`
      );
      const match = interactionRegex.exec(value);

      if (match) {
        const fullMatch = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + fullMatch.length;

        try {
          // Check for invalid variable syntax: keep the original text
          // instead of misparsing %{variable} / %{{}} as display buttons.
          const innerContent = match[1];
          if (innerContent.includes('%{')) {
            if (!innerContent.includes('%{{')) {
              // Contains invalid variable syntax %{variable} instead of %{{variable}}
              return;
            }
            // Check for empty variable name %{{}}
            if (innerContent.includes('%{{}}')) {
              return;
            }
          }

          const parsedResult = parser.parseToRemarkFormat(fullMatch);

          // Create AST segments
          const segments = createSegments(
            value,
            startIndex,
            endIndex,
            parsedResult,
            'custom-variable'
          );
          parent.children.splice(index, 1, ...segments);
        } catch (error) {
          console.warn(`Failed to parse ${warnLabel} syntax:`, error);
          // Keep original if parsing fails
        }
      }
    }
  );
}

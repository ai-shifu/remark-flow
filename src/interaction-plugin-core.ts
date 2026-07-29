import { visit } from 'unist-util-visit';
import type { Node, Parent, Literal } from 'unist';
import {
  InteractionParser,
  type RemarkCompatibleResult,
} from './interaction-parser';

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
 * Shared visitor body for the remark plugins: find `?[...]` interaction
 * syntax in text nodes and replace it with a `custom-variable` element.
 * remark-interaction and remark-custom-variable are thin wrappers around
 * this (they only differ in the warning label used on parse failures).
 *
 * @param tree - The AST to transform in place
 * @param warnLabel - Label used in the console warning on parse failures
 */
export function transformInteractionsInTree(
  tree: Node,
  warnLabel: string
): void {
  const parser = new InteractionParser();

  visit(
    tree,
    'text',
    (node: Literal, index: number | null, parent: Parent | null) => {
      // Input validation
      if (index === null || parent === null) return;

      const value = node.value as string;

      // Check if contains interaction syntax
      const interactionRegex = /\?\[([^\]]*)\](?!\()/;
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

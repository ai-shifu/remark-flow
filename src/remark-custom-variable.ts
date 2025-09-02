import { visit } from 'unist-util-visit';
import type { Node, Parent, Literal } from 'unist';
import {
  InteractionParser,
  type RemarkCompatibleResult,
} from './interaction-parser';

interface CustomVariableNode extends Node {
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
): Array<Literal | CustomVariableNode> {
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
    } as CustomVariableNode,
    {
      type: 'text',
      value: value.substring(endIndex),
    } as Literal,
  ];
}

export default function remarkCustomVariable() {
  return (tree: Node) => {
    // Create parser instance
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
            // Check for invalid variable syntax
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

            // Convert to remark compatible format (handle all types for backward compatibility)
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
            console.warn('Failed to parse variable interaction syntax:', error);
            // Keep original if parsing fails
          }
        }
      }
    );
  };
}

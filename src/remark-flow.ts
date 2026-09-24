import type { Node } from 'unist';
import { transformInteractionsInTree } from './interaction-plugin-core';
import { registerInteractionSyntax } from './interaction-syntax';

/**
 * remarkFlow plugin - uses unified interaction parser
 */
export default function remarkFlow(this: unknown) {
  // The tokenizer has to be in place before the Markdown is parsed, not after, so it is
  // registered here, where the processor is.
  registerInteractionSyntax(this);
  return (tree: Node) => {
    transformInteractionsInTree(tree, 'interaction');
  };
}

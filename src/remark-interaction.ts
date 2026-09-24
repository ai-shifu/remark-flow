import type { Node } from 'unist';
import { transformInteractionsInTree } from './interaction-plugin-core';
import { registerInteractionSyntax } from './interaction-syntax';

export default function remarkInteraction(this: unknown) {
  const tokenized = registerInteractionSyntax(this);
  return (tree: Node) => {
    transformInteractionsInTree(tree, 'interaction', tokenized);
  };
}

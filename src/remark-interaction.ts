import type { Node } from 'unist';
import { transformInteractionsInTree } from './interaction-plugin-core';

export default function remarkInteraction() {
  return (tree: Node) => {
    transformInteractionsInTree(tree, 'interaction');
  };
}

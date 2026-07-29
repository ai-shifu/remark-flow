import type { Node } from 'unist';
import { transformInteractionsInTree } from './interaction-plugin-core';

export default function remarkCustomVariable() {
  return (tree: Node) => {
    transformInteractionsInTree(tree, 'variable interaction');
  };
}

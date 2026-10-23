import type { Node } from 'unist';
import { transformInteractionsInTree } from './interaction-plugin-core';
import { registerInteractionSyntax } from './interaction-syntax';

export default function remarkCustomVariable(this: unknown) {
  registerInteractionSyntax(this);
  return (tree: Node, file?: { value?: unknown }) => {
    transformInteractionsInTree(
      tree,
      'variable interaction',
      typeof file?.value === 'string' ? file.value : undefined
    );
  };
}

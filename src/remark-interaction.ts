import type { Node } from 'unist';
import { transformInteractionsInTree } from './interaction-plugin-core';
import { registerInteractionSyntax } from './interaction-syntax';
import { decodeMarkdownSource } from './markdown-source';

export default function remarkInteraction(this: unknown) {
  registerInteractionSyntax(this);
  return (tree: Node, file?: { value?: unknown }) => {
    transformInteractionsInTree(
      tree,
      'interaction',
      decodeMarkdownSource(file?.value)
    );
  };
}

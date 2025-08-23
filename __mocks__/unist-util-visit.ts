import type { Node, Parent } from 'unist'

export function visit(tree: Node, type: string | string[], visitor: (node: any, index: number | null, parent: Parent | null) => void) {
  function walk(node: any, parent: Parent | null, index: number | null) {
    if (typeof type === 'string' && node.type === type) {
      visitor(node, index, parent)
    } else if (Array.isArray(type) && type.includes(node.type)) {
      visitor(node, index, parent)
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], node, i)
      }
    }
  }

  walk(tree, null, null)
}
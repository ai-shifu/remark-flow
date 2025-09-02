import type { Node, Parent, Literal } from 'unist'

export function createTextNode(value: string): Literal {
  return { type: 'text', value }
}

export function createParentNode(children: Node[]): Parent {
  return { type: 'paragraph', children }
}

export function findCustomNodes(tree: Node): any[] {
  const customNodes: any[] = []

  function visit(node: any) {
    if (node.type === 'element' &&
        (node.data?.hName === 'custom-button' || node.data?.hName === 'custom-variable')) {
      customNodes.push(node)
    }
    if (node.children) {
      node.children.forEach(visit)
    }
  }

  visit(tree)
  return customNodes
}

export function findCustomVariableNodes(tree: Node): any[] {
  const customNodes: any[] = []

  function visit(node: any) {
    if (node.type === 'element' && node.data?.hName === 'custom-variable') {
      customNodes.push(node)
    }
    if (node.children) {
      node.children.forEach(visit)
    }
  }

  visit(tree)
  return customNodes
}

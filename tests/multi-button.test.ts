import remarkCustomVariable from '../src/remark-custom-variable'
import type { Node, Parent, Literal } from 'unist'

describe('Multi-button syntax without variable', () => {
  function createTextNode(value: string): Literal {
    return { type: 'text', value }
  }

  function createParentNode(children: Node[]): Parent {
    return { type: 'paragraph', children }
  }

  function findCustomNodes(tree: Node): any[] {
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

  test('should parse multiple buttons without variable', () => {
    const textNode = createTextNode('Choose: ?[按钮1 | 按钮2 | 按钮3]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomVariable()
    plugin(parentNode)
    
    const customNodes = findCustomNodes(parentNode)
    expect(customNodes).toHaveLength(1)
    
    const props = customNodes[0].data.hProperties
    expect(props.buttonTexts).toEqual(['按钮1', '按钮2', '按钮3'])
    expect(props.buttonValues).toEqual(['按钮1', '按钮2', '按钮3'])
    expect(props.variableName).toBeUndefined()
  })

  test('should parse multiple buttons with Button//value syntax', () => {
    const textNode = createTextNode('Choose: ?[Option A//opt_a | Option B//opt_b | Option C//opt_c]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomVariable()
    plugin(parentNode)
    
    const customNodes = findCustomNodes(parentNode)
    expect(customNodes).toHaveLength(1)
    
    const props = customNodes[0].data.hProperties
    expect(props.buttonTexts).toEqual(['Option A', 'Option B', 'Option C'])
    expect(props.buttonValues).toEqual(['opt_a', 'opt_b', 'opt_c'])
    expect(props.variableName).toBeUndefined()
  })

  test('should parse single button without variable', () => {
    const textNode = createTextNode('Click: ?[单个按钮//single_btn]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomVariable()
    plugin(parentNode)
    
    const customNodes = findCustomNodes(parentNode)
    expect(customNodes).toHaveLength(1)
    
    const props = customNodes[0].data.hProperties
    expect(props.buttonTexts).toEqual(['单个按钮'])
    expect(props.buttonValues).toEqual(['single_btn'])
    expect(props.variableName).toBeUndefined()
  })

  test('should parse single button without // separator', () => {
    const textNode = createTextNode('Click: ?[Submit]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomVariable()
    plugin(parentNode)
    
    const customNodes = findCustomNodes(parentNode)
    expect(customNodes).toHaveLength(1)
    
    const props = customNodes[0].data.hProperties
    expect(props.buttonTexts).toEqual(['Submit'])
    expect(props.buttonValues).toEqual(['Submit'])
    expect(props.variableName).toBeUndefined()
  })

  test('should still work with variable syntax', () => {
    const textNode = createTextNode('Select: ?[%{{choice}} Option 1 | Option 2 | Option 3]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomVariable()
    plugin(parentNode)
    
    const customNodes = findCustomNodes(parentNode)
    expect(customNodes).toHaveLength(1)
    
    const props = customNodes[0].data.hProperties
    expect(props.variableName).toBe('choice')
    expect(props.buttonTexts).toEqual(['Option 1', 'Option 2', 'Option 3'])
    expect(props.buttonValues).toEqual(['Option 1', 'Option 2', 'Option 3'])
  })

  test('should handle mixed // separators in buttons without variable', () => {
    const textNode = createTextNode('Options: ?[Normal | Special//sp | Another]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomVariable()
    plugin(parentNode)
    
    const customNodes = findCustomNodes(parentNode)
    expect(customNodes).toHaveLength(1)
    
    const props = customNodes[0].data.hProperties
    expect(props.buttonTexts).toEqual(['Normal', 'Special', 'Another'])
    expect(props.buttonValues).toEqual(['Normal', 'sp', 'Another'])
    expect(props.variableName).toBeUndefined()
  })
})
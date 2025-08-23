import remarkCustomButton from '../src/remark-custom-button'
import type { Node, Parent, Literal } from 'unist'

describe('remarkCustomButton', () => {
  function createTextNode(value: string): Literal {
    return { type: 'text', value }
  }

  function createParentNode(children: Node[]): Parent {
    return { type: 'paragraph', children }
  }

  function findCustomButtonNodes(tree: Node): any[] {
    const customButtons: any[] = []
    
    function visit(node: any) {
      if (node.type === 'element' && node.data?.hName === 'custom-button') {
        customButtons.push(node)
      }
      if (node.children) {
        node.children.forEach(visit)
      }
    }
    
    visit(tree)
    return customButtons
  }

  test('should convert simple button syntax', () => {
    const textNode = createTextNode('Click here: ?[Submit]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomButton()
    plugin(parentNode)
    
    const customButtons = findCustomButtonNodes(parentNode)
    expect(customButtons).toHaveLength(1)
    expect(customButtons[0].data.hProperties.buttonText).toBe('Submit')
  })

  test('should handle button syntax with spaces', () => {
    const textNode = createTextNode('Click: ?[Save Changes]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomButton()
    plugin(parentNode)
    
    const customButtons = findCustomButtonNodes(parentNode)
    expect(customButtons).toHaveLength(1)
    expect(customButtons[0].data.hProperties.buttonText).toBe('Save Changes')
  })

  test('should handle multiple buttons in same text', () => {
    const textNode = createTextNode('Actions: ?[Save] or ?[Cancel]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomButton()
    plugin(parentNode)
    
    const customButtons = findCustomButtonNodes(parentNode)
    expect(customButtons).toHaveLength(2)
    expect(customButtons[0].data.hProperties.buttonText).toBe('Save')
    expect(customButtons[1].data.hProperties.buttonText).toBe('Cancel')
  })

  test('should not match invalid syntax', () => {
    const textNode = createTextNode('Invalid: ?[] or ?[unclosed or ?[closed]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomButton()
    plugin(parentNode)
    
    const customButtons = findCustomButtonNodes(parentNode)
    expect(customButtons).toHaveLength(1) // only 'closed' should match
    expect(customButtons[0].data.hProperties.buttonText).toBe('unclosed or ?[closed')
  })

  test('should handle buttons at start and end of text', () => {
    const textNode = createTextNode('?[Start] middle text ?[End]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomButton()
    plugin(parentNode)
    
    const customButtons = findCustomButtonNodes(parentNode)
    expect(customButtons).toHaveLength(2)
    expect(customButtons[0].data.hProperties.buttonText).toBe('Start')
    expect(customButtons[1].data.hProperties.buttonText).toBe('End')
  })

  test('should handle Chinese text in buttons', () => {
    const textNode = createTextNode('点击: ?[提交] 或 ?[取消]')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomButton()
    plugin(parentNode)
    
    const customButtons = findCustomButtonNodes(parentNode)
    expect(customButtons).toHaveLength(2)
    expect(customButtons[0].data.hProperties.buttonText).toBe('提交')
    expect(customButtons[1].data.hProperties.buttonText).toBe('取消')
  })

  test('should not modify nodes without button syntax', () => {
    const textNode = createTextNode('This is just normal text without any buttons')
    const parentNode = createParentNode([textNode])
    
    const plugin = remarkCustomButton()
    plugin(parentNode)
    
    const customButtons = findCustomButtonNodes(parentNode)
    expect(customButtons).toHaveLength(0)
    expect(parentNode.children).toHaveLength(1)
    expect((parentNode.children[0] as Literal).value).toBe('This is just normal text without any buttons')
  })
})
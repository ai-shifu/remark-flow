import remarkInteraction from '../src/remark-interaction'
import type { Node, Parent, Literal } from 'unist'

describe('remarkInteraction (Merged Plugin)', () => {
  function createTextNode(value: string): Literal {
    return { type: 'text', value }
  }

  function createParentNode(children: Node[]): Parent {
    return { type: 'paragraph', children }
  }

  function findCustomNodes(tree: Node): any[] {
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

  describe('Variable Syntax (custom-variable)', () => {
    test('should parse text-only input', () => {
      const textNode = createTextNode('Input: ?[%{{name}}...enter your name]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBe('name')
      expect(props.placeholder).toBe('enter your name')
      expect(props.buttonTexts).toBeUndefined()
      expect(props.buttonValues).toBeUndefined()
    })

    test('should parse buttons-only', () => {
      const textNode = createTextNode('Select: ?[%{{color}} red | blue | green]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBe('color')
      expect(props.buttonTexts).toEqual(['red', 'blue', 'green'])
      expect(props.buttonValues).toEqual(['red', 'blue', 'green'])
      expect(props.placeholder).toBeUndefined()
    })

    test('should parse buttons with custom values', () => {
      const textNode = createTextNode('Select: ?[%{{color}} Red//r | Blue//b | Green//g]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBe('color')
      expect(props.buttonTexts).toEqual(['Red', 'Blue', 'Green'])
      expect(props.buttonValues).toEqual(['r', 'b', 'g'])
      expect(props.placeholder).toBeUndefined()
    })

    test('should parse buttons with text input', () => {
      const textNode = createTextNode('Choose: ?[%{{color}} red | blue | green | ...custom color]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBe('color')
      expect(props.buttonTexts).toEqual(['red', 'blue', 'green'])
      expect(props.buttonValues).toEqual(['red', 'blue', 'green'])
      expect(props.placeholder).toBe('custom color')
    })
  })

  describe('Button Syntax (now custom-variable)', () => {
    test('should parse single button without value', () => {
      const textNode = createTextNode('Click: ?[Submit]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBeUndefined()
      expect(props.buttonTexts).toEqual(['Submit'])
      expect(props.buttonValues).toEqual(['Submit'])
      expect(props.placeholder).toBeUndefined()
    })

    test('should parse single button with custom value', () => {
      const textNode = createTextNode('Click: ?[Submit//save-action]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBeUndefined()
      expect(props.buttonTexts).toEqual(['Submit'])
      expect(props.buttonValues).toEqual(['save-action'])
      expect(props.placeholder).toBeUndefined()
    })

    test('should parse multiple buttons', () => {
      const textNode = createTextNode('Actions: ?[Save//save | Cancel//cancel | Help]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBeUndefined()
      expect(props.buttonTexts).toEqual(['Save', 'Cancel', 'Help'])
      expect(props.buttonValues).toEqual(['save', 'cancel', 'Help'])
      expect(props.placeholder).toBeUndefined()
    })
  })

  describe('Mixed Content', () => {
    test('should process variable first, then button in different text nodes', () => {
      const textNode1 = createTextNode('Variable: ?[%{{action}} save]')
      const textNode2 = createTextNode(' Button: ?[Continue//next]')
      const parentNode = createParentNode([textNode1, textNode2])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(2)

      // Find nodes by type
      const variableNode = customNodes.find(node => node.data.hName === 'custom-variable')
      const buttonNode = customNodes.find(node => !node.data.hProperties.variableName)

      expect(variableNode).toBeDefined()
      expect(variableNode.data.hProperties.variableName).toBe('action')
      expect(variableNode.data.hProperties.buttonTexts).toEqual(['save'])
      expect(variableNode.data.hProperties.buttonValues).toEqual(['save'])

      expect(buttonNode).toBeDefined()
      expect(buttonNode.data.hProperties.buttonTexts).toEqual(['Continue'])
      expect(buttonNode.data.hProperties.buttonValues).toEqual(['next'])
    })
  })

  describe('Edge Cases', () => {
    test('should handle empty button content', () => {
      const textNode = createTextNode('Empty: ?[]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.buttonTexts).toEqual([''])
      expect(props.buttonValues).toEqual([''])
    })

    test('should handle Chinese separators', () => {
      const textNode = createTextNode('选择: ?[%{{fruit}} 苹果｜香蕉｜橘子]')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')

      const props = customNodes[0].data.hProperties
      expect(props.variableName).toBe('fruit')
      expect(props.buttonTexts).toEqual(['苹果', '香蕉', '橘子'])
      expect(props.buttonValues).toEqual(['苹果', '香蕉', '橘子'])
    })

    test('should not modify text without interaction syntax', () => {
      const textNode = createTextNode('This is normal text')
      const parentNode = createParentNode([textNode])

      const plugin = remarkInteraction()
      plugin(parentNode)

      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(0)
      expect(parentNode.children).toHaveLength(1)
      expect((parentNode.children[0] as Literal).value).toBe('This is normal text')
    })
  })
})

import remarkCustomVariable from '../src/remark-custom-variable'
import remarkFlow from '../src/remark-flow'
import type { Node, Parent, Literal } from 'unist'

describe('New Syntax Tests', () => {
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

  describe('Button Syntax with Values (now handled by remarkCustomVariable)', () => {
    test('should parse button with value', () => {
      const textNode = createTextNode('Click: ?[Submit//save-action]')
      const parentNode = createParentNode([textNode])
      
      const plugin = remarkCustomVariable()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')
      expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['Submit'])
      expect(customNodes[0].data.hProperties.buttonValues).toEqual(['save-action'])
      expect(customNodes[0].data.hProperties.variableName).toBeUndefined()
    })

    test('should parse button without value', () => {
      const textNode = createTextNode('Click: ?[Submit]')
      const parentNode = createParentNode([textNode])
      
      const plugin = remarkCustomVariable()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')
      expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['Submit'])
      expect(customNodes[0].data.hProperties.buttonValues).toEqual(['Submit'])
      expect(customNodes[0].data.hProperties.variableName).toBeUndefined()
    })
  })

  describe('Variable Syntax', () => {
    test('should parse text-only input', () => {
      const textNode = createTextNode('Input: ?[%{{name}}...enter your name]')
      const parentNode = createParentNode([textNode])
      
      const plugin = remarkCustomVariable()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')
      expect(customNodes[0].data.hProperties.variableName).toBe('name')
      expect(customNodes[0].data.hProperties.placeholder).toBe('enter your name')
      expect(customNodes[0].data.hProperties.buttonTexts).toBeUndefined()
    })

    test('should parse buttons-only', () => {
      const textNode = createTextNode('Select: ?[%{{color}} red | blue | green]')
      const parentNode = createParentNode([textNode])
      
      const plugin = remarkCustomVariable()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')
      expect(customNodes[0].data.hProperties.variableName).toBe('color')
      expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['red', 'blue', 'green'])
      expect(customNodes[0].data.hProperties.buttonValues).toEqual(['red', 'blue', 'green'])
      expect(customNodes[0].data.hProperties.placeholder).toBeUndefined()
    })

    test('should parse buttons with custom values', () => {
      const textNode = createTextNode('Select: ?[%{{color}} Red//r | Blue//b | Green//g]')
      const parentNode = createParentNode([textNode])
      
      const plugin = remarkCustomVariable()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')
      expect(customNodes[0].data.hProperties.variableName).toBe('color')
      expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['Red', 'Blue', 'Green'])
      expect(customNodes[0].data.hProperties.buttonValues).toEqual(['r', 'b', 'g'])
    })

    test('should parse buttons with text input', () => {
      const textNode = createTextNode('Choose: ?[%{{color}} red | blue | green | ...custom color]')
      const parentNode = createParentNode([textNode])
      
      const plugin = remarkCustomVariable()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hName).toBe('custom-variable')
      expect(customNodes[0].data.hProperties.variableName).toBe('color')
      expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['red', 'blue', 'green'])
      expect(customNodes[0].data.hProperties.buttonValues).toEqual(['red', 'blue', 'green'])
      expect(customNodes[0].data.hProperties.placeholder).toBe('custom color')
    })

    test('should handle Chinese separators', () => {
      const textNode = createTextNode('选择: ?[%{{fruit}} 苹果｜香蕉｜橘子]')
      const parentNode = createParentNode([textNode])
      
      const plugin = remarkCustomVariable()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(1)
      expect(customNodes[0].data.hProperties.variableName).toBe('fruit')
      expect(customNodes[0].data.hProperties.buttonTexts).toEqual(['苹果', '香蕉', '橘子'])
      expect(customNodes[0].data.hProperties.buttonValues).toEqual(['苹果', '香蕉', '橘子'])
    })
  })

  describe('Combined Flow', () => {
    test('should process variable first, then button', () => {
      const textNode1 = createTextNode('Variable: ?[%{{action}} save]')
      const textNode2 = createTextNode(' Button: ?[Continue//next]')
      const parentNode = createParentNode([textNode1, textNode2])
      
      const plugin = remarkFlow()
      plugin(parentNode)
      
      const customNodes = findCustomNodes(parentNode)
      expect(customNodes).toHaveLength(2)
      
      // Find nodes by whether they have variableName or not
      const variableNode = customNodes.find(node => node.data.hProperties.variableName)
      const buttonNode = customNodes.find(node => !node.data.hProperties.variableName)
      
      expect(variableNode).toBeDefined()
      expect(variableNode.data.hProperties.variableName).toBe('action')
      expect(variableNode.data.hProperties.buttonTexts).toEqual(['save'])
      
      expect(buttonNode).toBeDefined()
      expect(buttonNode.data.hProperties.buttonTexts).toEqual(['Continue'])
      expect(buttonNode.data.hProperties.buttonValues).toEqual(['next'])
      expect(buttonNode.data.hProperties.variableName).toBeUndefined()
    })
  })
})
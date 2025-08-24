import { remarkCustomVariable, remarkFlow, remarkInteraction } from '../src/index'
import defaultExport from '../src/index'

describe('index exports', () => {
  test('should export remarkCustomVariable', () => {
    expect(typeof remarkCustomVariable).toBe('function')
  })

  test('should export remarkFlow', () => {
    expect(typeof remarkFlow).toBe('function')
  })

  test('should export remarkInteraction', () => {
    expect(typeof remarkInteraction).toBe('function')
  })

  test('should export remarkInteraction as default', () => {
    expect(defaultExport).toBe(remarkInteraction)
  })

  test('exported functions should be callable', () => {
    expect(() => remarkCustomVariable()).not.toThrow()
    expect(() => remarkFlow()).not.toThrow()
    expect(() => remarkInteraction()).not.toThrow()
  })

  test('exported functions should return functions', () => {
    const variablePlugin = remarkCustomVariable()
    const flowPlugin = remarkFlow()
    const interactionPlugin = remarkInteraction()
    
    expect(typeof variablePlugin).toBe('function')
    expect(typeof flowPlugin).toBe('function')
    expect(typeof interactionPlugin).toBe('function')
  })
})
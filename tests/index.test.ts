import { remarkCustomButton, remarkCustomVariable } from '../src/index'

describe('index exports', () => {
  test('should export remarkCustomButton', () => {
    expect(typeof remarkCustomButton).toBe('function')
  })

  test('should export remarkCustomVariable', () => {
    expect(typeof remarkCustomVariable).toBe('function')
  })

  test('exported functions should be callable', () => {
    expect(() => remarkCustomButton()).not.toThrow()
    expect(() => remarkCustomVariable()).not.toThrow()
  })

  test('exported functions should return functions', () => {
    const buttonPlugin = remarkCustomButton()
    const variablePlugin = remarkCustomVariable()
    
    expect(typeof buttonPlugin).toBe('function')
    expect(typeof variablePlugin).toBe('function')
  })
})
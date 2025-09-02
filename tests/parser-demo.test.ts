import { InteractionParser, InteractionType } from '../src/interaction-parser'

describe('InteractionParser 演示和测试', () => {
  let parser: InteractionParser

  beforeEach(() => {
    parser = new InteractionParser()
  })

  describe('parseToRemarkFormat 方法测试', () => {
    test('测试变量语法解析', () => {
      const result = parser.parseToRemarkFormat('?[%{{name}}...请输入姓名]')

      expect(result).toEqual({
        variableName: 'name',
        placeholder: '请输入姓名'
      })
    })

    test('测试按钮语法解析', () => {
      const result = parser.parseToRemarkFormat('?[保存//save | 取消//cancel]')

      expect(result).toEqual({
        buttonTexts: ['保存', '取消'],
        buttonValues: ['save', 'cancel']
      })
    })

    test('测试复合语法解析', () => {
      const result = parser.parseToRemarkFormat('?[%{{color}} 红色//red | 蓝色//blue | ...自定义颜色]')

      expect(result).toEqual({
        variableName: 'color',
        buttonTexts: ['红色', '蓝色'],
        buttonValues: ['red', 'blue'],
        placeholder: '自定义颜色'
      })
    })
  })

  describe('parse 方法详细测试', () => {
    test('解析结果包含类型信息', () => {
      const result = parser.parse('?[%{{action}} 确认 | 取消]')

      expect(result.type).toBe(InteractionType.BUTTONS_ONLY)
      expect('variable' in result).toBe(true)
      if ('variable' in result) {
        expect(result.variable).toBe('action')
      }
    })

    test('非变量按钮解析', () => {
      const result = parser.parse('?[开始 | 暂停 | 停止]')

      expect(result.type).toBe(InteractionType.NON_ASSIGNMENT_BUTTON)
      if (result.type === InteractionType.NON_ASSIGNMENT_BUTTON) {
        expect(result.buttons).toHaveLength(3)
        expect(result.buttons.map(b => b.display)).toEqual(['开始', '暂停', '停止'])
      }
    })

    test('错误处理测试', () => {
      const result = parser.parse('不是有效的语法')

      expect(result.error).toBeDefined()
      expect(result.type).toBe(null)
    })
  })

  describe('实际使用场景演示', () => {
    test('模拟用户输入场景', () => {
      const testCases = [
        {
          input: '?[%{{username}}...请输入用户名]',
          expected: 'TEXT_ONLY',
          description: '纯文本输入'
        },
        {
          input: '?[%{{theme}} 浅色 | 深色]',
          expected: 'BUTTONS_ONLY',
          description: '纯按钮选择'
        },
        {
          input: '?[%{{size}} 小//S | 中//M | 大//L | ...其他尺寸]',
          expected: 'BUTTONS_WITH_TEXT',
          description: '按钮+文本输入'
        },
        {
          input: '?[确定 | 取消]',
          expected: 'NON_ASSIGNMENT_BUTTON',
          description: '非赋值按钮'
        }
      ]

      testCases.forEach(testCase => {
        const result = parser.parse(testCase.input)
        expect(result.type).toBe(InteractionType[testCase.expected as keyof typeof InteractionType])
        console.log(`✅ ${testCase.description}: ${testCase.input} -> ${result.type}`)
      })
    })
  })
})

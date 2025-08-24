import { visit } from 'unist-util-visit'
import type { Node, Parent, Literal } from 'unist'

// 预编译的正则表达式常量
const COMPILED_REGEXES = {
  // 基础格式验证 - 匹配 ?[content] 但排除 ?[text](url) 格式
  INTERACTION: /\?\[([^\]]*)\](?!\()/,
  
  // 变量检测 - 匹配 %{{variable}}content 格式 (支持字母、数字、下划线、中文，前后可有空格)
  VARIABLE: /^%\{\{\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\}\}(.*)$/,
  
  // 分割 ... 前后内容
  ELLIPSIS: /^(.*?)\.\.\.(.*)/,
  
  // 分割 Button//value 格式
  BUTTON_VALUE: /^(.+?)\/\/(.+)$/
}

interface CustomInteractionNode extends Node {
  data: {
    hName: string
    hProperties: {
      variableName?: string
      buttonTexts?: string[]
      buttonValues?: string[]
      placeholder?: string
    }
  }
}

interface Button {
  display: string
  value: string
}

/**
 * 解析单个按钮，支持 Button//value 格式
 */
function parseSingleButton(buttonText: string): Button {
  buttonText = buttonText.trim()

  // 检测 Button//value 格式
  const match = COMPILED_REGEXES.BUTTON_VALUE.exec(buttonText)

  if (match) {
    const display = match[1].trim()
    const value = match[2].trim()
    return { display, value }
  } else {
    return { display: buttonText, value: buttonText }
  }
}

/**
 * 解析按钮组
 */
function parseButtons(content: string): Button[] {
  const buttons: Button[] = []
  // 支持英文 | 和中文 ｜ 分隔符
  const buttonTexts = content.split(/[|｜]/)
  
  for (const buttonText of buttonTexts) {
    const trimmed = buttonText.trim()
    if (trimmed) {
      const button = parseSingleButton(trimmed)
      buttons.push(button)
    }
  }

  return buttons
}

/**
 * 解析有变量的交互（变量赋值类型）
 */
function parseVariableInteraction(variableName: string, content: string) {
  // 检测是否有 ... 分隔符
  const ellipsisMatch = COMPILED_REGEXES.ELLIPSIS.exec(content)

  if (ellipsisMatch) {
    // 有 ... 分隔符
    const beforeEllipsis = ellipsisMatch[1].trim()
    const placeholder = ellipsisMatch[2].trim()

    if (/[|｜]/.test(beforeEllipsis) && beforeEllipsis) {
      // 按钮组+文本输入：?[%{{var}} Button1 | Button2 | ...问题]
      const buttons = parseButtons(beforeEllipsis)
      return {
        variableName,
        buttonTexts: buttons.map(b => b.display),
        buttonValues: buttons.map(b => b.value),
        placeholder
      }
    } else {
      // 纯文本输入：?[%{{var}}...问题] 或 ?[%{{var}} 单按钮 | ...问题]
      if (beforeEllipsis) {
        // 有前置按钮
        const buttons = parseButtons(beforeEllipsis)
        return {
          variableName,
          buttonTexts: buttons.map(b => b.display),
          buttonValues: buttons.map(b => b.value),
          placeholder
        }
      } else {
        // 纯文本输入
        return {
          variableName,
          placeholder
        }
      }
    }
  } else {
    // 没有 ... 分隔符
    if (/[|｜]/.test(content) && content) {
      // 纯按钮组：?[%{{var}} Button1 | Button2]
      const buttons = parseButtons(content)
      return {
        variableName,
        buttonTexts: buttons.map(b => b.display),
        buttonValues: buttons.map(b => b.value)
      }
    } else if (content) {
      // 单按钮：?[%{{var}} Button1] 或 ?[%{{var}} Button1//id1]
      const button = parseSingleButton(content)
      return {
        variableName,
        buttonTexts: [button.display],
        buttonValues: [button.value]
      }
    } else {
      // 纯文本输入（无提示）：?[%{{var}}]
      return {
        variableName,
        placeholder: ''
      }
    }
  }
}

/**
 * 解析展示按钮（非变量赋值类型）
 */
function parseDisplayButtons(content: string) {
  if (!content) {
    // 空内容：?[]
    return {
      buttonTexts: [''],
      buttonValues: ['']
    }
  }

  if (/[|｜]/.test(content)) {
    // 多按钮：?[Continue | Cancel]
    const buttons = parseButtons(content)
    return {
      buttonTexts: buttons.map(b => b.display),
      buttonValues: buttons.map(b => b.value)
    }
  } else {
    // 单按钮：?[Continue]
    const button = parseSingleButton(content)
    return {
      buttonTexts: [button.display],
      buttonValues: [button.value]
    }
  }
}

/**
 * 创建AST节点片段
 */
function createSegments(
  value: string, 
  startIndex: number, 
  endIndex: number, 
  parsedResult: any,
  hName: string
): Array<Literal | CustomInteractionNode> {
  return [
    {
      type: 'text',
      value: value.substring(0, startIndex)
    } as Literal,
    {
      type: 'element',
      data: {
        hName,
        hProperties: parsedResult
      }
    } as CustomInteractionNode,
    {
      type: 'text',
      value: value.substring(endIndex)
    } as Literal
  ]
}

export default function remarkInteraction() {
  return (tree: Node) => {
    visit(
      tree,
      'text',
      (node: Literal, index: number | null, parent: Parent | null) => {
        // 输入验证
        if (index === null || parent === null) return
        
        const value = node.value as string
        
        // 第一层：验证基础格式
        const match = COMPILED_REGEXES.INTERACTION.exec(value)
        if (!match) return

        const innerContent = match[1]
        const startIndex = match.index
        const endIndex = startIndex + match[0].length

        // 第二层：变量检测
        const variableMatch = COMPILED_REGEXES.VARIABLE.exec(innerContent)

        try {
          let parsedResult
          let nodeName = 'custom-variable'
          
          if (variableMatch) {
            // 处理变量语法：?[%{{var}} ...]
            const variableName = variableMatch[1].trim()
            const remainingContent = variableMatch[2].trim()
            
            // 检查变量名是否为空或无效
            if (!variableName) return
            
            parsedResult = parseVariableInteraction(variableName, remainingContent)
            nodeName = 'custom-variable'
          } else {
            // 处理按钮语法：?[button]
            parsedResult = parseDisplayButtons(innerContent)
            nodeName = 'custom-variable'
          }
          
          const segments = createSegments(value, startIndex, endIndex, parsedResult, nodeName)
          parent.children.splice(index, 1, ...segments)
        } catch (error) {
          console.warn('Failed to parse interaction syntax:', error)
          // 如果解析失败，保持原样不处理
          return
        }
      }
    )
  }
}
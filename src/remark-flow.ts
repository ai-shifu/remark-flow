import remarkCustomVariable from './remark-custom-variable'
import remarkCustomButton from './remark-custom-button'
import type { Node } from 'unist'

export default function remarkFlow() {
  return (tree: Node) => {
    // 先执行变量插件，再执行按钮插件
    const variablePlugin = remarkCustomVariable()
    const buttonPlugin = remarkCustomButton()
    
    variablePlugin(tree)
    buttonPlugin(tree)
  }
}
import remarkCustomVariable from './remark-custom-variable'
import type { Node } from 'unist'

export default function remarkFlow() {
  return (tree: Node) => {
    // 使用统一的变量插件（已包含按钮处理）
    const variablePlugin = remarkCustomVariable()
    variablePlugin(tree)
  }
}
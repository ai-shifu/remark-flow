# Remark Flow


**用于解析[MarkdownFlow](https://markdownflow.ai) 文档的remark插件库**

MarkdownFlow（也称为 MDFlow 或 markdown-flow）通过 AI 扩展了标准 Markdown，用于创建个性化的交互式页面。我们的口号是：**“一次创作，千人千面”**。

<div align="center">

[![npm version](https://badge.fury.io/js/remark-flow.svg)](https://badge.fury.io/js/remark-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

[English](README.md) | 简体中文

</div>

## 🚀 快速开始

### 安装

```bash
npm install remark-flow
# 或
yarn add remark-flow
# 或
pnpm add remark-flow
```

### 基础用法

```typescript
import { remark } from 'remark';
import remarkFlow from 'remark-flow';

const processor = remark().use(remarkFlow);

const markdown = `
# 欢迎来到交互式内容！

选择你的偏好：?[选项 A | 选项 B | 选项 C]
输入你的姓名：?[%{{username}}...请输入你的姓名]
`;

const result = processor.processSync(markdown);
// 每个 ?[...] 都会成为 AST 中的结构化自定义变量节点
```

### 高级用法

```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFlow from 'remark-flow';
import remarkStringify from 'remark-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkFlow)
  .use(remarkStringify);

const result = processor.processSync(`
选择主题：?[%{{theme}} 浅色//light | 深色//dark | ...自定义]
操作：?[保存更改//save | 取消//cancel]
`);
```

## 🧩 支持的语法模式

### 1. 简单按钮

```markdown
?[提交]
?[继续 | 取消]
?[是 | 否 | 也许]
```

**输出：** `{ buttonTexts: ["是", "否", "也许"], buttonValues: ["是", "否", "也许"] }`

### 2. 自定义按钮值

```markdown
?[保存更改//save-action]
?[确定//confirm | 取消//cancel]
```

**输出：** `{ buttonTexts: ["保存更改"], buttonValues: ["save-action"] }`

### 3. 变量文本输入

```markdown
?[%{{username}}...输入你的姓名]
?[%{{age}}...你多大了？]
?[%{{comment}}...]
```

**输出：** `{ variableName: "username", placeholder: "输入你的姓名" }`

### 4. 变量按钮选择

```markdown
?[%{{theme}} 浅色 | 深色]
?[%{{size}} 小//S | 中//M | 大//L]
```

**输出：** `{ variableName: "theme", buttonTexts: ["浅色", "深色"], buttonValues: ["浅色", "深色"] }`

### 5. 组合：按钮 + 文本输入

```markdown
?[%{{size}} 小//S | 中//M | 大//L | ...自定义尺寸]
```

**输出：**

```typescript
{
  variableName: "size",
  buttonTexts: ["小", "中", "大"],
  buttonValues: ["S", "M", "L"],
  placeholder: "自定义尺寸"
}
```

### 6. Unicode 和国际化支持

```markdown
?[%{{语言}} English//en | 中文//zh | 日本語//ja]
?[%{{用户名}}...请输入您的姓名]
?[👍 好 | 👎 差 | 🤔 不确定]
```
## 📖 API 参考

### 插件导出

```typescript
// 默认导出（推荐）
import remarkFlow from 'remark-flow';

// 命名导出
import {
  remarkFlow, // 主插件，功能上与默认导出相同
  remarkInteraction, // 核心插件，也是默认导出
  remarkCustomVariable, // 变量导向插件
  createInteractionParser, // 解析器工厂
  InteractionType, // 类型枚举
} from 'remark-flow';
```

### 输出格式

所有插件将 `?[...]` 语法转换为 `custom-variable` AST 节点：

```typescript
interface CustomVariableNode extends Node {
  type: 'custom-variable';
  data: {
    variableName?: string; // 对于 %{{name}} 语法
    buttonTexts?: string[]; // 按钮显示文本
    buttonValues?: string[]; // 对应的按钮值
    placeholder?: string; // 文本输入占位符
  };
}
```

### 解析器 API

```typescript
import { createInteractionParser, InteractionType } from 'remark-flow';

const parser = createInteractionParser();

// 解析内容并获取详细结果
const result = parser.parse('?[%{{theme}} 浅色 | 深色]');

// 解析并转换为 remark 兼容格式
const remarkData = parser.parseToRemarkFormat('?[%{{theme}} 浅色 | 深色]');
```

## 🎯 使用场景

**完美适用于：**

- ✅ 交互式文档和教程
- ✅ 对话式 AI 界面（如 ChatGPT）
- ✅ 包含用户输入的教育内容
- ✅ 从 markdown 生成调查和表单
- ✅ 交互式故事应用程序
- ✅ 动态内容个性化

**不适用于：**

- ❌ 无交互的静态博客内容
- ❌ 简单文档站点
- ❌ 非交互式 markdown 处理

## 🔗 集成示例

### 与 Markdown Flow UI 集成

```typescript
import { MarkdownFlow } from 'markdown-flow-ui';
import { remark } from 'remark';
import remarkFlow from 'remark-flow';

function InteractiveChat() {
  const processor = remark().use(remarkFlow);

  const content = `
  欢迎！请选择你的偏好：

  ?[%{{language}} JavaScript | Python | TypeScript | Go]

  点击继续：?[开始吧！//start]
  `;

  return (
    <MarkdownFlow
      initialContentList={[{ content }]}
      onSend={data => {
        console.log('用户选择：', data.buttonText);
        // 处理用户交互
      }}
    />
  );
}
```

### 与自定义渲染器集成

```typescript
import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

function customRenderer() {
  return (tree: Node) => {
    visit(tree, 'custom-variable', (node: any) => {
      const { variableName, buttonTexts, buttonValues, placeholder } =
        node.data;

      // 转换为你的自定义组件
      if (buttonTexts && buttonTexts.length > 0) {
        // 渲染为按钮组
        node.type = 'html';
        node.value = renderButtonGroup(buttonTexts, buttonValues);
      } else if (placeholder) {
        // 渲染为文本输入
        node.type = 'html';
        node.value = renderTextInput(variableName, placeholder);
      }
    });
  };
}
```

### 与 Next.js 和 MDX 集成

```typescript
// pages/interactive.mdx
import { remarkFlow } from 'remark-flow';

export default function Interactive() {
  return (
    <MDXProvider components={{ 'custom-variable': InteractiveComponent }}>
      # 交互式内容 选择你的框架：?[%{{framework}} React |
      Vue | Svelte]
    </MDXProvider>
  );
}

// 在 next.config.js 中配置
const withMDX = require('@next/mdx')({
  options: {
    remarkPlugins: [remarkFlow],
  },
});
```

## 🌐 MarkdownFlow 生态系统

remark-flow 是 MarkdownFlow 生态系统的一部分，用于创建个性化的、AI 驱动的交互式文档：

- **[markdown-flow](https://github.com/ai-shifu/markdown-flow)** - 包含主页、文档和交互式 playground 的主仓库
- **[markdown-flow-agent-py](https://github.com/ai-shifu/markdown-flow-agent-py)** - 用于将 MarkdownFlow 文档转换为个性化内容的 Python 代理
- **[markdown-it-flow](https://github.com/ai-shifu/markdown-it-flow)** - 用于解析和渲染 MarkdownFlow 语法的 markdown-it 插件
- **[remark-flow](https://github.com/ai-shifu/remark-flow)** - 用于在 React 应用中解析和处理 MarkdownFlow 语法的 Remark 插件


## 💖 赞助商

<div align="center">
  <a href="https://ai-shifu.com">
    <img src="https://raw.githubusercontent.com/ai-shifu/ai-shifu/main/assets/logo_en.png" alt="AI-Shifu" width="150" />
  </a>
  <p><strong><a href="https://ai-shifu.com">AI-Shifu.com</a></strong></p>
  <p>AI 驱动的个性化学习平台</p>
</div>

## 📄 许可证

MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [Remark](https://remark.js.org/) 提供 markdown 处理
- [Unified](https://unifiedjs.com/) 提供插件架构
- [Unist](https://github.com/syntax-tree/unist) 提供 AST 工具
- [TypeScript](https://www.typescriptlang.org/) 提供类型安全
- [Jest](https://jestjs.io/) 提供测试框架

## 📞 支持

- 📖 [文档](https://github.com/ai-shifu/remark-flow#readme)
- 🐛 [问题跟踪](https://github.com/ai-shifu/remark-flow/issues)
- 💬 [讨论](https://github.com/ai-shifu/remark-flow/discussions)

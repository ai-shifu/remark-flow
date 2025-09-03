<div align="center">
  <h1>Remark Flow</h1>
  <p><strong>将 Markdown 转换为交互式对话体验</strong></p>

[English](README.md) | 简体中文

[![npm version](https://badge.fury.io/js/remark-flow.svg)](https://badge.fury.io/js/remark-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

</div>

**Remark Flow** 是一个强大的 remark 插件，能够将 Markdown 中的自定义 `?[...]` 语法转换为交互式元素。它专门用于将按钮和变量输入语法转换为结构化数据，从而在应用程序中创建交互式组件。

## 🤝 AI师傅生态系统的组成部分

Remark Flow 作为 [AI-Shifu](https://github.com/ai-shifu/ai-shifu) 对话式AI平台的 markdown 解析基础，并为 [Markdown Flow UI](https://github.com/ai-shifu/markdown-flow-ui) 中使用的交互语法提供支持。虽然这个库可以独立使用，但它专门设计用于在AI驱动的应用程序中实现个性化、交互式体验。

**🌟 实际应用展示：** 访问 [AI-Shifu.com](https://ai-shifu.com) 体验该库在真实教育平台中的应用。

## ✨ 为什么选择 Remark Flow？

与标准 markdown 解析器不同，Remark Flow 专门为**交互式对话内容**而构建：

- 🎯 **按钮语法** - `?[按钮文本]` → 交互式按钮数据
- 🔧 **变量输入** - `?[%{{name}} 选项]` → 表单字段数据
- 🎨 **自定义值** - `?[显示文本//值]` → 分离的显示/值对
- 🌍 **Unicode 支持** - 与中文和其他语言无缝兼容
- 🔄 **多种模式** - 支持复杂的交互模式
- 🏗️ **AST 集成** - 与 remark/unified 生态系统的清洁集成

## 🚀 快速开始

### 安装

```bash
npm install remark-flow
```

### 基础用法

```javascript
import { remark } from 'remark';
import remarkFlow from 'remark-flow';

const processor = remark().use(remarkFlow);

const markdown = `
# 欢迎来到交互式内容！

请选择您的偏好：?[选项 A | 选项 B | 选项 C]
输入您的姓名：?[%{{username}}...请输入您的姓名]
`;

const result = processor.processSync(markdown);
// 每个 ?[...] 都会成为 AST 中的结构化 custom-variable 节点
```

### 高级用法

```javascript
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
?[%{{username}}...输入您的姓名]
?[%{{age}}...您多大了？]
?[%{{comment}}...]
```

**输出：** `{ variableName: "username", placeholder: "输入您的姓名" }`

### 4. 变量按钮选择

```markdown
?[%{{theme}} 浅色 | 深色]
?[%{{size}} 小号//S | 中号//M | 大号//L]
```

**输出：** `{ variableName: "theme", buttonTexts: ["浅色", "深色"], buttonValues: ["浅色", "深色"] }`

### 5. 组合：按钮 + 文本输入

```markdown
?[%{{size}} 小号//S | 中号//M | 大号//L | ...自定义尺寸]
```

**输出：**

```javascript
{
  variableName: "size",
  buttonTexts: ["小号", "中号", "大号"],
  buttonValues: ["S", "M", "L"],
  placeholder: "自定义尺寸"
}
```

### 6. Unicode 与国际化支持

```markdown
?[%{{语言}} English//en | 中文//zh | 日本語//ja]
?[%{{用户名}}...请输入您的姓名]
?[👍 好 | 👎 坏 | 🤔 不确定]
```

## 🏗️ 架构

Remark Flow 采用模块化、分层架构：

```
src/
├── index.ts                   # 主入口点和导出
├── remark-flow.ts             # 主插件实现
├── remark-interaction.ts      # 默认导出插件（推荐）
├── remark-custom-variable.ts  # 专注变量的插件
└── interaction-parser.ts      # 具有 3 层架构的核心解析引擎
```

### 核心组件

- **主插件 (`remark-interaction.ts`)**: 处理所有 `?[...]` 转换的默认导出插件
- **分层解析器 (`interaction-parser.ts`)**: 用于稳健语法分析的三层解析系统
- **变量处理器 (`remark-custom-variable.ts`)**: 用于变量语法模式的专用处理器
- **流程插件 (`remark-flow.ts`)**: 结合所有功能的统一插件

### 三层解析架构

解析器使用精密的三层方法：

1. **第1层：格式验证** - 验证 `?[...]` 模式并排除 markdown 链接
2. **第2层：变量检测** - 识别 `%{{variable}}` 模式并分类内容
3. **第3层：内容解析** - 处理特定语法模式和边界情况

## 📖 API 参考

### 插件导出

```typescript
// 默认导出（推荐）
import remarkFlow from 'remark-flow';

// 命名导出
import {
  remarkFlow, // 主插件，功能与默认导出相同
  remarkInteraction, // 核心插件，即默认导出
  remarkCustomVariable, // 专注变量的插件
  createInteractionParser, // 解析器工厂
  InteractionType, // 类型枚举
} from 'remark-flow';
```

### 输出格式

所有插件都将 `?[...]` 语法转换为 `custom-variable` AST 节点：

```typescript
interface CustomVariableNode extends Node {
  type: 'custom-variable';
  data: {
    variableName?: string; // 用于 %{{name}} 语法
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

// 解析内容并获得详细结果
const result = parser.parse('?[%{{theme}} 浅色 | 深色]');

// 解析并转换为 remark 兼容格式
const remarkData = parser.parseToRemarkFormat('?[%{{theme}} 浅色 | 深色]');
```

## 🎯 使用场景

**最适合：**

- ✅ 交互式文档和教程
- ✅ 对话式AI界面（如ChatGPT）
- ✅ 具有用户输入的教育内容
- ✅ 从 markdown 生成调查和表单
- ✅ 交互式故事应用程序
- ✅ 动态内容个性化

**不太适合：**

- ❌ 无交互的静态博客内容
- ❌ 简单文档网站
- ❌ 非交互式 markdown 处理

## 🛠 开发

### 前置要求

- Node.js 16+
- npm 或 yarn

### 设置

```bash
git clone https://github.com/ai-shifu/remark-flow.git
cd remark-flow
npm install

# 运行测试
npm test

# 构建 TypeScript
npm run build

# 代码检查和格式化
npm run lint:fix
npm run format
```

### 脚本命令

| 脚本                    | 描述                     |
| ----------------------- | ------------------------ |
| `npm test`              | 使用 Jest 运行测试套件   |
| `npm run test:coverage` | 生成覆盖率报告           |
| `npm run test:watch`    | 在监听模式下运行测试     |
| `npm run build`         | 编译 TypeScript 到 dist/ |
| `npm run lint`          | ESLint 代码质量检查      |
| `npm run lint:fix`      | 自动修复 linting 问题    |
| `npm run format`        | 使用 Prettier 格式化代码 |

### 测试

综合测试覆盖包括：

- ✅ 所有语法模式的**单元测试**
- ✅ 与 remark 处理器的**集成测试**
- ✅ 中文文本的**Unicode 支持**测试
- ✅ **边界情况**和错误处理
- ✅ 大型内容的**性能测试**
- ✅ 现有功能的**回归测试**

## 🔗 集成示例

### 与 Markdown Flow UI 集成

```jsx
import { MarkdownFlow } from 'markdown-flow-ui';
import { remark } from 'remark';
import remarkFlow from 'remark-flow';

function InteractiveChat() {
  const processor = remark().use(remarkFlow);

  const content = `
  欢迎！请选择您的偏好：

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

      // 转换为您的自定义组件
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

```jsx
// pages/interactive.mdx
import { remarkFlow } from 'remark-flow';

export default function Interactive() {
  return (
    <MDXProvider components={{ 'custom-variable': InteractiveComponent }}>
      # 交互式内容 选择您的框架：?[%{{ framework }} React | Vue | Svelte]
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

## 🌟 与 AI师傅生态系统集成

Remark Flow 在 AI师傅生态系统中得到积极使用：

### AI师傅平台

```bash
# 体验库的实际应用
git clone https://github.com/ai-shifu/ai-shifu.git
cd ai-shifu/docker
cp .env.example.minimal .env
# 配置您的 .env 文件
docker compose up -d
# 访问 http://localhost:8080
```

### Markdown Flow UI

```bash
# 查看使用此解析器的 UI 组件
git clone https://github.com/ai-shifu/markdown-flow-ui.git
cd markdown-flow-ui
pnpm install
pnpm storybook
# 访问 http://localhost:6006
```

## 🔧 配置与自定义

### 错误处理

Remark Flow 设计用于**优雅降级**：

```javascript
// 无效语法会被保留，永不崩溃处理
const result = processor.processSync(`
  常规 markdown 内容
  ?[不完整语法
  更多内容正常继续
`);
```

### 性能优化

- ✅ **预编译正则模式** 以获得最佳性能
- ✅ **单次 AST 遍历** 最小化处理开销
- ✅ **内存高效** 解析，最小分配
- ✅ **延迟求值** 在大型文档上获得更好性能

### 自定义分隔符

为国际用户支持多种分隔符样式：

```markdown
?[选项1 | 选项2 | 选项3] # 标准竖线
?[选项1 ｜ 选项2 ｜ 选项3] # 全角竖线（中文输入）
?[按钮 | 更多 | ...文本输入] # 省略号分隔符
```

## 🔍 故障排除

### 常见问题

| 问题               | 解决方案                                     |
| ------------------ | -------------------------------------------- |
| 插件未转换内容     | 确保 `?[...]` 语法准确，而不是 `?[...](url)` |
| Unicode 字符不工作 | 检查正则模式支持 Unicode 范围                |
| 性能问题           | 使用预编译模式，避免嵌套处理                 |
| 自定义值未解析     | 确保 `//` 分隔符格式：`显示文本//值`         |

### 调试模式

```javascript
import { createInteractionParser } from 'remark-flow';

const parser = createInteractionParser();
const result = parser.parse('?[测试内容]');

if (result.error) {
  console.error('解析错误：', result.error);
} else {
  console.log('解析结果：', result);
}
```

## 📄 许可证

该项目采用 MIT 许可证 - 有关详情请参阅 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [Remark](https://remark.js.org/) 提供强大的 markdown 处理生态系统
- [Unified](https://unifiedjs.com/) 提供优秀的插件架构
- [Unist](https://github.com/syntax-tree/unist) 提供 AST 工具
- [TypeScript](https://www.typescriptlang.org/) 提供类型安全
- [Jest](https://jestjs.io/) 提供全面测试

## 📞 支持

- 📖 [文档](https://github.com/ai-shifu/remark-flow#readme)
- 🐛 [问题跟踪](https://github.com/ai-shifu/remark-flow/issues)
- 💬 [讨论](https://github.com/ai-shifu/remark-flow/discussions)
- 🌟 [AI师傅平台](https://ai-shifu.com)

---

<div align="center">

用❤️为交互式内容社区制作

**[在 GitHub 上给我们 Star](https://github.com/ai-shifu/remark-flow) • [试用 AI师傅](https://ai-shifu.com) • [查看示例](https://github.com/ai-shifu/markdown-flow-ui)**

</div>

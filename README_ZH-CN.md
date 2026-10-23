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

单选选项：?[选项 A | 选项 B | 选项 C]
多选技能：?[%{{skills}} JavaScript||TypeScript||Python]
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

**输出：** `{ buttonTexts: ["是", "否", "也许"], buttonValues: ["是", "否", "也许"], isMultiSelect: false }`

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

**输出：** `{ variableName: "theme", buttonTexts: ["浅色", "深色"], buttonValues: ["浅色", "深色"], isMultiSelect: false }`

### 5. 变量按钮选择（多选）

```markdown
?[%{{skills}} JavaScript||TypeScript||Python]
?[%{{lang}} JS//JavaScript||TS//TypeScript||PY//Python]
```

**输出：** `{ variableName: "skills", buttonTexts: ["JavaScript", "TypeScript", "Python"], buttonValues: ["JavaScript", "TypeScript", "Python"], isMultiSelect: true }`

### 6. 组合：按钮 + 文本输入

```markdown
# 单选 + 文本输入

?[%{{size}} 小//S | 中//M | 大//L | ...自定义尺寸]

# 多选 + 文本输入

?[%{{tags}} React||Vue||Angular||...其他框架]
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

### 7. 分隔符优先级规则

第一个遇到的分隔符类型决定解析模式：

```markdown
# 单选模式（| 首先出现）

?[%{{option}} A | B||C] # 结果：["A", "B||C"]

# 多选模式（|| 首先出现）

?[%{{option}} A||B | C] # 结果：["A", "B | C"]
```

**要点：**

- `|` = 单选模式，`||` 成为按钮值的一部分
- `||` = 多选模式，`|` 成为按钮值的一部分
- 第一个分隔符类型获胜并决定整个解析行为

### 8. Unicode 和国际化支持

```markdown
?[%{{语言}} English//en | 中文//zh | 日本語//ja]
?[%{{用户名}}...请输入您的姓名]
?[👍 好 | 👎 差 | 🤔 不确定]
```

### 变量名

变量名是两端去掉原有 Python 空白集合后的非空 Unicode 原文。内部普通空格、标点、emoji、
单个花括号、`[`、`]`、`|`、`//` 和 `...` 都会完整保留；内部不得包含 Unicode Cc 控制字符、
U+2028、U+2029，也不能包含标记结束符 `}}`。

第一个字面 `}}` 结束标记；反斜杠和引号都是普通字符，不增加转义或解码规则，不合并内部空格，
不做大小写或 Unicode 归一化。任何位置的 `{{...}}` / `%{{...}}` 都会先被整体读取，其中的 `]`、
选项分隔符和 Markdown 符号不会截断标记。只有去掉 Python 前置空白后位于开头的 `%{{...}}`
负责赋值，选项中的标记保留原文；未闭合标记占据余下文本，不会从内部创造交互按钮。
两端空白集合包含 U+0085、U+001C–001F，U+FEFF 保留为键的一部分。

`escapeInteractionText(text)` 转义变量标记之外的交互运算符，并原样保留标记源码。
它不会闭合或转义未配对的 `{{`；该序列仍占据余下文本，因此不能用此函数将含有它的
任意文本直接嵌入为字面选项。本次不增加额外的花括号转义语法。

```markdown
你的性别是？
?[%{{你的性别是？}} 男 | 女 | 秘密]
```

变量名是答案的存储键，不会自动显示成题干。宿主可使用包导出的
`normalizeVariableName`、`isValidVariableName`、`createVariableExpressionRegex`、
`extractVariableNames`、`findDocumentVariableMarkers` 与 `VARIABLE_NAME_SOURCE`、`VARIABLE_REFERENCE_SOURCE`、
`VARIABLE_ASSIGNMENT_SOURCE`，避免各自维护不同的变量正则。

`extractVariableNames(text)` 按源码出现顺序去重提取 `{{变量名}}`（包括 `%{{变量名}}`）；
它保留现有全文扫描范围，不排除代码块或注释，仍提取代码、HTML、公式、尖括号 URI/邮箱自动链接和链接资源示例内完整的标记；不完整的
示例标记不会越过当前字面上下文的闭合边界，遮住后续变量。该范围包括围栏的信息字符串、
引用或列表里的围栏、开始独立块的缩进代码、引用链接定义的目标和标题（保留原生容器及惰性续行）、在空行或容器边界处结束的普通 HTML 块，
以及 `script`、`style`、`pre`、`textarea` 原始 HTML 块。注释、处理指令、声明和 CDATA 会保留完整的物理结束行。
物理行只使用 LF、CRLF 或 CR 换行；
其他 Unicode 分隔符不会产生 Markdown 行边界。
文档中的交互候选在标记之外遇到空行或原生段落中断时结束；raw interaction reader 仍保持不解释上下文的行为。
Markdown 转义的左花括号不会开启
文档标记；下方 raw reader API 不解释这些 Markdown 上下文。`createVariableExpressionRegex('gu')`
返回独立正则，第一捕获组仍是合法且去掉两端空白后的变量名，适合验证完整标记。

编辑器高亮、占位替换或文档分段统一使用 `findDocumentVariableMarkers(text)`，返回按源码顺序
排列的 `{ start, end, rawName, name }`。`start`、`end` 是原文 UTF-16 偏移，可直接用于
`text.slice(start, end)`；结果保留重复和非法标记。未闭合标记的 `name` 为 `null`，范围到
当前字面上下文的边界为止；在这些上下文之外则到文档结尾。
`extractVariableNames` 复用相同范围，提取去重后的非空合法名称。

只扫描 raw token 时用 `findVariableMarkers(text)`，按第一个 `}}` 一次读取整段标记，不把键内部的 `{{`
递归提取成其他变量。`readVariableMarker(text, start)` 只读取指定位置；两者返回
`{ start, end, rawName, name }`，非法内容的 `name` 为 `null`。
`trimVariablePadding` 使用线性扫描实现相同的两端空白处理，保留 U+FEFF 和内部长空格。
验证完整标记时应将正则 source 锚定；扫描 Markdown 全文统一使用 document reader，避免在非法内容内部重启匹配。
行内代码的起止符不会跨空白段落或代码围栏行配对；未配对起始符之后出现的真实变量标记，
仍会整体占据到第一个字面 `}}`。

`formatVariableReference(name)` 和 `formatVariableAssignment(name)` 返回带两端空格的标记，
非法名称返回 `null`。例如 `question}` 应写成 `{{ question} }}`；直接拼成 `{{question}}}`
会提前闭合，得到另一个键 `question`。请复用格式化函数保持往返一致。

分词后的 AST 会保留原始 NUL 的来源信息，直接调用 `parse`、`runSync` 而不重复传入原文，
也能拒绝含 NUL 的非法名称，同时保留合法的 U+FFFD 字符。多行标记的序列化会移除引用块、
列表等 Markdown 容器前缀。外部 AST 若已丢失 NUL 和 U+FFFD 的区别，则无法恢复这些信息。
多行标记里的代码围栏、标题和列表符号仍属于名称；实际包住标记的外层代码块保持原样。
ATX 和 Setext 标题保留标题层级，周围正文保留段落边界；行内代码和 HTML 里的标记字样
仍然属于原有 Markdown 上下文。
标记前后的普通文字保留原来的段落边界。

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
    isMultiSelect?: boolean; // 是否为多选模式
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

## 🔗 使用示例

remark-flow 可以通过两种主要方式使用：

1. **独立使用** - 解析和转换语法，然后使用自己的 UI 组件进行渲染
2. **与 markdown-flow-ui 配合** - 使用预构建的 React 组件获得即时交互式 UI

### 🎯 独立使用（自定义渲染）

当独立使用 remark-flow 时，你可以解析语法并基于 AST 节点创建自己的 UI 组件。

#### 基础 AST 转换

```typescript
import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import remarkFlow from 'remark-flow';
import type { Node } from 'unist';

const processor = remark().use(remarkFlow);

const markdown = `
# 选择您的偏好

选择语言：?[%{{language}} JavaScript | Python | TypeScript | Go]
选择技能：?[%{{skills}} React||Vue||Angular]
输入姓名：?[%{{username}}...您的全名]
操作：?[保存//save | 取消//cancel]
`;

// 解析并检查 AST
const ast = processor.parse(markdown);
processor.runSync(ast);

// 查找 custom-variable 节点
visit(ast, 'custom-variable', (node: any) => {
  console.log('发现交互元素：', node.data);
  // 输出：{ variableName: 'language', buttonTexts: ['JavaScript', 'Python', 'TypeScript', 'Go'], buttonValues: [...] }
});
```

#### 自定义 HTML 渲染器

```typescript
import { visit } from 'unist-util-visit';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

function createCustomRenderer() {
  return (tree: Node) => {
    visit(tree, 'custom-variable', (node: any) => {
      const {
        variableName,
        buttonTexts,
        buttonValues,
        placeholder,
        isMultiSelect,
      } = node.data;

      if (buttonTexts && buttonTexts.length > 0) {
        // 渲染为按钮组
        const buttonsHtml = buttonTexts
          .map((text, i) => {
            const value = buttonValues?.[i] || text;
            return `<button onclick="selectOption('${variableName}', '${value}')" class="interactive-btn">
              ${text}
            </button>`;
          })
          .join('');

        node.type = 'html';
        node.value = `
          <div class="button-group" data-variable="${variableName}" data-multi-select="${isMultiSelect}">
            ${buttonsHtml}
          </div>
        `;
      } else if (placeholder) {
        // 渲染为文本输入
        node.type = 'html';
        node.value = `
          <div class="input-group">
            <label for="${variableName}">${placeholder}</label>
            <input
              id="${variableName}"
              name="${variableName}"
              placeholder="${placeholder}"
              class="interactive-input"
            />
          </div>
        `;
      }
    });
  };
}

// 与 remark 处理器一起使用
const processor = remark()
  .use(remarkFlow)
  .use(createCustomRenderer)
  .use(remarkHtml);

const result = processor.processSync(markdown);
console.log(result.toString()); // 带有自定义交互元素的 HTML
```

#### React 自定义组件

```typescript
import React from 'react';
import { remark } from 'remark';
import remarkReact from 'remark-react';
import remarkFlow from 'remark-flow';

// 交互元素的自定义 React 组件
const InteractiveButton = ({ variableName, buttonTexts, buttonValues, isMultiSelect, onSelect }) => (
  <div className="flex gap-2">
    {buttonTexts.map((text, i) => (
      <button
        key={i}
        onClick={() => onSelect(variableName, buttonValues[i])}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        {text}
      </button>
    ))}
  </div>
);

const InteractiveInput = ({ variableName, placeholder, onInput }) => (
  <div className="my-2">
    <input
      type="text"
      placeholder={placeholder}
      onChange={(e) => onInput(variableName, e.target.value)}
      className="border border-gray-300 rounded px-3 py-2 w-full"
    />
  </div>
);

// 在 React 组件中使用
function CustomMarkdownRenderer() {
  const handleInteraction = (variableName, value) => {
    console.log(`${variableName}: ${value}`);
    // 处理用户交互
  };

  const processor = remark()
    .use(remarkFlow)
    .use(remarkReact, {
      remarkReactComponents: {
        'custom-variable': ({ node }) => {
          const { variableName, buttonTexts, buttonValues, placeholder, isMultiSelect } = node.data;

          if (buttonTexts?.length > 0) {
            return (
              <InteractiveButton
                variableName={variableName}
                buttonTexts={buttonTexts}
                buttonValues={buttonValues}
                isMultiSelect={isMultiSelect}
                onSelect={handleInteraction}
              />
            );
          }

          if (placeholder) {
            return (
              <InteractiveInput
                variableName={variableName}
                placeholder={placeholder}
                onInput={handleInteraction}
              />
            );
          }

          return null;
        },
      },
    });

  const content = `
  # 交互式表单

  选择语言：?[%{{lang}} English | 中文 | Español]
  选择技能：?[%{{skills}} React||Vue||Angular]
  您的姓名：?[%{{name}}...请输入您的姓名]
  操作：?[提交//submit | 重置//reset]
  `;

  return <div>{processor.processSync(content).result}</div>;
}
```

### 🎨 与 markdown-flow-ui 配合（预构建组件）

使用 [markdown-flow-ui](https://github.com/ai-shifu/markdown-flow-ui) 获得完整的 React 组件库，提供即用的交互式组件。

#### 基础集成

```typescript
import { MarkdownFlow } from 'markdown-flow-ui';

function InteractiveChat() {
  const content = `
  # 欢迎！👋

  选择您的偏好：?[%{{language}} JavaScript | Python | TypeScript]
  选择技能：?[%{{skills}} React||Vue||Angular]
  输入您的姓名：?[%{{username}}...您的全名]
  准备开始：?[开始吧！//start]
  `;

  return (
    <MarkdownFlow
      initialContentList={[{ content }]}
      onSend={(data) => {
        console.log('用户交互：', data);
        // 处理用户交互
      }}
      typingSpeed={30}
    />
  );
}
```

**更多高级示例（包括流式传输、多步骤表单等功能），请查看：**

- 🇨🇳 [markdown-flow-ui 文档](https://github.com/ai-shifu/markdown-flow-ui/blob/main/README_ZH-CN.md)

### 📊 对比：独立使用 vs markdown-flow-ui

| 方面           | 独立使用                       | 配合 markdown-flow-ui          |
| -------------- | ------------------------------ | ------------------------------ |
| **设置复杂度** | 中等 - 需要自定义渲染          | 低 - 预构建组件                |
| **定制化程度** | 高 - 完全控制 UI               | 中等 - 主题/样式定制           |
| **包体积**     | 更小 - 仅 remark 插件          | 更大 - 完整 React 组件库       |
| **框架支持**   | 任意（React、Vue、原生 JS 等） | 仅 React                       |
| **高级功能**   | 需手动实现                     | 内置（流式传输、打字机效果等） |
| **适用场景**   | 自定义 UI 需求、非 React 项目  | 快速原型、React 项目           |

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

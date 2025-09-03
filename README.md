# Remark Flow

**A remark plugin library for parsing [MarkdownFlow](https://markdownflow.ai) documents**

[MarkdownFlow](https://markdownflow.ai) (also known as MDFlow or markdown-flow) extends standard Markdown with AI to create personalized, interactive pages. Its tagline is **"Write Once, Deliver Personally"**.

<div align="center">

[![npm version](https://badge.fury.io/js/remark-flow.svg)](https://badge.fury.io/js/remark-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

English | [简体中文](README_ZH-CN.md)

</div>

## 🚀 Quick Start

### Install

```bash
npm install remark-flow
# or
yarn add remark-flow
# or
pnpm add remark-flow
```

### Basic Usage

```typescript
import { remark } from 'remark';
import remarkFlow from 'remark-flow';

const processor = remark().use(remarkFlow);

const markdown = `
# Welcome to Interactive Content!

Choose your preference: ?[Option A | Option B | Option C]
Enter your name: ?[%{{username}}...Please enter your name]
`;

const result = processor.processSync(markdown);
// Each ?[...] becomes a structured custom-variable node in the AST
```

### Advanced Usage

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
Select theme: ?[%{{theme}} Light//light | Dark//dark | ...custom]
Action: ?[Save Changes//save | Cancel//cancel]
`);
```

## 🧩 Supported Syntax Patterns

### 1. Simple Buttons

```markdown
?[Submit]
?[Continue | Cancel]
?[Yes | No | Maybe]
```

**Output:** `{ buttonTexts: ["Yes", "No", "Maybe"], buttonValues: ["Yes", "No", "Maybe"] }`

### 2. Custom Button Values

```markdown
?[Save Changes//save-action]
?[确定//confirm | 取消//cancel]
```

**Output:** `{ buttonTexts: ["Save Changes"], buttonValues: ["save-action"] }`

### 3. Variable Text Input

```markdown
?[%{{username}}...Enter your name]
?[%{{age}}...How old are you?]
?[%{{comment}}...]
```

**Output:** `{ variableName: "username", placeholder: "Enter your name" }`

### 4. Variable Button Selection

```markdown
?[%{{theme}} Light | Dark]
?[%{{size}} Small//S | Medium//M | Large//L]
```

**Output:** `{ variableName: "theme", buttonTexts: ["Light", "Dark"], buttonValues: ["Light", "Dark"] }`

### 5. Combined: Buttons + Text Input

```markdown
?[%{{size}} Small//S | Medium//M | Large//L | ...custom size]
```

**Output:**

```typescript
{
  variableName: "size",
  buttonTexts: ["Small", "Medium", "Large"],
  buttonValues: ["S", "M", "L"],
  placeholder: "custom size"
}
```

### 6. Unicode & International Support

```markdown
?[%{{语言}} English//en | 中文//zh | 日本語//ja]
?[%{{用户名}}...请输入您的姓名]
?[👍 Good | 👎 Bad | 🤔 Unsure]
```

## 📖 API Reference

### Plugin Exports

```typescript
// Default export (recommended)
import remarkFlow from 'remark-flow';

// Named exports
import {
  remarkFlow, // Main plugin, functionally the same as the default export
  remarkInteraction, // The core plugin, which is also the default export
  remarkCustomVariable, // Variable-focused plugin
  createInteractionParser, // Parser factory
  InteractionType, // Type enums
} from 'remark-flow';
```

### Output Format

All plugins transform `?[...]` syntax into `custom-variable` AST nodes:

```typescript
interface CustomVariableNode extends Node {
  type: 'custom-variable';
  data: {
    variableName?: string; // For %{{name}} syntax
    buttonTexts?: string[]; // Button display text
    buttonValues?: string[]; // Corresponding button values
    placeholder?: string; // Text input placeholder
  };
}
```

### Parser API

```typescript
import { createInteractionParser, InteractionType } from 'remark-flow';

const parser = createInteractionParser();

// Parse content and get detailed result
const result = parser.parse('?[%{{theme}} Light | Dark]');

// Parse and convert to remark-compatible format
const remarkData = parser.parseToRemarkFormat('?[%{{theme}} Light | Dark]');
```


## 🔗 Integration Examples

### With Markdown Flow UI

```typescript
import { MarkdownFlow } from 'markdown-flow-ui';
import { remark } from 'remark';
import remarkFlow from 'remark-flow';

function InteractiveChat() {
  const processor = remark().use(remarkFlow);

  const content = `
  Welcome! Please select your preference:

  ?[%{{language}} JavaScript | Python | TypeScript | Go]

  Click to continue: ?[Let's Go!//start]
  `;

  return (
    <MarkdownFlow
      initialContentList={[{ content }]}
      onSend={data => {
        console.log('User selected:', data.buttonText);
        // Handle user interaction
      }}
    />
  );
}
```

### With Custom Renderer

```typescript
import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

function customRenderer() {
  return (tree: Node) => {
    visit(tree, 'custom-variable', (node: any) => {
      const { variableName, buttonTexts, buttonValues, placeholder } =
        node.data;

      // Transform into your custom components
      if (buttonTexts && buttonTexts.length > 0) {
        // Render as button group
        node.type = 'html';
        node.value = renderButtonGroup(buttonTexts, buttonValues);
      } else if (placeholder) {
        // Render as text input
        node.type = 'html';
        node.value = renderTextInput(variableName, placeholder);
      }
    });
  };
}
```

### With Next.js and MDX

```typescript
// pages/interactive.mdx
import { remarkFlow } from 'remark-flow';

export default function Interactive() {
  return (
    <MDXProvider components={{ 'custom-variable': InteractiveComponent }}>
      # Interactive Content Choose your framework: ?[%{{ framework }} React |
      Vue | Svelte]
    </MDXProvider>
  );
}

// Configure in next.config.js
const withMDX = require('@next/mdx')({
  options: {
    remarkPlugins: [remarkFlow],
  },
});
```

## 🌐 MarkdownFlow Ecosystem

remark-flow is part of the MarkdownFlow ecosystem for creating personalized, AI-driven interactive documents:

- **[markdown-flow](https://github.com/ai-shifu/markdown-flow)** - The main repository containing homepage, documentation, and interactive playground
- **[markdown-flow-agent-py](https://github.com/ai-shifu/markdown-flow-agent-py)** - Python agent for transforming MarkdownFlow documents into personalized content
- **[remark-flow](https://github.com/ai-shifu/remark-flow)** - Remark plugin to parse and process MarkdownFlow syntax in React applications
- **[markdown-flow-ui](https://github.com/ai-shifu/markdown-flow-ui)** - React component library for rendering interactive MarkdownFlow documents

## 💖 Sponsors

<div align="center">
  <a href="https://ai-shifu.com">
    <img src="https://raw.githubusercontent.com/ai-shifu/ai-shifu/main/assets/logo_en.png" alt="AI-Shifu" width="150" />
  </a>
  <p><strong><a href="https://ai-shifu.com">AI-Shifu.com</a></strong></p>
  <p>AI-powered personalized learning platform</p>
</div>

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Remark](https://remark.js.org/) for markdown processing
- [Unified](https://unifiedjs.com/) for the plugin architecture
- [Unist](https://github.com/syntax-tree/unist) for AST utilities
- [TypeScript](https://www.typescriptlang.org/) for type safety
- [Jest](https://jestjs.io/) for testing framework

## 📞 Support

- 📖 [Documentation](https://github.com/ai-shifu/remark-flow#readme)
- 🐛 [Issue Tracker](https://github.com/ai-shifu/remark-flow/issues)
- 💬 [Discussions](https://github.com/ai-shifu/remark-flow/discussions)

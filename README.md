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

## 🔗 Usage Examples

remark-flow can be used in two main ways:

1. **Standalone** - Parse and transform syntax, then render with your own UI components
2. **With markdown-flow-ui** - Use the pre-built React components for instant interactive UI

### 🎯 Standalone Usage (Custom Rendering)

When using remark-flow standalone, you parse the syntax and create your own UI components based on the AST nodes.

#### Basic AST Transformation

```typescript
import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import remarkFlow from 'remark-flow';
import type { Node } from 'unist';

const processor = remark().use(remarkFlow);

const markdown = `
# Choose Your Preferences

Select language: ?[%{{language}} JavaScript | Python | TypeScript | Go]
Enter your name: ?[%{{username}}...Your full name]
Action: ?[Save//save | Cancel//cancel]
`;

// Parse and examine the AST
const ast = processor.parse(markdown);
processor.runSync(ast);

// Find custom-variable nodes
visit(ast, 'custom-variable', (node: any) => {
  console.log('Found interaction:', node.data);
  // Output: { variableName: 'language', buttonTexts: ['JavaScript', 'Python', 'TypeScript', 'Go'], buttonValues: [...] }
});
```

#### Custom HTML Renderer

```typescript
import { visit } from 'unist-util-visit';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

function createCustomRenderer() {
  return (tree: Node) => {
    visit(tree, 'custom-variable', (node: any) => {
      const { variableName, buttonTexts, buttonValues, placeholder } =
        node.data;

      if (buttonTexts && buttonTexts.length > 0) {
        // Render as button group
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
          <div class="button-group" data-variable="${variableName}">
            ${buttonsHtml}
          </div>
        `;
      } else if (placeholder) {
        // Render as text input
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

// Use with remark processor
const processor = remark()
  .use(remarkFlow)
  .use(createCustomRenderer)
  .use(remarkHtml);

const result = processor.processSync(markdown);
console.log(result.toString()); // HTML with custom interactive elements
```

#### React Custom Components

```typescript
import React from 'react';
import { remark } from 'remark';
import remarkReact from 'remark-react';
import remarkFlow from 'remark-flow';

// Custom React components for interactive elements
const InteractiveButton = ({ variableName, buttonTexts, buttonValues, onSelect }) => (
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

// Usage in React component
function CustomMarkdownRenderer() {
  const handleInteraction = (variableName, value) => {
    console.log(`${variableName}: ${value}`);
    // Handle user interaction
  };

  const processor = remark()
    .use(remarkFlow)
    .use(remarkReact, {
      remarkReactComponents: {
        'custom-variable': ({ node }) => {
          const { variableName, buttonTexts, buttonValues, placeholder } = node.data;

          if (buttonTexts?.length > 0) {
            return (
              <InteractiveButton
                variableName={variableName}
                buttonTexts={buttonTexts}
                buttonValues={buttonValues}
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
  # Interactive Form

  Choose language: ?[%{{lang}} English | 中文 | Español]
  Your name: ?[%{{name}}...Enter your name]
  Action: ?[Submit//submit | Reset//reset]
  `;

  return <div>{processor.processSync(content).result}</div>;
}
```

### 🎨 With markdown-flow-ui (Pre-built Components)

For a complete React component library with ready-to-use interactive components, use [markdown-flow-ui](https://github.com/ai-shifu/markdown-flow-ui).

#### Basic Integration

```typescript
import { MarkdownFlow } from 'markdown-flow-ui';

function InteractiveChat() {
  const content = `
  # Welcome! 👋

  Select your preference: ?[%{{language}} JavaScript | Python | TypeScript]
  Enter your name: ?[%{{username}}...Your full name]
  Ready to start: ?[Let's Go!//start]
  `;

  return (
    <MarkdownFlow
      initialContentList={[{ content }]}
      onSend={(data) => {
        console.log('User interaction:', data);
        // Handle user interactions
      }}
      typingSpeed={30}
    />
  );
}
```

**For advanced examples with streaming, multi-step forms, and more features, see:**

- 📖 [markdown-flow-ui Documentation](https://github.com/ai-shifu/markdown-flow-ui#readme)

### 📊 Comparison: Standalone vs markdown-flow-ui

| Aspect                | Standalone Usage                   | With markdown-flow-ui                  |
| --------------------- | ---------------------------------- | -------------------------------------- |
| **Setup Complexity**  | Medium - Need custom rendering     | Low - Pre-built components             |
| **Customization**     | High - Full control over UI        | Medium - Theme/style customization     |
| **Bundle Size**       | Smaller - Only remark plugin       | Larger - Full React component library  |
| **Framework Support** | Any (React, Vue, vanilla JS, etc.) | React only                             |
| **Advanced Features** | Manual implementation needed       | Built-in (streaming, typewriter, etc.) |
| **Use Case**          | Custom UI requirements, non-React  | Rapid prototyping, React projects      |

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

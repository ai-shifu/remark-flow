<div align="center">
  <h1>Remark Flow</h1>
  <p><strong>Transform markdown into interactive conversational experiences</strong></p>

English | [简体中文](README_ZH-CN.md)

[![npm version](https://badge.fury.io/js/remark-flow.svg)](https://badge.fury.io/js/remark-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

</div>

**Remark Flow** is a powerful remark plugin that transforms custom `?[...]` syntax in Markdown into interactive elements. It's designed to convert button and variable input syntax into structured data that can be used to create interactive components in applications.

## 🤝 Part of the AI-Shifu Ecosystem

Remark Flow serves as the markdown parsing foundation for the [AI-Shifu](https://github.com/ai-shifu/ai-shifu) conversational AI platform and powers the interactive syntax used in [Markdown Flow UI](https://github.com/ai-shifu/markdown-flow-ui). While this library can be used standalone, it was specifically designed to enable personalized, interactive experiences in AI-driven applications.

**🌟 See it in action:** Visit [AI-Shifu.com](https://ai-shifu.com) to experience the library in a real-world educational platform.

## ✨ Why Choose Remark Flow?

Unlike standard markdown parsers, Remark Flow is specifically built for **interactive conversational content**:

- 🎯 **Button Syntax** - `?[Button Text]` → interactive button data
- 🔧 **Variable Inputs** - `?[%{{name}} options]` → form field data
- 🎨 **Custom Values** - `?[Display//value]` → separate display/value pairs
- 🌍 **Unicode Support** - Works seamlessly with Chinese and other languages
- 🔄 **Multiple Patterns** - Support for complex interaction patterns
- 🏗️ **AST Integration** - Clean integration with remark/unified ecosystem

## 🚀 Quick Start

### Install

```bash
npm install remark-flow
```

### Basic Usage

```javascript
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

```javascript
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

## 🏗️ Architecture

Remark Flow follows a modular, layered architecture:

```
src/
├── index.ts                   # Main entry point and exports
├── remark-flow.ts             # Primary plugin implementation
├── remark-interaction.ts      # Default export plugin (recommended)
├── remark-custom-variable.ts  # Variable-focused plugin
└── interaction-parser.ts      # Core parsing engine with 3-layer architecture
```

### Core Components

- **Main Plugin (`remark-interaction.ts`)**: The default export plugin that handles all `?[...]` transformations
- **Layered Parser (`interaction-parser.ts`)**: Three-layer parsing system for robust syntax analysis
- **Variable Handler (`remark-custom-variable.ts`)**: Specialized processor for variable syntax patterns
- **Flow Plugin (`remark-flow.ts`)**: Unified plugin combining all features

### Three-Layer Parsing Architecture

The parser uses a sophisticated three-layer approach:

1. **Layer 1: Format Validation** - Validates `?[...]` pattern and excludes markdown links
2. **Layer 2: Variable Detection** - Identifies `%{{variable}}` patterns and classifies content
3. **Layer 3: Content Parsing** - Handles specific syntax patterns and edge cases

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

## 🎯 Use Cases

**Perfect for:**

- ✅ Interactive documentation and tutorials
- ✅ Conversational AI interfaces (like ChatGPT)
- ✅ Educational content with user input
- ✅ Survey and form generation from markdown
- ✅ Interactive storytelling applications
- ✅ Dynamic content personalization

**Not ideal for:**

- ❌ Static blog content without interaction
- ❌ Simple documentation sites
- ❌ Non-interactive markdown processing

## 🛠 Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Setup

```bash
git clone https://github.com/ai-shifu/remark-flow.git
cd remark-flow
npm install

# Run tests
npm test

# Build TypeScript
npm run build

# Lint and format
npm run lint:fix
npm run format
```

### Scripts

| Script                  | Description                 |
| ----------------------- | --------------------------- |
| `npm test`              | Run test suite with Jest    |
| `npm run test:coverage` | Generate coverage reports   |
| `npm run test:watch`    | Run tests in watch mode     |
| `npm run build`         | Compile TypeScript to dist/ |
| `npm run lint`          | ESLint code quality checks  |
| `npm run lint:fix`      | Auto-fix linting issues     |
| `npm run format`        | Format code with Prettier   |

### Testing

Comprehensive test coverage includes:

- ✅ **Unit tests** for all syntax patterns
- ✅ **Integration tests** with remark processor
- ✅ **Unicode support** testing with Chinese text
- ✅ **Edge cases** and error handling
- ✅ **Performance tests** for large content
- ✅ **Regression tests** for existing functionality

## 🔗 Integration Examples

### With Markdown Flow UI

```jsx
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

```jsx
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

## 🌟 Integration with AI-Shifu Ecosystem

Remark Flow is actively used across the AI-Shifu ecosystem:

### AI-Shifu Platform

```bash
# Experience the library in action
git clone https://github.com/ai-shifu/ai-shifu.git
cd ai-shifu/docker
cp .env.example.minimal .env
# Configure your .env file
docker compose up -d
# Visit http://localhost:8080
```

### Markdown Flow UI

```bash
# See the UI components that consume this parser
git clone https://github.com/ai-shifu/markdown-flow-ui.git
cd markdown-flow-ui
pnpm install
pnpm storybook
# Visit http://localhost:6006
```

## 🔧 Configuration & Customization

### Error Handling

Remark Flow is designed for **graceful degradation**:

```javascript
// Invalid syntax is preserved, never crashes processing
const result = processor.processSync(`
  Regular markdown content
  ?[incomplete syntax
  More content continues normally
`);
```

### Performance Optimization

- ✅ **Pre-compiled regex patterns** for optimal performance
- ✅ **Single AST traversal** minimizes processing overhead
- ✅ **Memory efficient** parsing with minimal allocations
- ✅ **Lazy evaluation** for better performance on large documents

### Custom Separators

Supports multiple separator styles for international users:

```markdown
?[Option1 | Option2 | Option3] # Standard pipe
?[Option1 ｜ Option2 ｜ Option3] # Full-width pipe (Chinese input)
?[Buttons | More | ...text input] # Ellipsis separator
```

## 🔍 Troubleshooting

### Common Issues

| Issue                           | Solution                                           |
| ------------------------------- | -------------------------------------------------- |
| Plugin not transforming content | Ensure `?[...]` syntax is exact, not `?[...](url)` |
| Unicode characters not working  | Check regex patterns support Unicode ranges        |
| Performance issues              | Use pre-compiled patterns, avoid nested processing |
| Custom values not parsing       | Ensure `//` separator format: `Display//value`     |

### Debug Mode

```javascript
import { createInteractionParser } from 'remark-flow';

const parser = createInteractionParser();
const result = parser.parse('?[test content]');

if (result.error) {
  console.error('Parse error:', result.error);
} else {
  console.log('Parse result:', result);
}
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Remark](https://remark.js.org/) for the powerful markdown processing ecosystem
- [Unified](https://unifiedjs.com/) for the excellent plugin architecture
- [Unist](https://github.com/syntax-tree/unist) for AST utilities
- [TypeScript](https://www.typescriptlang.org/) for type safety
- [Jest](https://jestjs.io/) for comprehensive testing

## 📞 Support

- 📖 [Documentation](https://github.com/ai-shifu/remark-flow#readme)
- 🐛 [Issue Tracker](https://github.com/ai-shifu/remark-flow/issues)
- 💬 [Discussions](https://github.com/ai-shifu/remark-flow/discussions)
- 🌟 [AI-Shifu Platform](https://ai-shifu.com)

---

<div align="center">

Made with ❤️ for the interactive content community

**[Star us on GitHub](https://github.com/ai-shifu/remark-flow) • [Try AI-Shifu](https://ai-shifu.com) • [View Examples](https://github.com/ai-shifu/markdown-flow-ui)**

</div>

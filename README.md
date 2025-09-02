# remark-flow

[![npm version](https://badge.fury.io/js/remark-flow.svg)](https://badge.fury.io/js/remark-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**A remark plugin that transforms `?[...]` syntax in Markdown into interactive elements.**

Converts button and variable input syntax into structured data that can be used to create interactive components in your applications.

## Key Features

- 🎯 **Button syntax**: `?[Button Text]` → interactive button data
- 🔧 **Variable inputs**: `?[%{{name}} options]` → form field data
- 🎨 **Custom values**: `?[Display//value]` → separate display/value pairs
- 🌍 **Unicode support**: Works with Chinese and other languages

## Installation

```bash
npm install remark-flow
```

## Quick Start

```javascript
import { remark } from 'remark'
import remarkInteraction from 'remark-flow'

const processor = remark().use(remarkInteraction)

const result = processor.processSync('Click: ?[Submit//save]')
// Transforms into: { buttonTexts: ["Submit"], buttonValues: ["save"] }
```

## Usage Examples

### Simple Buttons

```markdown
?[Submit]
```
**Output:** `{ buttonTexts: ["Submit"], buttonValues: ["Submit"] }`

### Custom Button Values

```markdown
?[Save Changes//save-action]
```
**Output:** `{ buttonTexts: ["Save Changes"], buttonValues: ["save-action"] }`

### Multiple Choice Buttons

```markdown
?[Yes | No | Maybe]
```
**Output:** `{ buttonTexts: ["Yes", "No", "Maybe"], buttonValues: ["Yes", "No", "Maybe"] }`

### Variable Text Input

```markdown
?[%{{username}}...Enter your name]
```
**Output:** `{ variableName: "username", placeholder: "Enter your name" }`

### Variable with Button Options

```markdown
?[%{{theme}} Light | Dark]
```
**Output:** `{ variableName: "theme", buttonTexts: ["Light", "Dark"], buttonValues: ["Light", "Dark"] }`

### Combined: Buttons + Text Input

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

## Real-World Example

```javascript
const markdown = `
Please select your preference:
Theme: ?[%{{theme}} Light//light | Dark//dark | ...other]
Action: ?[Save//save | Cancel//cancel]
`

// Each ?[...] becomes a structured object that you can use to:
// - Render UI components (buttons, dropdowns, inputs)
// - Collect user responses
// - Build interactive forms
```

## API Reference

### Default Export (Recommended)

```javascript
import remarkInteraction from 'remark-flow'
```

Processes all `?[...]` syntax and outputs consistent `custom-variable` elements.

### Output Format

All transformations use this unified format:

```typescript
interface RemarkCompatibleResult {
  variableName?: string      // For variable syntax: %{{name}}
  buttonTexts?: string[]     // Button display text
  buttonValues?: string[]    // Corresponding button values
  placeholder?: string       // Text input placeholder
}
```

## Development

```bash
npm test          # Run tests
npm run build     # Build TypeScript
npm run test:coverage  # Coverage report
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## License

MIT © [remark-flow contributors](LICENSE)

---

**Links:** [Issues](https://github.com/ai-shifu/remark-flow/issues) • [Discussions](https://github.com/ai-shifu/remark-flow/discussions)

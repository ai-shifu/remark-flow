# Remark Flow

**A remark plugin library for parsing [MarkdownFlow](https://markdownflow.ai) documents**

[MarkdownFlow](https://markdownflow.ai) (also known as MDFlow or markdown-flow) extends standard Markdown with AI to create personalized, interactive pages. Its tagline is **"Write Once, Deliver Personally"**.

<div align="center">

[![npm version](https://badge.fury.io/js/remark-flow.svg)](https://badge.fury.io/js/remark-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

English | [Simplified Chinese](README_ZH-CN.md)

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

Choose one option: ?[Option A | Option B | Option C]
Choose multiple skills: ?[{{skills}} JavaScript||TypeScript||Python]
Enter your name: ?[{{username}}...Please enter your name]
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
Select theme: ?[{{theme}} Light//light | Dark//dark | ...custom]
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

**Output:** `{ buttonTexts: ["Yes", "No", "Maybe"], buttonValues: ["Yes", "No", "Maybe"], isMultiSelect: false }`

Buttons without a variable also support multi-select (`||`) and the `...` text-input suffix:

```markdown
?[JavaScript||TypeScript||Python]
?[...Anything to add?]
?[Option A | Option B | ...Other, please specify]
```

**Output:** `{ buttonTexts: [...], buttonValues: [...], isMultiSelect: true }`, `{ placeholder: "Anything to add?" }`, and `{ buttonTexts: [...], buttonValues: [...], placeholder: "Other, please specify", isMultiSelect: false }` respectively. `variableName` stays `undefined` — the answer is not assigned to a variable and should be fed back into the conversation context by the host.

### 2. Custom Button Values

```markdown
?[Save Changes//save-action]
?[Confirm//confirm | Cancel//cancel]
```

**Output:** `{ buttonTexts: ["Save Changes"], buttonValues: ["save-action"] }`

### 3. Variable Text Input

A leading `{{name}}` inside `?[...]` binds the answer to that variable.

```markdown
?[{{username}}...Enter your name]
?[{{age}}...How old are you?]
?[{{comment}}...]
```

**Output:** `{ variableName: "username", placeholder: "Enter your name" }`

### 4. Variable Button Selection (Single-Select)

```markdown
?[{{theme}} Light | Dark]
?[{{size}} Small//S | Medium//M | Large//L]
```

**Output:** `{ variableName: "theme", buttonTexts: ["Light", "Dark"], buttonValues: ["Light", "Dark"], isMultiSelect: false }`

### 5. Variable Button Selection (Multi-Select)

```markdown
?[{{skills}} JavaScript||TypeScript||Python]
?[{{lang}} JS//JavaScript||TS//TypeScript||PY//Python]
```

**Output:** `{ variableName: "skills", buttonTexts: ["JavaScript", "TypeScript", "Python"], buttonValues: ["JavaScript", "TypeScript", "Python"], isMultiSelect: true }`

### 6. Combined: Buttons + Text Input

```markdown
# Single-select with text input

?[{{size}} Small//S | Medium//M | Large//L | ...custom size]

# Multi-select with text input

?[{{tags}} React||Vue||Angular||...Other framework]
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

### 7. Separator Priority Rules

The first separator type encountered determines the parsing mode:

```markdown
# Single-select mode (| appears first)

?[{{option}} A | B||C] # Results in: ["A", "B||C"]

# Multi-select mode (|| appears first)

?[{{option}} A||B | C] # Results in: ["A", "B | C"]
```

**Key Points:**

- `|` = Single-select mode, `||` becomes part of button values
- `||` = Multi-select mode, `|` becomes part of button values
- First separator type wins and determines the entire parsing behavior

### 8. Unicode & International Support

```markdown
?[{{language}} English//en | Spanish//es | French//fr]
?[{{café preference}}...How do you like your coffee?]
?[👍 Good | 👎 Bad | 🤔 Unsure]
```

### Variable names

Variable names are opaque Unicode text after trimming the established Python whitespace set
at both ends. Internal ordinary spaces, punctuation, emoji, single braces, `[` and `]`, `|`,
`//`, and `...` are kept exactly as written. Names must be nonempty and cannot contain Unicode
Cc control characters, U+2028, U+2029, or the literal marker terminator `}}`.

The first literal `}}` closes a marker. Backslashes and quotes are ordinary characters: there
is no extra escaping, decoding, case folding or Unicode normalization. Every `{{...}}`
is read as one unit before the interaction's `]`, option separators or Markdown can
see its body. A leading `{{...}}` after Python whitespace padding assigns a variable;
markers in option content retain their exact literal source. An unclosed marker owns the
remaining tail, so a `?[...]` inside it cannot become an independent interaction.
For example, `?[{{theme}} Light | Dark]` binds the answer to `theme`.
Outside interactions, `{{theme}}` remains a variable reference.
The padding set includes U+0085 and U+001C–001F; U+FEFF is retained as part of a name.

`escapeInteractionText(text)` escapes interaction operators outside variable markers and preserves
marker source exactly. It does not close or escape an unmatched `{{`: that sequence still owns
the remaining tail, so arbitrary text containing it cannot be embedded as a literal option with
this helper. No additional brace-escaping syntax is introduced.

```markdown
What is your gender?
?[{{What is your gender?}} Male | Female | Prefer not to say]
```

The variable name is the answer's storage key; it does not add a visible question heading.
Hosts can reuse the same grammar instead of maintaining their own identifier regex:

```typescript
import {
  createVariableExpressionRegex,
  extractVariableNames,
  findDocumentVariableMarkers,
  findVariableMarkers,
  formatVariableReference,
  isValidVariableName,
  normalizeVariableName,
  readVariableMarker,
  VARIABLE_NAME_SOURCE,
  VARIABLE_REFERENCE_SOURCE,
} from 'remark-flow';

extractVariableNames(
  '?[{{What is your gender?}} Male | Female] {{What is your gender?}}'
); // ['What is your gender?']
findDocumentVariableMarkers('Show `{{` then {{ q }}').map(
  marker => marker.name
); // [null, 'q']
normalizeVariableName(' What is your gender? '); // 'What is your gender?'
isValidVariableName('has space'); // true
createVariableExpressionRegex('gu'); // A fresh matcher; capture 1 is the trimmed name.
formatVariableReference('question}'); // '{{ question} }}'
```

`extractVariableNames` scans the supplied source in order, including code fences and comments,
and returns each name once. It does not change the host's policy for which source to inspect.
Complete markers inside code, HTML, math, angle URI/email links, or link-resource examples are still collected, while incomplete examples stay
inside their closing literal boundary and cannot hide a later variable. This includes fence info
strings, quote/list-contained fences, indented code that starts a block, reference-definition
destinations and titles (including native container and lazy continuations), ordinary HTML blocks
ending at a blank line or container boundary, and raw `script`, `style`, `pre`, or `textarea` blocks.
Comments, processing instructions, declarations, and CDATA retain the whole physical closing line. Physical lines use
LF, CRLF, or CR; other Unicode separators do not create Markdown line boundaries.
Document interaction candidates stop at a blank line or native paragraph interruption outside an opaque marker. The raw
interaction reader keeps its context-free behavior.
Markdown-escaped opening
braces do not start a document marker. The raw readers below do not interpret Markdown context.
Use `findDocumentVariableMarkers(text)` when editors or document readers need marker ranges.
It returns `{ start, end, rawName, name }` in source order, with original UTF-16 offsets suitable
for `text.slice(start, end)`. It retains duplicates and invalid markers. Unclosed markers have
`name: null` and end at their literal boundary, or at document EOF when outside a literal span.
`extractVariableNames` uses these same ranges and returns only unique, non-null names.

Use `findVariableMarkers` for raw token scanning: each raw marker is read only once, so a
`{{` inside its body does not open another variable. `readVariableMarker(text, start)` reads
only the marker at that position; both return `{ start, end, rawName, name }`, with `name: null`
for invalid bodies. The existing regex factory and source constants match valid markers and
keep capture 1 normalized; they are suitable for validating a complete token, while the scanner
also claims invalid outer markers so their contents cannot become nested variables.
Use `trimVariablePadding` for the shared linear-time edge trim; it preserves U+FEFF and long
internal whitespace runs. Anchor regex sources when validating a complete token; Markdown document
scanning uses the document reader rather than restarting a regex inside malformed input.
Inline code openings cannot pair across a blank paragraph or a code-fence line. If a real marker
starts after an unmatched opening, its body still stays opaque through the first literal `}}`.

The formatter returns `null` for invalid names and always adds padding. That padding is needed
when a name ends with a single `}`: `{{ question} }}` preserves `question}`, whereas
`{{question}}}` closes earlier and names `question`.

Tokenized trees preserve raw NUL provenance, so `parse` followed by `runSync` rejects invalid
NUL-containing names even without passing the source again. Literal U+FFFD remains a valid key
character. Token serialization also removes block quote and list prefixes from multiline markers.
Block-looking text inside a multiline marker remains part of its name; a real enclosing code
fence still keeps its contents literal. ATX and Setext headings retain their heading level, and
surrounding prose retains its paragraph boundaries. Marker-looking text inside inline code, HTML,
math, or link resources stays in that Markdown context.
An external tree that already lost the distinction between NUL and U+FFFD cannot recover it.

### Legacy compatibility

The legacy `?[%{{name}} ...]` form remains accepted for existing content during the transition.
Use `?[{{name}} ...]` for new content. Existing `formatVariableAssignment` and
`VARIABLE_ASSIGNMENT_SOURCE` APIs retain their percent-prefixed output and matching behavior.

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
    variableName?: string; // Named answer key from a leading {{name}} binding
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
const result = parser.parse('?[{{theme}} Light | Dark]');

// Parse and convert to remark-compatible format
const remarkData = parser.parseToRemarkFormat('?[{{theme}} Light | Dark]');
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

Select language: ?[{{language}} JavaScript | Python | TypeScript | Go]
Enter your name: ?[{{username}}...Your full name]
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

  Choose language: ?[{{lang}} English | Spanish | French]
  Your name: ?[{{name}}...Enter your name]
  Action: ?[Submit//submit | Reset//reset]
  `;

  return <div>{processor.processSync(content).result}</div>;
}
```

### 🎨 With markdown-flow-ui (Pre-built Components)

For a complete React component library with ready-to-use interactive components, use [markdown-flow-ui](https://github.com/ai-shifu/markdown-flow-ui).

These examples require a UI release that bundles remark-flow 1.4.2 or later. Installing a newer
remark-flow separately does not replace an older UI package's bundled parser.

#### Basic Integration

```typescript
import { MarkdownFlow } from 'markdown-flow-ui';

function InteractiveChat() {
  const content = `
  # Welcome! 👋

  Select your preference: ?[{{language}} JavaScript | Python | TypeScript]
  Enter your name: ?[{{username}}...Your full name]
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

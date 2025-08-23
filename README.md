# remark-flow

A remark plugin that transforms custom button and variable syntax into HTML elements.

## Installation

```bash
npm install remark-flow
```

## Usage

```javascript
import { remark } from 'remark'
import remarkFlow from 'remark-flow'

const processor = remark().use(remarkFlow)

const result = processor.processSync(`
Click here: ?[Submit]
Choose color: ?[%{{color}} red | blue | green | ... custom]
`)
```

## Syntax

### Button Syntax
Transform simple button syntax into custom button elements:

```
?[Button Text] → <custom-button buttonText="Button Text" />
```

**Examples:**
```
?[Submit] → <custom-button buttonText="Submit" />
?[Save Changes] → <custom-button buttonText="Save Changes" />
```

### Variable Syntax
Transform complex variable syntax with buttons and placeholders:

```
?[%{{variable}} options] → <custom-variable variableName="variable" ... />
```

**Formats:**

1. **Buttons with placeholder:**
   ```
   ?[%{{color}} red | blue | ... custom]
   ```
   → `<custom-variable variableName="color" buttonTexts="['red','blue']" placeholder="custom" />`

2. **Buttons only:**
   ```
   ?[%{{size}} small | medium | large]
   ```
   → `<custom-variable variableName="size" buttonTexts="['small','medium','large']" />`

3. **Single button:**
   ```
   ?[%{{action}} submit]
   ```
   → `<custom-variable variableName="action" buttonTexts="['submit']" />`

4. **Placeholder only:**
   ```
   ?[%{{name}} ... enter your name]
   ```
   → `<custom-variable variableName="name" placeholder="enter your name" />`

**Separators:** Both `|` (English) and `｜` (Chinese) are supported.

## API

### Default Export
```javascript
import remarkFlow from 'remark-flow'
```
The main plugin that combines both button and variable transformations. Variables are processed first, then buttons.

### Named Exports
```javascript
import { remarkCustomButton, remarkCustomVariable } from 'remark-flow'
```
Individual plugins for specific use cases.

## Examples

```javascript
// Input
const markdown = `
Actions: ?[Save] or ?[Cancel]
Select: ?[%{{theme}} light | dark | ... custom theme]
`

// Output (conceptual HTML)
`
Actions: <custom-button buttonText="Save" /> or <custom-button buttonText="Cancel" />
Select: <custom-variable variableName="theme" buttonTexts="['light','dark']" placeholder="custom theme" />
`
```

## License

ISC
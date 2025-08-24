# remark-flow

A remark plugin that transforms custom button and variable syntax into HTML elements with support for custom values.

## Installation

```bash
npm install remark-flow
```

## Usage

```javascript
import { remark } from 'remark'
import remarkInteraction from 'remark-flow'

const processor = remark().use(remarkInteraction)

const result = processor.processSync(`
Click here: ?[Submit//save-action]
Choose color: ?[%{{color}} Red//r | Blue//b | Green//g | ...custom color]
`)
```

## Syntax

### Button Syntax (Non-assignment)
Transform simple button syntax into custom variable elements:

```
?[Button Text] → <custom-variable buttonTexts=["Button Text"] buttonValues=["Button Text"] />
?[Display//value] → <custom-variable buttonTexts=["Display"] buttonValues=["value"] />
?[Btn1 | Btn2 | Btn3] → <custom-variable buttonTexts=["Btn1", "Btn2", "Btn3"] buttonValues=["Btn1", "Btn2", "Btn3"] />
```

**Examples:**
```
?[Submit] → { buttonTexts: ["Submit"], buttonValues: ["Submit"] }
?[Save Changes//save] → { buttonTexts: ["Save Changes"], buttonValues: ["save"] }
?[Save | Cancel | Delete//del] → { buttonTexts: ["Save", "Cancel", "Delete"], buttonValues: ["Save", "Cancel", "del"] }
```

### Variable Syntax (Assignment)
Transform complex variable syntax with buttons and placeholders:

```
?[%{{variable}} options] → <custom-variable variableName="variable" ... />
```

**Variable names:** Support JavaScript identifier rules - letters (including Chinese), numbers, and underscores (`a-zA-Z0-9_\u4e00-\u9fa5`). Must start with letter, underscore, or Chinese character.

**Formats:**

1. **Pure text input:**
   ```
   ?[%{{name}}...enter your name]
   ```
   → `{ variableName: "name", placeholder: "enter your name" }`

2. **Buttons only:**
   ```
   ?[%{{color}} red | blue | green]
   ```
   → `{ variableName: "color", buttonTexts: ["red","blue","green"], buttonValues: ["red","blue","green"] }`

3. **Buttons with custom values:**
   ```
   ?[%{{color}} Red//r | Blue//b | Green//g]
   ```
   → `{ variableName: "color", buttonTexts: ["Red","Blue","Green"], buttonValues: ["r","b","g"] }`

4. **Buttons with text input:**
   ```
   ?[%{{color}} red | blue | green | ...custom color]
   ```
   → `{ variableName: "color", buttonTexts: ["red","blue","green"], buttonValues: ["red","blue","green"], placeholder: "custom color" }`

5. **Single button:**
   ```
   ?[%{{action}} submit]
   ```
   → `{ variableName: "action", buttonTexts: ["submit"], buttonValues: ["submit"] }`

**Separators:** Both `|` (English) and `｜` (Chinese) are supported.

**Button Value Format:** Use `Display//value` to specify different display text and actual value.

## Processing Order

The plugin processes syntax in this order:
1. **Variable syntax** (`?[%{{var}} ...]`) - handled by `remarkCustomVariable`
2. **Button syntax** (`?[button]`) - handled by `remarkCustomButton`

This means variables take precedence over simple buttons in the same text.

## API

### Default Export (Recommended)
```javascript
import remarkInteraction from 'remark-flow'
```
The unified plugin that handles all `?[]` syntax in a single pass with consistent output format.

### Legacy Exports
```javascript
import { remarkCustomVariable, remarkFlow, remarkInteraction } from 'remark-flow'
```
Individual plugins for specific use cases or backward compatibility.

## Output Properties

**All elements now use the unified `custom-variable` format:**

```javascript
{
  variableName?: string,      // Variable name (only for custom-variable)
  buttonTexts?: string[],     // Button display texts (always present when has buttons)
  buttonValues?: string[],    // Button values (always present when has buttons)
  placeholder?: string        // Placeholder text (only when has text input)
}
```

## Examples

```javascript
// Input
const markdown = `
Actions: ?[Save//save-doc] or ?[Cancel//cancel-action]
Theme: ?[%{{theme}} Light//light | Dark//dark | ...custom theme name]
Name: ?[%{{user_name}}...enter your full name]
Color: ?[%{{颜色}} 红色//red | 蓝色//blue | 绿色//green]
`

// Output properties:
// Button 1: { buttonTexts: ["Save"], buttonValues: ["save-doc"] }
// Button 2: { buttonTexts: ["Cancel"], buttonValues: ["cancel-action"] }
// Variable: { 
//   variableName: "theme", 
//   buttonTexts: ["Light", "Dark"], 
//   buttonValues: ["light", "dark"],
//   placeholder: "custom theme name"
// }
// Variable: { variableName: "user_name", placeholder: "enter your full name" }
// Variable: { 
//   variableName: "颜色", 
//   buttonTexts: ["红色", "蓝色", "绿色"], 
//   buttonValues: ["red", "blue", "green"]
// }
```

## License

ISC
# AGENTS.md

This file provides guidance to all Coding Agents such as Claude Code (claude.ai/code), Codex, and other AI assistants when working with code in this repository.

## Quick Start

### Most Common Development Tasks

| Priority | Task               | Command                 | When to Use                          |
| -------- | ------------------ | ----------------------- | ------------------------------------ |
| **1**    | Run tests          | `npm test`              | Before/after any changes (MANDATORY) |
| **2**    | Build TypeScript   | `npm run build`         | Verify compilation works             |
| **3**    | Fix linting issues | `npm run lint:fix`      | Before commits                       |
| **4**    | Format code        | `npm run format`        | Before commits                       |
| **5**    | Test with coverage | `npm run test:coverage` | Check test completeness              |
| **6**    | Watch mode testing | `npm run test:watch`    | During active development            |
| **7**    | Lint check only    | `npm run lint`          | CI/validation                        |
| **8**    | Format check only  | `npm run format:check`  | CI/validation                        |

### Development Environment Setup

```bash
# Clone and setup (first time only)
git clone https://github.com/ai-shifu/remark-flow.git
cd remark-flow
npm install

# Verify setup
npm test              # Must pass all tests
npm run build         # Must compile successfully

# Start development workflow
npm run test:watch    # Run tests in watch mode (recommended)
```

### Essential File Structure

```
src/
├── index.ts                    # Main exports and default plugin
├── remark-flow.ts             # Primary plugin implementation
├── remark-interaction.ts      # Alternative interaction plugin (default export)
├── remark-custom-variable.ts  # Variable-focused plugin
└── interaction-parser.ts      # Core parsing engine (most complex)

tests/                         # Comprehensive test suite
├── index.test.ts             # Main integration tests
├── remark-flow.test.ts       # Flow plugin tests
├── remark-interaction.test.ts # Interaction plugin tests
├── parser-demo.test.ts       # Parser demonstration tests
├── chinese-variable-names.test.ts # Unicode support tests
├── button-values-fallback.test.ts # Edge case tests
└── remark-custom-variable.test.ts # Variable plugin tests
```

## Critical Warnings ⚠️

### MUST DO Before Any Commit

1. **Run pre-commit hooks**: Husky automatically runs these, but manually: `npm run lint-staged`
2. **Ensure all tests pass**: `npm test` (MANDATORY)
3. **Verify TypeScript compilation**: `npm run build` (MANDATORY)
4. **Fix linting issues**: `npm run lint:fix`
5. **Format code**: `npm run format`
6. **Follow Conventional Commits**: `type: description` (lowercase type, imperative mood)

### Common Pitfalls to Avoid

- **Don't skip TypeScript compilation** - The build must succeed
- **Don't ignore test failures** - All tests must pass before commit
- **Don't bypass linting rules** - Fix lint warnings, don't suppress them
- **Don't hardcode magic numbers** - Use named constants for parsing rules
- **Don't break backward compatibility** - This is a published npm package
- **Don't commit without testing real-world markdown** - Test with actual remark integration

## Project Overview

**remark-flow** is a remark plugin that transforms custom `?[...]` syntax in Markdown into interactive elements. It's designed to convert button and variable input syntax into structured data that can be used to create interactive components in applications.

### Key Features

- **Button syntax**: `?[Button Text]` → interactive button data
- **Variable inputs**: `?[%{{name}} options]` → form field data
- **Custom values**: `?[Display//value]` → separate display/value pairs
- **Unicode support**: Works with Chinese and other languages
- **Multiple choice**: `?[Yes | No | Maybe]` → multiple button options
- **Combined syntax**: Variables with button options and text input

## Architecture

The project follows a modular TypeScript architecture:

```
src/
├── index.ts                    # Main entry point and default export
├── remark-flow.ts             # Primary plugin implementation
├── remark-interaction.ts      # Alternative interaction syntax handler
├── remark-custom-variable.ts  # Custom variable syntax processor
└── interaction-parser.ts      # Core parsing logic for ?[...] syntax
```

### Core Components

- **Main Plugin (`remark-flow.ts`)**: The default export plugin that handles all `?[...]` transformations
- **Parser (`interaction-parser.ts`)**: Core logic for parsing various syntax patterns
- **Variable Handler (`remark-custom-variable.ts`)**: Processes variable syntax like `%{{name}}`
- **Interaction Handler (`remark-interaction.ts`)**: Alternative syntax processor
- **Index (`index.ts`)**: Exports and type definitions

## Development Commands

### TypeScript Build Process

```bash
# Clean and rebuild
npm run build

# The build process:
# 1. Cleans previous build: tsc --build --clean
# 2. Compiles TypeScript: tsc --build
# 3. Outputs to dist/ directory
# 4. Generates .d.ts type definitions
```

### Comprehensive Testing Strategy

#### Test Categories and Requirements

1. **Unit Tests** (`tests/*.test.ts`)

   ```bash
   npm test                    # Run all tests
   npm run test:watch         # Watch mode for active development
   npm run test:coverage      # Generate coverage report (must be >80%)
   ```

2. **Required Test Scenarios**
   - ✅ **Basic functionality**: All syntax patterns work correctly
   - ✅ **Unicode support**: Chinese text, emoji, special characters
   - ✅ **Edge cases**: Empty content, malformed syntax, boundary conditions
   - ✅ **Error handling**: Graceful degradation when parsing fails
   - ✅ **Integration**: Works with actual remark processor
   - ✅ **Performance**: Handles large markdown files efficiently
   - ✅ **Regression**: Existing functionality preserved after changes

#### Test File Structure and Naming

```
tests/
├── index.test.ts                      # Integration tests for main exports
├── remark-flow.test.ts               # Primary plugin functionality
├── remark-interaction.test.ts        # Alternative plugin tests
├── remark-custom-variable.test.ts    # Variable-specific functionality
├── parser-demo.test.ts               # Parser demonstration and examples
├── chinese-variable-names.test.ts    # Unicode and i18n support
└── button-values-fallback.test.ts    # Edge cases and error scenarios
```

#### Mandatory Test Patterns

```typescript
describe('syntax pattern group', () => {
  const processor = remark().use(remarkFlow);

  test('handles basic case correctly', () => {
    const input = 'Test: ?[Button]';
    const result = processor.processSync(input);

    // MUST test actual AST structure, not just string output
    const ast = processor.parse(input);
    processor.runSync(ast);

    expect(/* find custom-variable node */).toMatchObject({
      type: 'custom-variable',
      data: {
        buttonTexts: ['Button'],
        buttonValues: ['Button'],
      },
    });
  });

  test('handles unicode content', () => {
    const input = '选择: ?[%{{主题}} 浅色//light | 深色//dark]';
    // Test Chinese variable names and content
  });

  test('gracefully handles malformed syntax', () => {
    const input = '?[incomplete';
    const result = processor.processSync(input);

    // MUST NOT throw errors
    // MUST provide fallback behavior
    expect(() => result).not.toThrow();
  });

  test('preserves original behavior for non-matching content', () => {
    const input = 'Regular markdown content';
    const result = processor.processSync(input);

    // MUST NOT modify content that doesn't match patterns
    expect(result.toString()).toBe(input);
  });
});
```

#### Coverage Requirements by File

| File                        | Minimum Coverage | Critical Functions    |
| --------------------------- | ---------------- | --------------------- |
| `interaction-parser.ts`     | **95%**          | All parsing logic     |
| `remark-flow.ts`            | **90%**          | Plugin implementation |
| `remark-interaction.ts`     | **90%**          | Alternative plugin    |
| `remark-custom-variable.ts` | **85%**          | Variable handling     |
| `index.ts`                  | **100%**         | Exports (simple)      |

#### Test Data Standards

```typescript
// Use realistic, varied test data
const TEST_CASES = {
  // Basic functionality
  simple: '?[Submit]',
  multiple: '?[Yes | No | Cancel]',
  customValues: '?[Save Changes//save | Discard//discard]',

  // Variable assignments
  textInput: '?[%{{username}}...Enter your name]',
  buttonSelect: '?[%{{theme}} Light | Dark]',
  combined: '?[%{{size}} Small//S | Medium//M | ...custom]',

  // Unicode and i18n
  chinese: '?[%{{用户名}}...请输入姓名]',
  emoji: '?[👍 Good | 👎 Bad | 🤔 Unsure]',
  mixed: '?[%{{语言}} English//en | 中文//zh | 日本语//ja]',

  // Edge cases
  empty: '?[]',
  whitespace: '?[   ]',
  malformed: '?[incomplete',
  nested: '?[Button [with brackets]]',

  // Performance test data
  large: '?[' + 'Option|'.repeat(1000) + 'Final]',
};
```

### Code Quality Tools

```bash
# ESLint (TypeScript linting)
npm run lint                    # Check for issues
npm run lint:fix               # Auto-fix issues

# Prettier (code formatting)
npm run format                 # Format all files
npm run format:check           # Check if formatting needed

# Lint-staged (pre-commit formatting)
npm run lint-staged            # Run on staged files only
```

## Core Syntax Specifications

### Supported ?[...] Syntax Patterns (Complete Reference)

This project implements a **layered parsing architecture** with strict syntax rules:

#### Layer 1: Basic Format Validation

```regex
/\?\[([^\]]*)\](?!\()/
```

- **Valid**: `?[content]`
- **Invalid**: `?[content](url)` (this is markdown link syntax)
- **Invalid**: `?[]` (empty content allowed but processed differently)

#### Layer 2: Variable Detection

```regex
/^%\{\{\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\}\}(.*)$/
```

- **Variable names support**: Letters, numbers, underscores, Chinese characters
- **Example**: `%{{username}}`, `%{{用户名}}`, `%{{user_id_123}}`

#### Layer 3: Content Parsing Patterns

1. **Simple Buttons**

   ```markdown
   ?[Submit] # Single button
   ?[Yes | No | Maybe] # Multiple buttons
   ```

2. **Custom Button Values**

   ```markdown
   ?[Save Changes//save-action] # Display "Save Changes", value "save-action"
   ?[确定//confirm | 取消//cancel] # Unicode support
   ```

3. **Variable Text Input**

   ```markdown
   ?[%{{username}}...Enter your name] # Pure text input
   ?[%{{age}}...How old are you?] # With question prompt
   ?[%{{comment}}...] # Empty prompt
   ```

4. **Variable Button Selection**

   ```markdown
   ?[%{{theme}} Light | Dark] # Button selection
   ?[%{{size}} S//Small | M//Medium | L//Large] # With custom values
   ```

5. **Combined: Buttons + Text Input**
   ```markdown
   ?[%{{size}} Small//S | Medium//M | Large//L | ...custom size]
   ```

   - Buttons: Small(S), Medium(M), Large(L)
   - Text input: "custom size" placeholder

#### Parsing Rules and Constraints

1. **Separator Characters**
   - Pipe: `|` (standard)
   - Full-width pipe: `｜` (Chinese input support)
   - Ellipsis: `...` (separates buttons from text input)

2. **Button Value Format**
   - Pattern: `Display Text//actual_value`
   - If no `//`, display text equals value
   - Whitespace trimmed from both display and value

3. **Variable Name Rules**
   - Must start with letter, underscore, or Chinese character
   - Can contain letters, numbers, underscores, Chinese characters
   - Case sensitive: `%{{userName}}` ≠ `%{{username}}`

4. **Unicode Support**
   - Full Unicode support in all text fields
   - Chinese variable names: `%{{用户名}}`
   - Emoji support: `?[👍 Good | 👎 Bad]`

### Plugin Implementation Standards

All plugins must follow the remark plugin pattern:

```typescript
import type { Plugin } from 'unified';
import type { Root } from 'mdast';

const remarkPlugin: Plugin<[], Root> = () => {
  return (tree: Root, file) => {
    // MUST use unist-util-visit for AST traversal
    visit(tree, 'text', (node, index, parent) => {
      // Process text nodes containing ?[...] patterns
      // Replace with custom-variable nodes
    });
  };
};

export default remarkPlugin;
```

### AST Node Standards

Custom nodes must follow this structure:

```typescript
interface CustomVariableNode extends Node {
  type: 'custom-variable';
  data: {
    variableName?: string; // For %{{name}} syntax
    buttonTexts?: string[]; // Button display text
    buttonValues?: string[]; // Button values (may differ from display)
    placeholder?: string; // Text input placeholder
  };
}
```

### Parsing Pattern Standards

The interaction parser handles these syntax patterns:

1. **Simple buttons**: `?[Button Text]`
2. **Custom values**: `?[Display Text//actual-value]`
3. **Multiple choice**: `?[Option1 | Option2 | Option3]`
4. **Variables**: `?[%{{variableName}} options...]`
5. **Text input**: `?[%{{name}} ...placeholder text]`
6. **Combined**: `?[%{{name}} Button1//val1 | Button2//val2 | ...placeholder]`

### Error Handling Standards (CRITICAL)

#### Graceful Degradation Philosophy

The plugin MUST NEVER crash or break markdown processing. When encountering invalid syntax, always provide fallback behavior.

```typescript
// ✅ CORRECT: Graceful error handling
function parseInteractionSyntax(content: string): RemarkCompatibleResult {
  try {
    // Attempt to parse
    const result = parseWithValidation(content);
    return result;
  } catch (error) {
    // Log for debugging but don't crash
    console.warn(`Parse error in ?[...] syntax: ${error.message}`);

    // Return fallback result - preserve original content
    return {
      placeholder: content.trim(),
      // Include error info for debugging
      _parseError: error.message,
    };
  }
}

// ❌ WRONG: Throwing errors that break processing
function badParseFunction(content: string) {
  if (!content.includes('?[')) {
    throw new Error('Invalid syntax'); // This breaks everything!
  }
}
```

#### Required Error Handling Scenarios

1. **Malformed Syntax**

   ```typescript
   // Input: '?[incomplete syntax'
   // Output: { placeholder: 'incomplete syntax' }
   // MUST NOT: Throw error or crash
   ```

2. **Empty or Whitespace Content**

   ```typescript
   // Input: '?[]' or '?[   ]'
   // Output: { buttonTexts: [''], buttonValues: [''] }
   // MUST NOT: Return null or undefined
   ```

3. **Invalid Variable Names**

   ```typescript
   // Input: '?[%{{123invalid}}...]'
   // Output: { placeholder: '%{{123invalid}}...' }
   // MUST NOT: Attempt to process as variable
   ```

4. **Unicode Parsing Errors**
   ```typescript
   // Input: Contains invalid Unicode sequences
   // Output: Best-effort parsing with fallback
   // MUST NOT: Crash on Unicode edge cases
   ```

#### Performance Standards

| Operation           | Max Time   | Memory Limit | Notes                    |
| ------------------- | ---------- | ------------ | ------------------------ |
| Single ?[...] parse | **<1ms**   | <1KB         | For typical syntax       |
| Large file (1MB)    | **<100ms** | <10MB        | Full document processing |
| Regex compilation   | **<5ms**   | <100KB       | During module load       |
| AST node creation   | **<0.1ms** | <100B        | Per node                 |

#### Memory Efficiency Rules

```typescript
// ✅ EFFICIENT: Reuse compiled regex patterns
const COMPILED_PATTERNS = {
  interaction: /\?\[([^\]]*)\]/g,
  variable: /%\{\{([^}]+)\}\}/,
  // Pre-compile all patterns at module level
};

// ❌ INEFFICIENT: Recompiling regex in loops
function badParsing(content: string) {
  content.match(/\?\[([^\]]*)\]/g); // Recompiled every call!
}

// ✅ EFFICIENT: Single AST traversal
visit(tree, 'text', node => {
  // Process ALL ?[...] patterns in one pass
  const matches = node.value.matchAll(COMPILED_PATTERNS.interaction);
  // Handle all matches for this text node
});

// ❌ INEFFICIENT: Multiple traversals
visit(tree, 'text', processButtons); // First pass
visit(tree, 'text', processVariables); // Second pass - wasteful!
```

## Testing Guidelines

### Test File Structure

```
src/                          # Source code directory
├── index.ts                  # Main exports and default plugin
├── remark-flow.ts            # Primary plugin implementation
├── remark-interaction.ts     # Alternative interaction plugin
├── remark-custom-variable.ts # Variable-focused plugin
└── interaction-parser.ts     # Core parsing engine

tests/                        # Test directory (separate from src)
├── index.test.ts             # Main integration tests
├── remark-flow.test.ts       # Flow plugin tests
├── remark-interaction.test.ts # Interaction plugin tests
├── remark-custom-variable.test.ts # Variable plugin tests
├── parser-demo.test.ts       # Parser demonstration tests
├── chinese-variable-names.test.ts # Unicode support tests
├── button-values-fallback.test.ts # Edge case tests
└── test-utils.ts             # Test utility functions

# Test naming patterns:
# - Basic functionality: test_plugin_transforms_simple_buttons()
# - Edge cases: test_plugin_handles_empty_syntax()
# - Integration: test_plugin_with_remark_processor()
```

### Test Patterns

```typescript
import { remark } from 'remark';
import remarkFlow from '../src/index';

describe('remark-flow plugin', () => {
  const processor = remark().use(remarkFlow);

  test('transforms simple button syntax', () => {
    const input = 'Click: ?[Submit]';
    const result = processor.processSync(input);

    expect(result.toString()).toContain('custom-variable');
    // Test the actual AST structure
    const ast = processor.parse(input);
    processor.runSync(ast);

    // Verify custom-variable node properties
    expect(/* custom-variable node */).toMatchObject({
      type: 'custom-variable',
      data: {
        buttonTexts: ['Submit'],
        buttonValues: ['Submit'],
      },
    });
  });

  test('handles unicode characters correctly', () => {
    const input = '选择: ?[确定//confirm | 取消//cancel]';
    // Test Chinese text handling
  });

  test('gracefully handles malformed syntax', () => {
    const input = '?[incomplete syntax';
    // Should not throw, should handle gracefully
  });
});
```

### Coverage Requirements

- **Minimum 80% code coverage** for all source files
- **100% coverage** for core parser logic (`interaction-parser.ts`)
- **Edge case testing** for all supported syntax patterns
- **Integration testing** with actual remark processor
- **Unicode and special character testing**

## Development Workflow

### Branch Naming

- Feature: `feat/description-of-feature`
- Bug fix: `fix/description-of-fix`
- Refactor: `refactor/description`
- Documentation: `docs/description`
- Testing: `test/description`

### Pull Request Checklist

- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] Code is properly formatted (`npm run format:check`)
- [ ] Linting passes (`npm run lint`)
- [ ] Coverage requirements met (`npm run test:coverage`)
- [ ] PR title follows Conventional Commits
- [ ] Documentation updated if API changed
- [ ] Real-world testing with remark processor completed

### Release Process (For Maintainers)

#### Pre-Release Checklist

- [ ] All tests pass: `npm test`
- [ ] Code coverage ≥80%: `npm run test:coverage`
- [ ] TypeScript compiles: `npm run build`
- [ ] No linting errors: `npm run lint`
- [ ] Code properly formatted: `npm run format:check`
- [ ] Integration testing with real remark processor completed
- [ ] Performance testing with large files completed
- [ ] Unicode/i18n testing completed

#### Semantic Versioning Rules

- **PATCH** (1.0.1): Bug fixes, performance improvements
- **MINOR** (1.1.0): New features, backward compatible
- **MAJOR** (2.0.0): Breaking changes to API or syntax

#### Release Steps

```bash
# 1. Version bump
npm version patch|minor|major    # Updates package.json and creates git tag

# 2. Pre-publish build and validation
npm run prepublishOnly          # Runs build automatically
npm test                        # Final test confirmation

# 3. Publish to npm
npm publish                     # Publishes to npm registry

# 4. Push changes and tags
git push origin main --tags     # Push commits and version tags
```

#### Post-Release Validation

```bash
# Verify package on npm
npm view remark-flow

# Test installation in fresh project
mkdir test-install && cd test-install
npm init -y
npm install remark-flow
node -e "console.log(require('remark-flow'))"
```

## Performance Guidelines

### Plugin Performance

- **Minimize AST traversals**: Use single `visit()` call when possible
- **Avoid deep cloning**: Modify nodes in place
- **Cache regex patterns**: Don't recreate regex in loops
- **Early termination**: Return early for non-matching content

```typescript
// Good: Single traversal
visit(tree, 'text', (node, index, parent) => {
  if (node.value.includes('?[')) {
    // Process all ?[...] patterns in one pass
  }
});

// Bad: Multiple traversals
visit(tree, 'text', processButtons);
visit(tree, 'text', processVariables); // Second traversal
```

### Memory Efficiency

- **String processing**: Use efficient regex patterns
- **Node creation**: Minimize object allocation
- **Large files**: Handle large markdown files gracefully

### Parsing Efficiency

```typescript
// Efficient regex patterns
const INTERACTION_PATTERN = /\?\[([^\]]+)\]/g;
const VARIABLE_PATTERN = /%\{\{([^}]+)\}\}/;

// Cache compiled patterns
const patterns = {
  interaction: /\?\[([^\]]+)\]/g,
  variable: /%\{\{([^}]+)\}\}/,
  separator: /\s*\|\s*/,
  customValue: /^([^/]+)\/\/([^/]+)$/,
};
```

## API Documentation Standards

### Type Definitions

All public interfaces must be properly typed:

```typescript
export interface InteractionData {
  variableName?: string;
  buttonTexts?: string[];
  buttonValues?: string[];
  placeholder?: string;
}

export interface RemarkFlowOptions {
  // Future configuration options
}

export type RemarkFlowPlugin = Plugin<[RemarkFlowOptions?], Root>;
```

### JSDoc Comments

```typescript
/**
 * Parses interaction syntax like ?[Button1 | Button2] into structured data
 *
 * @param content - The content inside ?[...] brackets
 * @returns Structured interaction data
 *
 * @example
 * parseInteractionSyntax('Yes//y | No//n')
 * // Returns: { buttonTexts: ['Yes', 'No'], buttonValues: ['y', 'n'] }
 */
export function parseInteractionSyntax(content: string): InteractionData;
```

## Package.json Configuration

### Key Scripts Understanding

```json
{
  "scripts": {
    "build": "tsc --build --clean && tsc --build",
    "prepublishOnly": "npm run build",
    "prepare": "husky"
  }
}
```

- **build**: Cleans and compiles TypeScript to `dist/`
- **prepublishOnly**: Ensures build before npm publish
- **prepare**: Sets up Husky git hooks after npm install

### Dependencies

- **Runtime**: `unist`, `unist-util-visit` (minimal, focused)
- **Development**: Full TypeScript, Jest, ESLint, Prettier toolchain
- **Peer Dependencies**: `remark` (users provide their own version)

## Troubleshooting

### Common Issues and Solutions

| Issue                               | Solution                                             |
| ----------------------------------- | ---------------------------------------------------- |
| TypeScript compilation errors       | Check `tsconfig.json`, ensure all files are included |
| Jest tests not running              | Verify `ts-jest` configuration in `package.json`     |
| Lint errors on commit               | Run `npm run lint:fix` before committing             |
| Build output missing                | Check `dist/` directory, run `npm run build`         |
| Plugin not transforming markdown    | Test with simple remark processor setup              |
| Unicode characters not parsing      | Test regex patterns with Unicode strings             |
| Performance issues with large files | Profile with large markdown files                    |

### Advanced Debugging and Troubleshooting

#### Quick Diagnostic Commands

```bash
# 1. Environment check
node --version              # Should be ≥16
npm --version              # Should be ≥8
npx tsc --version          # TypeScript version

# 2. Project health check
npm test                   # Must pass (most important)
npm run build             # Must compile without errors
npm run lint              # Check for style issues
npm run format:check      # Verify formatting

# 3. TypeScript diagnostics
npx tsc --showConfig      # Show effective TypeScript config
npx tsc --noEmit         # Check types without building
npx tsc --listFiles      # Show all files being compiled

# 4. Test diagnostics
npm test -- --verbose                    # Detailed test output
npm test -- --testPathPattern=parser    # Run specific test file
npm run test:coverage                   # Coverage report
npm run test:watch                      # Interactive testing

# 5. Build diagnostics
npm run build && ls -la dist/          # Check build output
du -sh dist/                          # Check bundle size
file dist/index.js                    # Verify file type

# 6. Module verification
node -e "console.log(require('./dist/index.js'))"              # Check exports
node -e "const r=require('remark');const p=require('./dist/index.js').default;console.log(r().use(p).processSync('?[Test]'))"
```

#### Common Issues and Solutions

| Problem                           | Symptoms                           | Solution                                   | Prevention                             |
| --------------------------------- | ---------------------------------- | ------------------------------------------ | -------------------------------------- |
| **Tests fail after changes**      | Some tests pass, others fail       | Run `npm test -- --verbose` to see details | Always run tests before committing     |
| **TypeScript compilation errors** | `npm run build` fails              | Check `npx tsc --noEmit` for type errors   | Use IDE with TypeScript support        |
| **Linting errors**                | Pre-commit hooks fail              | Run `npm run lint:fix`                     | Use auto-format on save                |
| **Performance issues**            | Slow parsing on large files        | Profile with `console.time()` in parser    | Test with large test files             |
| **Unicode handling problems**     | Chinese text not parsing correctly | Check regex patterns support Unicode       | Test with comprehensive Unicode data   |
| **Plugin not working in remark**  | No transformation occurs           | Verify plugin registration and exports     | Test with minimal remark setup         |
| **Memory leaks**                  | High memory usage over time        | Check for retained references              | Use `process.memoryUsage()` monitoring |
| **Regex performance**             | Slow regex execution               | Use pre-compiled patterns                  | Profile regex performance              |

#### Parser-Specific Debugging

```typescript
// Enable debug mode in interaction parser
const parser = createInteractionParser();
const result = parser.parse('?[test content]');

// Add logging to understand parsing flow
console.log('Layer 1 validation:', parser._layer1ValidateFormat(content));
console.log(
  'Layer 2 variable detection:',
  parser._layer2DetectVariable(innerContent)
);
console.log('Layer 3 parsing result:', result);

// Test specific regex patterns
console.log(
  'Interaction pattern match:',
  /\?\[([^\]]*)\](?!\()/.exec('?[test]')
);
console.log(
  'Variable pattern match:',
  /^%\{\{\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\}\}(.*)$/.exec(
    '%{{test}} content'
  )
);
```

#### Performance Profiling

```bash
# Memory usage monitoring
node --max-old-space-size=4096 --inspect test-performance.js

# CPU profiling
node --prof test-performance.js
node --prof-process isolate-*.log > profile.txt

# Benchmark testing
time npm test                    # Overall test performance
time node benchmark-parsing.js  # Custom parsing benchmarks
```

#### Integration Testing with Real Projects

```bash
# Create test project
mkdir integration-test && cd integration-test
npm init -y
npm install remark remark-parse remark-stringify
npm install ../path/to/remark-flow  # Local installation

# Test basic integration
cat > test.js << 'EOF'
const remark = require('remark')
const remarkFlow = require('remark-flow').default

const processor = remark().use(remarkFlow)
const markdown = `
# Test Document
Choose your option: ?[Option A | Option B | Option C]
Enter name: ?[%{{username}}...Your name here]
`

const result = processor.processSync(markdown)
console.log(result.toString())
EOF

node test.js
```

#### Memory Leak Detection

```javascript
// Create memory leak test
function testMemoryUsage() {
  const remark = require('remark');
  const remarkFlow = require('./dist/index.js').default;

  const processor = remark().use(remarkFlow);
  const testContent = '?[Button1 | Button2 | Button3]'.repeat(1000);

  // Baseline
  global.gc && global.gc();
  const baseline = process.memoryUsage().heapUsed;

  // Process multiple times
  for (let i = 0; i < 100; i++) {
    processor.processSync(testContent);
  }

  // Check memory usage
  global.gc && global.gc();
  const final = process.memoryUsage().heapUsed;

  console.log(`Memory growth: ${(final - baseline) / 1024 / 1024} MB`);
  if (final - baseline > 50 * 1024 * 1024) {
    // 50MB threshold
    console.warn('Possible memory leak detected!');
  }
}

// Run with: node --expose-gc memory-test.js
testMemoryUsage();
```

## Integration Examples

### Basic Usage

```typescript
import { remark } from 'remark';
import remarkFlow from 'remark-flow';

const processor = remark().use(remarkFlow);
const result = processor.processSync('Choose: ?[Yes | No]');
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

const markdown = `
Select theme: ?[%{{theme}} Light//light | Dark//dark | ...custom]
`;

const result = processor.processSync(markdown);
```

## Additional Resources

- **Remark Plugin Development**: <https://remark.js.org/api/>
- **AST Explorer**: <https://astexplorer.net/> (select @mdx-js/mdx parser)
- **Unist Utilities**: <https://github.com/syntax-tree/unist#list-of-utilities>
- **TypeScript Deep Dive**: <https://basarat.gitbook.io/typescript/>
- **Jest Testing**: <https://jestjs.io/docs/getting-started>
- **Package Publishing**: <https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages>

---

**Remember**: This is a published npm package. All changes must maintain backward compatibility and follow semver versioning principles.

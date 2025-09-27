#!/usr/bin/env node

/**
 * remark-flow Interactive Format Testing Tool
 */

const readline = require('readline');

// Load compiled modules dynamically
let InteractionParser;

try {
  const parserModule = require('../dist/interaction-parser.js');
  InteractionParser = parserModule.InteractionParser;
  console.log('✅ Successfully loaded remark-flow modules');
} catch (error) {
  console.error('❌ Module loading failed:', error.message);
  console.error("💡 Please run 'npm run build' to compile the project first");
  process.exit(1);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Format parse result for display
 */
function formatParseResult(result) {
  if (result.error) {
    return `❌ Error: ${result.error}`;
  }

  let formatted = `✅ Type: ${result.type || 'None'}`;

  if (result.variable) {
    formatted += `\n   Variable: ${result.variable}`;
  }

  if (result.buttons && result.buttons.length > 0) {
    const buttonList = result.buttons
      .map(b =>
        b.display === b.value ? b.display : `${b.display}(${b.value})`
      )
      .join(', ');
    formatted += `\n   Buttons: [${buttonList}]`;
  }

  if (result.question !== undefined) {
    formatted += `\n   Question: "${result.question}"`;
  }

  if (result.isMultiSelect !== undefined) {
    formatted += `\n   Multi-select: ${result.isMultiSelect ? 'Yes' : 'No'}`;
  }

  return formatted;
}

/**
 * Interactive testing main program
 */
function interactiveTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🕹️ Interactive Format Testing');
  console.log('='.repeat(60));
  console.log('Enter ?[...] format to test');
  console.log("Enter 'q', 'quit' or 'exit' to quit");
  console.log('-'.repeat(60));

  const parser = new InteractionParser();

  function askForInput() {
    rl.question('\n📝 Enter test content: ', input => {
      const trimmedInput = input.trim();

      if (
        trimmedInput.toLowerCase() === 'q' ||
        trimmedInput.toLowerCase() === 'quit' ||
        trimmedInput.toLowerCase() === 'exit'
      ) {
        console.log('👋 Testing finished');
        rl.close();
        return;
      }

      if (!trimmedInput) {
        askForInput();
        return;
      }

      try {
        console.log(`\n🔍 Parsing: "${trimmedInput}"`);

        // Parse directly using InteractionParser
        const parseResult = parser.parse(trimmedInput);
        console.log(formatParseResult(parseResult));

        // Show detailed JSON result
        console.log(
          `\n📋 Detailed result: ${JSON.stringify(parseResult, null, 2)}`
        );
      } catch (error) {
        console.log(`❌ Testing error: ${error.message}`);
      }

      askForInput();
    });
  }

  askForInput();
}

// Handle program exit
rl.on('close', () => {
  process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Program interrupted, goodbye!');
  rl.close();
});

// Start program
if (require.main === module) {
  interactiveTest();
}

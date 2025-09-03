/**
 * MarkdownFlow Interactive Block Layered Parser - TypeScript Version
 *
 * Uses a three-layer analysis architecture:
 * Layer 1: ?[] format validation
 * Layer 2: Variable detection and pattern classification
 * Layer 3: Specific content parsing
 */

// Interaction input type enumeration
export enum InteractionType {
  TEXT_ONLY = 'text_only', // Pure text input: ?[%{{var}}...question]
  BUTTONS_ONLY = 'buttons_only', // Pure button group: ?[%{{var}} option1|option2]
  BUTTONS_WITH_TEXT = 'buttons_with_text', // Button group + text: ?[%{{var}} option1|option2|...question]
  NON_ASSIGNMENT_BUTTON = 'non_assignment_button', // Non-assignment button: ?[Continue] or ?[Continue|Cancel]
}

// Pre-compiled regex constants
export const COMPILED_REGEXES = {
  // Layer 1: Basic format validation - matches ?[content] but excludes ?[text](url) format
  LAYER1_INTERACTION: /\?\[([^\]]*)\](?!\()/,

  // Layer 2: Variable detection - matches %{{variable}}content format (supports letters, numbers, underscores, Chinese characters, with optional spaces)
  LAYER2_VARIABLE:
    /^%\{\{\s*([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*\}\}(.*)$/,

  // Layer 3: Split content before and after ...
  LAYER3_ELLIPSIS: /^(.*?)\.\.\.(.*)/,

  // Layer 3: Split Button//value format
  LAYER3_BUTTON_VALUE: /^(.+?)\/\/(.+)$/,
};

// Button interface
export interface Button {
  display: string;
  value: string;
}

// Parse result base interface
export interface ParseResultBase {
  type: InteractionType | null;
  error?: string;
}

// Variable interaction result interface
export interface VariableInteractionResult extends ParseResultBase {
  type:
    | InteractionType.TEXT_ONLY
    | InteractionType.BUTTONS_ONLY
    | InteractionType.BUTTONS_WITH_TEXT;
  variable: string;
  buttons?: Button[];
  question?: string;
}

// Non-assignment button result interface
export interface NonAssignmentButtonResult extends ParseResultBase {
  type: InteractionType.NON_ASSIGNMENT_BUTTON;
  buttons: Button[];
}

// Error result interface
export interface ErrorResult extends ParseResultBase {
  type: null;
  error: string;
}

// Parse result union type
export type ParseResult =
  | VariableInteractionResult
  | NonAssignmentButtonResult
  | ErrorResult;

// remark-compatible output format
export interface RemarkCompatibleResult {
  variableName?: string;
  buttonTexts?: string[];
  buttonValues?: string[];
  placeholder?: string;
}

// Legacy return data format for backward compatibility
export interface LegacyReturnData {
  variable?: string;
  buttons?: Button[];
  question?: string;
}

/**
 * Layered interaction parser class
 */
export class InteractionParser {
  constructor() {
    // Constructor is intentionally empty - no initialization needed
  }

  /**
   * Main parsing method
   *
   * @param content - Raw content of interaction block
   * @returns Standardized parse result
   */
  parse(content: string): ParseResult {
    try {
      // Layer 1: Validate basic format
      const innerContent = this._layer1ValidateFormat(content);
      if (innerContent === null) {
        return this._createErrorResult(
          `Invalid interaction format: ${content}`
        );
      }

      // Layer 2: Variable detection and pattern classification
      const [hasVariable, variableName, remainingContent] =
        this._layer2DetectVariable(innerContent);

      // Layer 3: Specific content parsing
      if (hasVariable && variableName) {
        return this._layer3ParseVariableInteraction(
          variableName,
          remainingContent
        );
      } else {
        return this._layer3ParseDisplayButtons(innerContent);
      }
    } catch (error) {
      return this._createErrorResult(
        `Parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Parse and convert to remark-compatible format
   *
   * @param content - Raw content of interaction block
   * @returns remark-compatible result object
   */
  parseToRemarkFormat(content: string): RemarkCompatibleResult {
    const result = this.parse(content);

    if (result.error) {
      // Compatibility handling when parsing fails
      return { placeholder: content.trim() };
    }

    // Convert to remark-compatible format
    const remarkResult: RemarkCompatibleResult = {};

    if (result.type === InteractionType.NON_ASSIGNMENT_BUTTON) {
      // Non-assignment button
      const nonAssignmentResult = result as NonAssignmentButtonResult;
      remarkResult.buttonTexts = nonAssignmentResult.buttons.map(
        b => b.display
      );
      remarkResult.buttonValues = nonAssignmentResult.buttons.map(b => b.value);
    } else if (result.type !== null) {
      // Variable interaction
      const variableResult = result as VariableInteractionResult;
      remarkResult.variableName = variableResult.variable;

      if (variableResult.buttons) {
        remarkResult.buttonTexts = variableResult.buttons.map(b => b.display);
        remarkResult.buttonValues = variableResult.buttons.map(b => b.value);
      }

      if (variableResult.question !== undefined) {
        remarkResult.placeholder = variableResult.question;
      }
    }

    return remarkResult;
  }

  /**
   * Layer 1: Validate ?[] format and extract content
   *
   * @param content - Raw content
   * @returns Extracted bracket content, returns null if validation fails
   */
  private _layer1ValidateFormat(content: string): string | null {
    content = content.trim();
    const match = COMPILED_REGEXES.LAYER1_INTERACTION.exec(content);

    if (!match) {
      return null;
    }

    // Ensure the match is the complete content (no other text)
    const matchedText = match[0];
    if (matchedText.trim() !== content) {
      return null;
    }

    return match[1];
  }

  /**
   * Layer 2: Detect variables and perform pattern classification
   *
   * @param innerContent - Content extracted from layer 1
   * @returns [hasVariable, variableName, remainingContent]
   */
  private _layer2DetectVariable(
    innerContent: string
  ): [boolean, string | null, string] {
    const match = COMPILED_REGEXES.LAYER2_VARIABLE.exec(innerContent);

    if (!match) {
      // No variable, entire content used for display button parsing
      return [false, null, innerContent];
    }

    const variableName = match[1].trim();
    const remainingContent = match[2].trim();

    return [true, variableName, remainingContent];
  }

  /**
   * Layer 3: Parse variable interaction (variable assignment type)
   *
   * @param variableName - Variable name
   * @param content - Content after variable
   * @returns Parse result
   */
  private _layer3ParseVariableInteraction(
    variableName: string,
    content: string
  ): VariableInteractionResult {
    // Detect if there's ... separator
    const ellipsisMatch = COMPILED_REGEXES.LAYER3_ELLIPSIS.exec(content);

    if (ellipsisMatch) {
      // Has ... separator
      const beforeEllipsis = ellipsisMatch[1].trim();
      const question = ellipsisMatch[2].trim();

      if (/[|｜]/.test(beforeEllipsis) && beforeEllipsis) {
        // Button group + text input: ?[%{{var}} Button1 | Button2 | ...question]
        const buttons = this._parseButtons(beforeEllipsis);
        return {
          type: InteractionType.BUTTONS_WITH_TEXT,
          variable: variableName,
          buttons: buttons,
          question: question,
        };
      } else {
        // Pure text input: ?[%{{var}}...question] or ?[%{{var}} single button | ...question]
        if (beforeEllipsis) {
          // Has preceding button
          const buttons = this._parseButtons(beforeEllipsis);
          return {
            type: InteractionType.BUTTONS_WITH_TEXT,
            variable: variableName,
            buttons: buttons,
            question: question,
          };
        } else {
          // Pure text input
          return {
            type: InteractionType.TEXT_ONLY,
            variable: variableName,
            question: question,
          };
        }
      }
    } else {
      // No ... separator
      if (/[|｜]/.test(content) && content) {
        // Pure button group: ?[%{{var}} Button1 | Button2]
        const buttons = this._parseButtons(content);
        return {
          type: InteractionType.BUTTONS_ONLY,
          variable: variableName,
          buttons: buttons,
        };
      } else if (content) {
        // Single button: ?[%{{var}} Button1] or ?[%{{var}} Button1//id1]
        const button = this._parseSingleButton(content);
        return {
          type: InteractionType.BUTTONS_ONLY,
          variable: variableName,
          buttons: [button],
        };
      } else {
        // Pure text input (no prompt): ?[%{{var}}]
        return {
          type: InteractionType.TEXT_ONLY,
          variable: variableName,
          question: '',
        };
      }
    }
  }

  /**
   * Layer 3: Parse display buttons (non-variable assignment type)
   *
   * @param content - Content
   * @returns Parse result
   */
  private _layer3ParseDisplayButtons(
    content: string
  ): NonAssignmentButtonResult {
    if (!content) {
      // Empty content: ?[]
      return {
        type: InteractionType.NON_ASSIGNMENT_BUTTON,
        buttons: [{ display: '', value: '' }],
      };
    }

    if (/[|｜]/.test(content)) {
      // Multiple buttons: ?[Continue | Cancel]
      const buttons = this._parseButtons(content);
      return {
        type: InteractionType.NON_ASSIGNMENT_BUTTON,
        buttons: buttons,
      };
    } else {
      // Single button: ?[Continue]
      const button = this._parseSingleButton(content);
      return {
        type: InteractionType.NON_ASSIGNMENT_BUTTON,
        buttons: [button],
      };
    }
  }

  /**
   * Parse button group
   *
   * @param content - Button content, separated by | or ｜
   * @returns Button list
   */
  private _parseButtons(content: string): Button[] {
    const buttons: Button[] = [];
    const buttonTexts = content.split(/[|｜]/);

    for (const buttonText of buttonTexts) {
      const trimmed = buttonText.trim();
      if (trimmed) {
        const button = this._parseSingleButton(trimmed);
        buttons.push(button);
      }
    }

    return buttons;
  }

  /**
   * Parse single button, supports Button//value format
   *
   * @param buttonText - Button text
   * @returns {display: display text, value: actual value}
   */
  private _parseSingleButton(buttonText: string): Button {
    buttonText = buttonText.trim();

    // Detect Button//value format
    const match = COMPILED_REGEXES.LAYER3_BUTTON_VALUE.exec(buttonText);

    if (match) {
      const display = match[1].trim();
      const value = match[2].trim();
      return { display: display, value: value };
    } else {
      return { display: buttonText, value: buttonText };
    }
  }

  /**
   * Create error result
   *
   * @param errorMessage - Error message
   * @returns Error result
   */
  private _createErrorResult(errorMessage: string): ErrorResult {
    return {
      type: null,
      error: errorMessage,
    };
  }
}

/**
 * Convenience function for parsing interaction format
 *
 * Supported formats:
 * 1. ?[%{{var}}...question] - Pure text input
 * 2. ?[%{{var}} option1|option2] - Pure button group (supports display//value format)
 * 3. ?[%{{var}} option1|option2|...question] - Button group + text input
 * 4. ?[%{{var}} single option] - Single button selection
 * 5. ?[Continue] or ?[Continue|Cancel] - Non-assignment button
 *
 * @param content - Raw content of interaction block
 * @returns [interaction type, parsed data]
 */
export function parseInteractionFormat(
  content: string
): [InteractionType, LegacyReturnData] {
  // Use new layered parser
  const parser = new InteractionParser();
  const result = parser.parse(content);

  // Handle parse errors
  if (result.error) {
    // Compatibility handling when parsing fails
    return [InteractionType.TEXT_ONLY, { question: content.trim() }];
  }

  // Extract parse result and convert to original return format
  const interactionType = result.type;

  // Build return data dictionary for backward compatibility
  const returnData: LegacyReturnData = {};

  if (result.type !== InteractionType.NON_ASSIGNMENT_BUTTON) {
    const variableResult = result as VariableInteractionResult;
    if (variableResult.variable !== undefined) {
      returnData.variable = variableResult.variable;
    }
    if (variableResult.buttons !== undefined) {
      returnData.buttons = variableResult.buttons;
    }
    if (variableResult.question !== undefined) {
      returnData.question = variableResult.question;
    }
  } else {
    const buttonResult = result as NonAssignmentButtonResult;
    if (buttonResult.buttons !== undefined) {
      returnData.buttons = buttonResult.buttons;
    }
  }

  // Ensure we have a valid interaction type, fallback to TEXT_ONLY if null
  const finalType = interactionType || InteractionType.TEXT_ONLY;
  return [finalType, returnData];
}

/**
 * Factory function to create parser instance
 */
export function createInteractionParser(): InteractionParser {
  return new InteractionParser();
}

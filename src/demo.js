/**
 * MarkdownFlow 交互块分层解析器 - JavaScript 版本
 * 
 * 采用三层分析架构：
 * 第一层：?[] 格式验证
 * 第二层：变量检测和模式分类
 * 第三层：具体内容解析
 */

// 交互输入类型枚举
const InteractionType = {
    TEXT_ONLY: "text_only",                    // 纯文本输入：?[%{{var}}...问题]
    BUTTONS_ONLY: "buttons_only",              // 纯按钮组：?[%{{var}} 选项1|选项2]
    BUTTONS_WITH_TEXT: "buttons_with_text",    // 按钮组+文本：?[%{{var}} 选项1|选项2|...问题]
    NON_ASSIGNMENT_BUTTON: "non_assignment_button"  // 非赋值按钮：?[Continue] 或 ?[Continue|Cancel]
};

// 预编译的正则表达式常量
const COMPILED_REGEXES = {
    // 第一层：基础格式验证 - 匹配 ?[content] 但排除 ?[text](url) 格式
    LAYER1_INTERACTION: /\?\[([^\]]*)\](?!\()/,
    
    // 第二层：变量检测 - 匹配 %{{variable}}content 格式
    LAYER2_VARIABLE: /^%\{\{([^}]+)\}\}(.*)$/,
    
    // 第三层：分割 ... 前后内容
    LAYER3_ELLIPSIS: /^(.*?)\.\.\.(.*)/,
    
    // 第三层：分割 Button//value 格式
    LAYER3_BUTTON_VALUE: /^(.+?)\/\/(.+)$/
};

/**
 * 分层交互解析器类
 */
class InteractionParser {
    constructor() {
        // 初始化解析器
    }

    /**
     * 主解析方法
     * 
     * @param {string} content - 交互区块的原始内容
     * @returns {Object} 标准化的解析结果
     * {
     *     type: InteractionType,
     *     variable: string (可选),
     *     buttons: Array (可选),
     *     question: string (可选),
     *     input_hint: string (可选)
     * }
     */
    parse(content) {
        try {
            // 第一层：验证基础格式
            const innerContent = this._layer1ValidateFormat(content);
            if (innerContent === null) {
                return this._createErrorResult(`Invalid interaction format: ${content}`);
            }

            // 第二层：变量检测和模式分类
            const [hasVariable, variableName, remainingContent] = this._layer2DetectVariable(innerContent);

            // 第三层：具体内容解析
            if (hasVariable) {
                return this._layer3ParseVariableInteraction(variableName, remainingContent);
            } else {
                return this._layer3ParseDisplayButtons(innerContent);
            }
        } catch (error) {
            return this._createErrorResult(`Parsing error: ${error.message}`);
        }
    }

    /**
     * 第一层：验证 ?[] 格式并提取内容
     * 
     * @param {string} content - 原始内容
     * @returns {string|null} 提取的中括号内容，验证失败返回null
     */
    _layer1ValidateFormat(content) {
        content = content.trim();
        const match = COMPILED_REGEXES.LAYER1_INTERACTION.exec(content);

        if (!match) {
            return null;
        }

        // 确保匹配的是完整的内容（不包含其他文字）
        const matchedText = match[0];
        if (matchedText.trim() !== content) {
            return null;
        }

        return match[1];
    }

    /**
     * 第二层：检测变量并进行模式分类
     * 
     * @param {string} innerContent - 第一层提取的内容
     * @returns {Array} [是否有变量, 变量名, 剩余内容]
     */
    _layer2DetectVariable(innerContent) {
        const match = COMPILED_REGEXES.LAYER2_VARIABLE.exec(innerContent);

        if (!match) {
            // 没有变量，整个内容用于展示按钮解析
            return [false, null, innerContent];
        }

        const variableName = match[1].trim();
        const remainingContent = match[2].trim();

        return [true, variableName, remainingContent];
    }

    /**
     * 第三层：解析有变量的交互（变量赋值类型）
     * 
     * @param {string} variableName - 变量名
     * @param {string} content - 变量后面的内容
     * @returns {Object} 解析结果
     */
    _layer3ParseVariableInteraction(variableName, content) {
        // 检测是否有 ... 分隔符
        const ellipsisMatch = COMPILED_REGEXES.LAYER3_ELLIPSIS.exec(content);

        if (ellipsisMatch) {
            // 有 ... 分隔符
            const beforeEllipsis = ellipsisMatch[1].trim();
            const question = ellipsisMatch[2].trim();

            if (beforeEllipsis.includes('|') && beforeEllipsis) {
                // 按钮组+文本输入：?[%{{var}} Button1 | Button2 | ...问题]
                const buttons = this._parseButtons(beforeEllipsis);
                return {
                    type: InteractionType.BUTTONS_WITH_TEXT,
                    variable: variableName,
                    buttons: buttons,
                    question: question
                };
            } else {
                // 纯文本输入：?[%{{var}}...问题] 或 ?[%{{var}} 单按钮 | ...问题]
                if (beforeEllipsis) {
                    // 有前置按钮
                    const buttons = this._parseButtons(beforeEllipsis);
                    return {
                        type: InteractionType.BUTTONS_WITH_TEXT,
                        variable: variableName,
                        buttons: buttons,
                        question: question
                    };
                } else {
                    // 纯文本输入
                    return {
                        type: InteractionType.TEXT_ONLY,
                        variable: variableName,
                        question: question
                    };
                }
            }
        } else {
            // 没有 ... 分隔符
            if (content.includes('|') && content) {
                // 纯按钮组：?[%{{var}} Button1 | Button2]
                const buttons = this._parseButtons(content);
                return {
                    type: InteractionType.BUTTONS_ONLY,
                    variable: variableName,
                    buttons: buttons
                };
            } else if (content) {
                // 单按钮：?[%{{var}} Button1] 或 ?[%{{var}} Button1//id1]
                const button = this._parseSingleButton(content);
                return {
                    type: InteractionType.BUTTONS_ONLY,
                    variable: variableName,
                    buttons: [button]
                };
            } else {
                // 纯文本输入（无提示）：?[%{{var}}]
                return {
                    type: InteractionType.TEXT_ONLY,
                    variable: variableName,
                    question: ''
                };
            }
        }
    }

    /**
     * 第三层：解析展示按钮（非变量赋值类型）
     * 
     * @param {string} content - 内容
     * @returns {Object} 解析结果
     */
    _layer3ParseDisplayButtons(content) {
        if (!content) {
            // 空内容：?[]
            return {
                type: InteractionType.NON_ASSIGNMENT_BUTTON,
                buttons: [{ display: '', value: '' }]
            };
        }

        if (content.includes('|')) {
            // 多按钮：?[Continue | Cancel]
            const buttons = this._parseButtons(content);
            return {
                type: InteractionType.NON_ASSIGNMENT_BUTTON,
                buttons: buttons
            };
        } else {
            // 单按钮：?[Continue]
            const button = this._parseSingleButton(content);
            return {
                type: InteractionType.NON_ASSIGNMENT_BUTTON,
                buttons: [button]
            };
        }
    }

    /**
     * 解析按钮组
     * 
     * @param {string} content - 按钮内容，用 | 分隔
     * @returns {Array} 按钮列表
     */
    _parseButtons(content) {
        const buttons = [];
        const buttonTexts = content.split('|');
        
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
     * 解析单个按钮，支持 Button//value 格式
     * 
     * @param {string} buttonText - 按钮文本
     * @returns {Object} {display: 显示文本, value: 实际值}
     */
    _parseSingleButton(buttonText) {
        buttonText = buttonText.trim();

        // 检测 Button//value 格式
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
     * 创建错误结果
     * 
     * @param {string} errorMessage - 错误消息
     * @returns {Object} 错误结果
     */
    _createErrorResult(errorMessage) {
        return {
            type: null,
            error: errorMessage
        };
    }
}

/**
 * 解析交互格式的便捷函数
 * 
 * 支持格式：
 * 1. ?[%{{var}}...问题] - 纯文本输入
 * 2. ?[%{{var}} 选项1|选项2] - 纯按钮组（支持展示值//实际值格式）
 * 3. ?[%{{var}} 选项1|选项2|...问题] - 按钮组+文本输入
 * 4. ?[%{{var}} 单选项] - 单按钮选择
 * 5. ?[Continue] 或 ?[Continue|Cancel] - 非赋值按钮
 * 
 * @param {string} content - 交互区块的原始内容
 * @returns {Array} [交互类型, 解析数据]
 */
function parseInteractionFormat(content) {
    // 使用新的分层解析器
    const parser = new InteractionParser();
    const result = parser.parse(content);

    // 处理解析错误
    if (result.error) {
        // 解析失败时的兼容性处理
        return [InteractionType.TEXT_ONLY, { question: content.trim() }];
    }

    // 提取解析结果并转换为原有的返回格式
    const interactionType = result.type;

    // 构建返回数据字典，保持向后兼容
    const returnData = {};

    if (result.variable !== undefined) {
        returnData.variable = result.variable;
    }

    if (result.buttons !== undefined) {
        returnData.buttons = result.buttons;
    }

    if (result.question !== undefined) {
        returnData.question = result.question;
    }

    return [interactionType, returnData];
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    // Node.js 环境
    module.exports = {
        InteractionParser,
        InteractionType,
        parseInteractionFormat,
        COMPILED_REGEXES
    };
} else if (typeof window !== 'undefined') {
    // 浏览器环境
    window.MarkdownFlowInteraction = {
        InteractionParser,
        InteractionType,
        parseInteractionFormat,
        COMPILED_REGEXES
    };
}
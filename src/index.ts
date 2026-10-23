import remarkCustomVariable from './remark-custom-variable';
import remarkFlow from './remark-flow';
import remarkInteraction from './remark-interaction';

export {
  createInteractionParser,
  InteractionParser,
  InteractionType,
} from './interaction-parser';

export {
  createVariableExpressionRegex,
  extractVariableNames,
  findVariableMarkers,
  formatVariableAssignment,
  formatVariableReference,
  isValidVariableName,
  normalizeVariableName,
  readVariableMarker,
  trimVariablePadding,
  VARIABLE_ASSIGNMENT_SOURCE,
  VARIABLE_NAME_SOURCE,
  VARIABLE_REFERENCE_SOURCE,
} from './variable-name';
export type { VariableMarker } from './variable-name';

// The grammar's escape rule, so that anything else scanning for `?[...]` -- an editor's syntax
// highlighting, a shortcode reader -- uses the same definition of where an interaction ends
// rather than a second copy of it that an escaped bracket would fool.
export {
  ESCAPABLE,
  escapeInteractionText,
  findUnescaped,
  INTERACTION_CONTENT_SOURCE,
  isEscape,
  splitOnEllipsis,
  splitOnSingleUnescapedPipe,
  splitUnescaped,
  unescapeInteractionText,
} from './escaping';

export { remarkCustomVariable, remarkFlow, remarkInteraction };

export default remarkInteraction;

import type { Node } from 'unist';
import remarkInteraction from './remark-interaction';

/**
 * remarkFlow plugin - uses unified interaction parser
 */
export default function remarkFlow() {
  return (tree: Node) => {
    // Use unified interaction plugin
    const interactionPlugin = remarkInteraction();
    interactionPlugin(tree);
  };
}

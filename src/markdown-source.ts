/**
 * Recover the same UTF-8 source VFile gives the Markdown parser. Node Buffers are Uint8Array
 * views too, so this works in Node and browsers without depending on the Buffer global.
 */
export const decodeMarkdownSource = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array)
    return new globalThis.TextDecoder('utf-8').decode(value);
  return undefined;
};

import { decodeMarkdownSource } from '../src/markdown-source';

describe('Markdown source decoding', () => {
  test('keeps string source and NUL unchanged', () => {
    const source = '前缀🙂 {{bad\u0000题}} {{good\ufffd题}}';
    expect(decodeMarkdownSource(source)).toBe(source);
    expect(
      decodeMarkdownSource(new globalThis.TextEncoder().encode(source))
    ).toBe(source);
  });

  test('decodes only the supplied byte view', () => {
    const encoded = new globalThis.TextEncoder().encode('题\u0000🙂');
    const storage = new Uint8Array(encoded.length + 4);
    storage.set(encoded, 2);
    expect(decodeMarkdownSource(storage.subarray(2, 2 + encoded.length))).toBe(
      '题\u0000🙂'
    );
  });

  test('keeps source-less hand-built trees supported', () => {
    expect(decodeMarkdownSource(undefined)).toBeUndefined();
    expect(decodeMarkdownSource(null)).toBeUndefined();
    expect(decodeMarkdownSource({})).toBeUndefined();
  });
});

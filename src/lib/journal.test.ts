import { describe, expect, it } from 'vitest';
import { parseYearSource, readImageDimensions } from './journal';

function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

function isoBox(type: string, ...payload: Uint8Array[]): Uint8Array {
  const bodyLength = payload.reduce((total, part) => total + part.length, 0);
  const box = new Uint8Array(bodyLength + 8);
  new DataView(box.buffer).setUint32(0, box.length);
  box.set(asciiBytes(type), 4);
  let offset = 8;
  for (const part of payload) {
    box.set(part, offset);
    offset += part.length;
  }
  return box;
}

function ispe(width: number, height: number): Uint8Array {
  // ispe is a full box: 4 bytes of version/flags, then width and height.
  const payload = new Uint8Array(12);
  const view = new DataView(payload.buffer);
  view.setUint32(4, width);
  view.setUint32(8, height);
  return isoBox('ispe', payload);
}

function heicFile(properties: Uint8Array[]): Uint8Array {
  const ftyp = isoBox('ftyp', asciiBytes('heic'), new Uint8Array(4), asciiBytes('mif1'));
  const meta = isoBox('meta', new Uint8Array(4), isoBox('iprp', isoBox('ipco', ...properties)));
  const file = new Uint8Array(ftyp.length + meta.length);
  file.set(ftyp, 0);
  file.set(meta, ftyp.length);
  return file;
}

describe('year journal parser', () => {
  it('uses AST headings as boundaries and keeps ordinary Markdown intact', () => {
    const posts = parseYearSource(
      `# 2026\n\n## 2026-01-02\n\n![alt](/one.jpg)\n\nLead with **emphasis**.\n\n---\n\n> Quote\n\n## 2026-03-04\n\n![a](/a.jpg)\n![b](/b.jpg)\n\nLater lead.`,
      'content/2026.md',
      2026
    );

    expect(posts).toHaveLength(2);
    expect(posts[0].images).toHaveLength(1);
    expect(posts[0].bodyNodes.map((node) => node.type)).toEqual(['thematicBreak', 'blockquote']);
    expect(posts[1].images).toHaveLength(2);
  });

  it('rejects impossible, malformed, duplicate, and wrong-year dates', () => {
    expect(() => parseYearSource('## 2026-02-30\n\nText', 'bad.md', 2026)).toThrow('不存在');
    expect(() => parseYearSource('## 2026/02/03\n\nText', 'bad.md', 2026)).toThrow('YYYY-MM-DD');
    expect(() =>
      parseYearSource('## 2026-02-03\n\nA\n\n## 2026-02-03\n\nB', 'bad.md', 2026)
    ).toThrow('重复');
    expect(() => parseYearSource('## 2025-02-03\n\nText', '2026.md', 2026)).toThrow('不一致');
  });

  it('rejects empty posts and more than two opening images', () => {
    expect(() => parseYearSource('## 2026-02-03', 'bad.md', 2026)).toThrow('没有任何内容');
    expect(() =>
      parseYearSource(
        '## 2026-02-03\n\n![a](/a.jpg)\n![b](/b.jpg)\n![c](/c.jpg)',
        'bad.md',
        2026
      )
    ).toThrow('最多允许两张');

    expect(() =>
      parseYearSource(
        '## 2026-02-03\n\nLead first.\n\n![a](/a.jpg)',
        'bad.md',
        2026
      )
    ).toThrow('必须紧跟日期标题');
  });
});

describe('image dimension reader', () => {
  it('reads the primary HEIC size instead of the embedded thumbnail', () => {
    const photo = heicFile([ispe(320, 213), ispe(4032, 3024)]);
    expect(readImageDimensions(photo)).toEqual({ width: 4032, height: 3024 });
  });

  it('swaps HEIC axes when irot requests a quarter turn', () => {
    const rotated = heicFile([ispe(4032, 3024), isoBox('irot', new Uint8Array([1]))]);
    expect(readImageDimensions(rotated)).toEqual({ width: 3024, height: 4032 });

    const unrotated = heicFile([ispe(4032, 3024), isoBox('irot', new Uint8Array([0]))]);
    expect(readImageDimensions(unrotated)).toEqual({ width: 4032, height: 3024 });
  });

  it('ignores data that is not a HEIC container', () => {
    expect(readImageDimensions(new Uint8Array(32))).toBeUndefined();
  });
});

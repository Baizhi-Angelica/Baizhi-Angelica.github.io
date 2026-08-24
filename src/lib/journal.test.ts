import { describe, expect, it } from 'vitest';
import { parseYearSource } from './journal';

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

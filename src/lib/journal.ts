import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Heading, Image, Root, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const PROJECT_ROOT = process.cwd();
const CONTENT_DIR = path.join(PROJECT_ROOT, 'content');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface JournalImage {
  src: string;
  alt: string;
  title?: string | null;
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
}

interface ParsedPost {
  isoDate: string;
  epoch: number;
  year: number;
  month: number;
  day: number;
  images: JournalImage[];
  leadNodes: RootContent[];
  bodyNodes: RootContent[];
  sourceName: string;
}

export interface JournalPost extends Omit<ParsedPost, 'leadNodes' | 'bodyNodes'> {
  leadHtml: string;
  bodyHtml: string;
}

export interface JournalYear {
  year: number;
  posts: JournalPost[];
  months: Array<{
    month: number;
    id: string;
    posts: JournalPost[];
  }>;
}

export interface Journal {
  years: JournalYear[];
  latestYear: number;
}

function contentError(sourceName: string, message: string, line?: number): Error {
  const location = line ? `${sourceName}:${line}` : sourceName;
  return new Error(`[journal] ${location} — ${message}`);
}

function warning(sourceName: string, message: string, line?: number): void {
  const location = line ? `${sourceName}:${line}` : sourceName;
  console.warn(`[journal] WARNING ${location} — ${message}`);
}

function parseStrictDate(value: string, sourceName: string, line?: number) {
  if (!DATE_PATTERN.test(value)) {
    throw contentError(sourceName, `H2 标题必须是 YYYY-MM-DD，收到“${value || '(空标题)'}”`, line);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    throw contentError(sourceName, `日期“${value}”不存在，请检查月份、日期或闰年`, line);
  }

  return { year, month, day, epoch: date.getTime() };
}

function isHeading(node: RootContent): node is Heading {
  return node.type === 'heading';
}

function imagesFromParagraph(node: RootContent): Image[] | undefined {
  if (node.type !== 'paragraph') return undefined;

  const meaningful = node.children.filter(
    (child) => child.type !== 'text' || child.value.trim().length > 0
  );
  if (meaningful.length === 0 || !meaningful.every((child) => child.type === 'image')) {
    return undefined;
  }
  return meaningful as Image[];
}

function collectImages(nodes: RootContent[]): Image[] {
  const images: Image[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as { type?: string; children?: unknown[] };
    if (candidate.type === 'image') images.push(node as Image);
    candidate.children?.forEach(visit);
  };

  nodes.forEach(visit);
  return images;
}

function splitPostBody(nodes: RootContent[], sourceName: string, line?: number) {
  const images: JournalImage[] = [];
  const consumedImageParagraphs = new Set<number>();

  for (let index = 0; index < nodes.length; index += 1) {
    const paragraphImages = imagesFromParagraph(nodes[index]);
    if (!paragraphImages) break;

    consumedImageParagraphs.add(index);
    for (const image of paragraphImages) {
      images.push({ src: image.url, alt: image.alt ?? '', title: image.title });
    }
  }

  const allImages = collectImages(nodes);
  if (allImages.length > 2) {
    throw contentError(sourceName, '每篇日志最多允许两张图片', line);
  }

  if (allImages.length !== images.length) {
    throw contentError(sourceName, '图片必须紧跟日期标题并连续书写，不能放在正文中间', line);
  }

  if (images.length === 0) {
    warning(sourceName, '这篇日志没有开头主图，将使用纯文字版面', line);
  }

  const leadIndex = nodes.findIndex(
    (node, index) => !consumedImageParagraphs.has(index) && node.type === 'paragraph'
  );

  return {
    images,
    leadNodes: leadIndex >= 0 ? [nodes[leadIndex]] : [],
    bodyNodes: nodes.filter(
      (_node, index) => !consumedImageParagraphs.has(index) && index !== leadIndex
    )
  };
}

export function parseYearSource(
  source: string,
  sourceName: string,
  expectedYear?: number
): ParsedPost[] {
  const tree = unified().use(remarkParse).parse(source) as Root;
  const boundaries: Array<{ index: number; isoDate: string; line?: number }> = [];

  for (const [index, node] of tree.children.entries()) {
    if (!isHeading(node) || node.depth !== 2) continue;

    const value = toString(node).trim();
    const line = node.position?.start.line;
    parseStrictDate(value, sourceName, line);
    boundaries.push({ index, isoDate: value, line });
  }

  if (boundaries.length === 0) {
    throw contentError(sourceName, '没有找到任何 YYYY-MM-DD 格式的 H2 日志标题');
  }

  const seen = new Set<string>();
  return boundaries.map((boundary, boundaryIndex) => {
    if (seen.has(boundary.isoDate)) {
      throw contentError(sourceName, `日期“${boundary.isoDate}”重复`, boundary.line);
    }
    seen.add(boundary.isoDate);

    const parsedDate = parseStrictDate(boundary.isoDate, sourceName, boundary.line);
    if (expectedYear !== undefined && parsedDate.year !== expectedYear) {
      throw contentError(
        sourceName,
        `日期“${boundary.isoDate}”与文件年份 ${expectedYear} 不一致`,
        boundary.line
      );
    }

    const nextBoundary = boundaries[boundaryIndex + 1];
    const body = tree.children.slice(boundary.index + 1, nextBoundary?.index ?? tree.children.length);
    if (body.length === 0) {
      throw contentError(sourceName, `日期“${boundary.isoDate}”下没有任何内容`, boundary.line);
    }

    return {
      isoDate: boundary.isoDate,
      ...parsedDate,
      ...splitPostBody(body, sourceName, boundary.line),
      sourceName
    };
  });
}

async function renderNodes(nodes: RootContent[]): Promise<string> {
  if (nodes.length === 0) return '';

  const processor = unified().use(remarkRehype).use(rehypeStringify);
  const hast = await processor.run({ type: 'root', children: nodes } as Root);
  return processor.stringify(hast);
}

function readImageDimensions(data: Uint8Array): { width: number; height: number } | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ascii = (start: number, length: number) =>
    new TextDecoder('ascii').decode(data.subarray(start, start + length));

  if (data.length >= 24 && ascii(1, 3) === 'PNG') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (data.length >= 10 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  if (data.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const format = ascii(12, 4);
    if (format === 'VP8X') {
      const width = 1 + data[24] + (data[25] << 8) + (data[26] << 16);
      const height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
      return { width, height };
    }
    if (format === 'VP8 ' && data.length >= 30) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff
      };
    }
    if (format === 'VP8L' && data.length >= 25) {
      return {
        width: 1 + data[21] + ((data[22] & 0x3f) << 8),
        height: 1 + (data[22] >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10)
      };
    }
  }

  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (data[offset] === 0xff) offset += 1;
      const marker = data[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > data.length) break;
      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > data.length) break;
      if (startOfFrame.has(marker)) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += segmentLength;
    }
  }

  const prefix = new TextDecoder('utf8').decode(data.subarray(0, Math.min(data.length, 8192)));
  if (/^\s*<svg\b/i.test(prefix) || /<svg\b/i.test(prefix)) {
    const svgTag = prefix.match(/<svg\b[^>]*>/i)?.[0];
    const width = svgTag?.match(/\bwidth=["']([\d.]+)/i)?.[1];
    const height = svgTag?.match(/\bheight=["']([\d.]+)/i)?.[1];
    if (width && height) return { width: Number(width), height: Number(height) };

    const viewBox = svgTag?.match(/\bviewBox=["']([^"']+)["']/i)?.[1];
    const viewBoxParts = viewBox?.trim().split(/[\s,]+/).map(Number);
    if (viewBoxParts?.length === 4 && viewBoxParts.every(Number.isFinite)) {
      return { width: viewBoxParts[2], height: viewBoxParts[3] };
    }
  }

  return undefined;
}

async function addImageDimensions(image: JournalImage, sourceName: string): Promise<JournalImage> {
  if (!image.src.startsWith('/') || image.src.startsWith('//')) return image;

  const cleanPath = image.src.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  const diskPath = path.resolve(PUBLIC_DIR, cleanPath);
  if (!diskPath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    warning(sourceName, `图片路径越过 public 目录：“${image.src}”`);
    return image;
  }

  try {
    const dimensions = readImageDimensions(await readFile(diskPath));
    if (!dimensions?.width || !dimensions.height) {
      warning(sourceName, `无法读取图片尺寸，将不写入 width/height：“${image.src}”`);
      return image;
    }

    const orientation =
      dimensions.width > dimensions.height
        ? 'landscape'
        : dimensions.width < dimensions.height
          ? 'portrait'
          : 'square';

    return { ...image, width: dimensions.width, height: dimensions.height, orientation };
  } catch {
    warning(sourceName, `找不到或无法读取图片：“${image.src}”`);
    return image;
  }
}

export async function loadJournal(): Promise<Journal> {
  const fileNames = (await readdir(CONTENT_DIR))
    .filter((fileName) => /^\d{4}\.md$/.test(fileName))
    .sort();

  if (fileNames.length === 0) {
    throw contentError('content/', '至少需要一个 YYYY.md 年份文件');
  }

  const parsed = (
    await Promise.all(
      fileNames.map(async (fileName) => {
        const source = await readFile(path.join(CONTENT_DIR, fileName), 'utf8');
        return parseYearSource(source, `content/${fileName}`, Number.parseInt(fileName, 10));
      })
    )
  ).flat();

  const globallySeen = new Set<string>();
  for (const post of parsed) {
    if (globallySeen.has(post.isoDate)) {
      throw contentError(post.sourceName, `日期“${post.isoDate}”在多个年份文件中重复`);
    }
    globallySeen.add(post.isoDate);
  }

  parsed.sort((a, b) => b.epoch - a.epoch);
  const hydrated = await Promise.all(
    parsed.map(async (post): Promise<JournalPost> => ({
      ...post,
      images: await Promise.all(
        post.images.map((image) => addImageDimensions(image, post.sourceName))
      ),
      leadHtml: await renderNodes(post.leadNodes),
      bodyHtml: await renderNodes(post.bodyNodes)
    }))
  );

  const years = [...new Set(hydrated.map((post) => post.year))]
    .sort((a, b) => b - a)
    .map((year): JournalYear => {
      const posts = hydrated.filter((post) => post.year === year);
      const monthNumbers = [...new Set(posts.map((post) => post.month))].sort((a, b) => b - a);
      return {
        year,
        posts,
        months: monthNumbers.map((month) => ({
          month,
          id: `${year}-${String(month).padStart(2, '0')}`,
          posts: posts.filter((post) => post.month === month)
        }))
      };
    });

  return { years, latestYear: years[0].year };
}

export async function loadAbout(): Promise<string> {
  const source = await readFile(path.join(CONTENT_DIR, 'about.md'), 'utf8');
  const tree = unified().use(remarkParse).parse(source) as Root;
  return renderNodes(tree.children);
}

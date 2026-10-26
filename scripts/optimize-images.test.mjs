import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomFillSync } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { optimizePhotos } from './optimize-images.mjs';

sharp.cache(false);

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('photo optimizer', () => {
  it('archives the original, creates WebP, and rewrites Markdown automatically', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'journal-photo-'));
    temporaryDirectories.push(root);
    const imageDirectory = path.join(root, 'public', 'images', '2026');
    const contentDirectory = path.join(root, 'content');
    await mkdir(imageDirectory, { recursive: true });
    await mkdir(contentDirectory, { recursive: true });

    const imagePath = path.join(imageDirectory, 'photo.JPG');
    const width = 2400;
    const height = 1800;
    const pixels = randomFillSync(Buffer.allocUnsafe(width * height * 3));
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 100 })
      .toFile(imagePath);
    await writeFile(
      path.join(contentDirectory, '2026.md'),
      '## 2026-08-23\n\n![photo](/images/2026/photo.JPG)\n\nText.\n',
      'utf8'
    );
    const originalBytes = (await stat(imagePath)).size;

    const result = await optimizePhotos(root, { log: () => {} });
    expect(result.processed).toHaveLength(1);
    await expect(stat(imagePath)).rejects.toThrow();
    expect(await stat(path.join(root, '.photos-src', '2026', 'photo.JPG'))).toBeTruthy();

    const webPath = path.join(imageDirectory, 'photo.webp');
    expect(await stat(webPath)).toBeTruthy();
    const webMetadata = await sharp(webPath).metadata();
    expect(webMetadata.width).toBe(width);
    expect(webMetadata.height).toBe(height);
    expect((await stat(webPath)).size).toBeLessThan(originalBytes);
    expect((await stat(webPath)).size).toBeGreaterThanOrEqual(2 * 1024 * 1024);
    expect(await readFile(path.join(contentDirectory, '2026.md'), 'utf8')).toContain(
      '/images/2026/photo.webp'
    );

    const second = await optimizePhotos(root, { log: () => {} });
    expect(second.processed).toHaveLength(0);
  });

  it('stops before touching an unreferenced original', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'journal-photo-'));
    temporaryDirectories.push(root);
    const imageDirectory = path.join(root, 'public', 'images', '2026');
    const contentDirectory = path.join(root, 'content');
    await mkdir(imageDirectory, { recursive: true });
    await mkdir(contentDirectory, { recursive: true });
    const imagePath = path.join(imageDirectory, 'orphan.JPG');
    await sharp({ create: { width: 100, height: 100, channels: 3, background: '#777' } })
      .jpeg()
      .toFile(imagePath);
    await writeFile(path.join(contentDirectory, '2026.md'), '# 2026\n', 'utf8');

    await expect(optimizePhotos(root, { log: () => {} })).rejects.toThrow('not referenced');
    expect(await stat(imagePath)).toBeTruthy();
  });

  it('publishes HEIC photos untouched and leaves the Markdown path alone', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'journal-photo-'));
    temporaryDirectories.push(root);
    const imageDirectory = path.join(root, 'public', 'images', '2026');
    const contentDirectory = path.join(root, 'content');
    await mkdir(imageDirectory, { recursive: true });
    await mkdir(contentDirectory, { recursive: true });

    const imagePath = path.join(imageDirectory, 'IMG_0001.HEIC');
    // HEIC must never be decoded here, so opaque bytes are enough to prove passthrough.
    const payload = Buffer.from('heic-passthrough-payload');
    await writeFile(imagePath, payload);
    const markdownPath = path.join(contentDirectory, '2026.md');
    const markdown = '## 2026-08-30\n\n![heic](/images/2026/IMG_0001.HEIC)\n\nText.\n';
    await writeFile(markdownPath, markdown, 'utf8');

    const result = await optimizePhotos(root, { log: () => {} });
    expect(result.processed).toHaveLength(0);
    expect(result.passthrough).toHaveLength(1);
    expect(await readFile(imagePath)).toEqual(payload);
    await expect(stat(path.join(imageDirectory, 'IMG_0001.webp'))).rejects.toThrow();
    await expect(stat(path.join(root, '.photos-src', '2026', 'IMG_0001.HEIC'))).rejects.toThrow();
    expect(await readFile(markdownPath, 'utf8')).toBe(markdown);

    const second = await optimizePhotos(root, { log: () => {} });
    expect(second.processed).toHaveLength(0);
  });

  it('still blocks a HEIC photo that no journal entry references', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'journal-photo-'));
    temporaryDirectories.push(root);
    const imageDirectory = path.join(root, 'public', 'images', '2026');
    const contentDirectory = path.join(root, 'content');
    await mkdir(imageDirectory, { recursive: true });
    await mkdir(contentDirectory, { recursive: true });
    const imagePath = path.join(imageDirectory, 'orphan.HEIC');
    await writeFile(imagePath, Buffer.from('heic-passthrough-payload'));
    await writeFile(path.join(contentDirectory, '2026.md'), '# 2026\n', 'utf8');

    await expect(optimizePhotos(root, { log: () => {} })).rejects.toThrow('not referenced');
    expect(await stat(imagePath)).toBeTruthy();
  });
});

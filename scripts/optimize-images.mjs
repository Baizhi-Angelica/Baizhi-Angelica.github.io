import { access, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const MASTER_LONG_EDGE = 3200;
const WEBP_QUALITY = 88;
const MIN_WEB_BYTES = 2 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const UNSUPPORTED_CAMERA_EXTENSIONS = new Set(['.bmp', '.gif', '.heic', '.heif', '.tif', '.tiff']);

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function encodeWebp(inputPath, options = {}) {
  let pipeline = sharp(inputPath, { failOn: 'warning' }).autoOrient();
  if (options.longEdge) {
    pipeline = pipeline.resize({
      width: options.longEdge,
      height: options.longEdge,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3'
    });
  }
  return pipeline
    .webp({
      quality: options.quality ?? WEBP_QUALITY,
      alphaQuality: 90,
      effort: 6,
      smartSubsample: true
    })
    .toBuffer({ resolveWithObject: true });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  if (!(await exists(directory))) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

async function uniqueArchivePath(preferredPath) {
  if (!(await exists(preferredPath))) return preferredPath;
  const extension = path.extname(preferredPath);
  const stem = preferredPath.slice(0, -extension.length);
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${stem}-${suffix}${extension}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Too many archived files share the name: ${path.basename(preferredPath)}`);
}

export async function optimizePhotos(rootDirectory = process.cwd(), options = {}) {
  const log = options.log ?? console.log;
  const imagesDirectory = path.join(rootDirectory, 'public', 'images');
  const contentDirectory = path.join(rootDirectory, 'content');
  const archiveDirectory = path.join(rootDirectory, '.photos-src');
  const imageFiles = await walk(imagesDirectory);

  const unsupported = imageFiles.filter((filePath) =>
    UNSUPPORTED_CAMERA_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported photo format. Export these files as JPG first:\n${unsupported
        .map((filePath) => `- ${path.relative(rootDirectory, filePath)}`)
        .join('\n')}`
    );
  }

  const sources = imageFiles.filter((filePath) =>
    SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  );
  if (sources.length === 0) {
    log('No new JPG or PNG photos to optimize.');
    return { processed: [] };
  }

  const markdownFiles = (await readdir(contentDirectory))
    .filter((fileName) => fileName.toLowerCase().endsWith('.md'))
    .map((fileName) => path.join(contentDirectory, fileName));
  const markdown = new Map(
    await Promise.all(
      markdownFiles.map(async (filePath) => [filePath, await readFile(filePath, 'utf8')])
    )
  );

  const jobs = [];
  for (const inputPath of sources) {
    const relativePath = path.relative(imagesDirectory, inputPath);
    const publicPath = relativePath.replaceAll('\\', '/');
    const extension = path.extname(relativePath);
    const webRelativePath = `${relativePath.slice(0, -extension.length)}.webp`;
    const outputPath = path.join(imagesDirectory, webRelativePath);
    const oldUrl = `/images/${publicPath}`;
    const newUrl = `/images/${webRelativePath.replaceAll('\\', '/')}`;
    const referencedBy = [...markdown.entries()]
      .filter(([, source]) => source.includes(oldUrl))
      .map(([filePath]) => filePath);

    if (referencedBy.length === 0) {
      throw new Error(`Photo is not referenced by any content Markdown file: ${publicPath}`);
    }
    if (await exists(outputPath)) {
      throw new Error(`WebP output already exists. Rename the new original first: ${newUrl}`);
    }

    jobs.push({
      inputPath,
      outputPath,
      relativePath,
      publicPath,
      oldUrl,
      newUrl,
      referencedBy
    });
  }

  const encoded = [];
  for (const job of jobs) {
    log(`Optimizing ${job.publicPath}...`);
    const inputBytes = (await stat(job.inputPath)).size;

    if (inputBytes <= MIN_WEB_BYTES) {
      log(`  Already ${formatBytes(inputBytes)}; keeping the original because it is below the 2 MB floor.`);
      continue;
    }

    let output;
    for (const settings of [
      { longEdge: MASTER_LONG_EDGE },
      {},
      { quality: 95 },
      { quality: 100 }
    ]) {
      const candidate = await encodeWebp(job.inputPath, settings);
      if (candidate.data.length >= MIN_WEB_BYTES) {
        output = candidate;
        break;
      }
    }

    if (!output) {
      log('  WebP would fall below 2 MB even at maximum quality; keeping the original unchanged.');
      continue;
    }
    encoded.push({ ...job, inputBytes, output });
  }

  const processed = [];
  for (const job of encoded) {
    const preferredArchivePath = path.join(archiveDirectory, job.relativePath);
    await mkdir(path.dirname(preferredArchivePath), { recursive: true });
    const archivePath = await uniqueArchivePath(preferredArchivePath);
    await rename(job.inputPath, archivePath);
    await writeFile(job.outputPath, job.output.data);

    for (const markdownPath of job.referencedBy) {
      markdown.set(markdownPath, markdown.get(markdownPath).replaceAll(job.oldUrl, job.newUrl));
    }

    const savedPercent = Math.max(0, 100 - (job.output.data.length / job.inputBytes) * 100);
    log(
      `  ${formatBytes(job.inputBytes)} -> ${formatBytes(job.output.data.length)} ` +
      `(${savedPercent.toFixed(1)}% smaller, ${job.output.info.width}x${job.output.info.height})`
    );
    log(`  Markdown: ${job.oldUrl} -> ${job.newUrl}`);
    log(`  Original archived locally: ${path.relative(rootDirectory, archivePath)}`);
    processed.push({
      oldUrl: job.oldUrl,
      newUrl: job.newUrl,
      inputBytes: job.inputBytes,
      outputBytes: job.output.data.length,
      width: job.output.info.width,
      height: job.output.info.height,
      archivePath
    });
  }

  for (const [markdownPath, source] of markdown) {
    await writeFile(markdownPath, source, 'utf8');
  }

  log(`Photo optimization complete: ${processed.length} photo(s) converted to WebP.`);
  return { processed };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  optimizePhotos().catch((error) => {
    console.error('Photo optimization failed. Nothing will be committed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

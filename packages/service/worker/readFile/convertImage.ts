import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getLogger, LogCategories } from '../../common/logger';

const logger = getLogger(LogCategories.INFRA.WORKER);

/** MIME types for EMF/WMF formats that browsers cannot render */
const UNSUPPORTED_MIME_TYPES = new Set(['image/x-emf', 'image/emf', 'image/x-wmf', 'image/wmf']);

export const isUnsupportedImageMime = (mime: string): boolean => {
  return UNSUPPORTED_MIME_TYPES.has(mime?.toLowerCase());
};

const execFilePromise = (cmd: string, args: string[], timeout = 30000): Promise<void> => {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

/**
 * Convert EMF/WMF base64 image data to PNG using available system tools.
 * Tries multiple converters in order, returns the first successful result.
 *
 * @returns Converted { base64, mime } or null if conversion failed
 */
export const convertUnsupportedImageToPng = async (
  base64Data: string,
  mime: string
): Promise<{ base64: string; mime: string } | null> => {
  const isWmf = mime.includes('wmf');
  const ext = isWmf ? 'wmf' : 'emf';
  const tmpDir = os.tmpdir();
  const inputId = `fastgpt-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(tmpDir, `${inputId}.${ext}`);
  const outputPath = path.join(tmpDir, `${inputId}.png`);

  try {
    // Write base64 to temp file
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(inputPath, buffer);

    // Try converters in order: Inkscape, ImageMagick, LibreOffice
    const converters: { name: string; cmd: string; args: string[] }[] = [
      {
        name: 'inkscape',
        cmd: 'inkscape',
        args: ['--export-type=png', `--export-filename=${outputPath}`, inputPath]
      },
      {
        name: 'imagemagick',
        cmd: 'magick',
        args: [inputPath, outputPath]
      },
      {
        name: 'imagemagick-v6',
        cmd: 'convert',
        args: [inputPath, outputPath]
      },
      {
        name: 'libreoffice',
        cmd: 'libreoffice',
        args: ['--headless', '--convert-to', 'png', '--outdir', tmpDir, inputPath]
      }
    ];

    let converted = false;
    for (const { name, cmd, args } of converters) {
      try {
        logger.debug(`Attempting EMF/WMF→PNG conversion with ${name}`, { mime, inputPath });
        await execFilePromise(cmd, args);

        // Check if output file was created
        const stat = await fs.stat(outputPath).catch(() => null);
        if (stat && stat.size > 0) {
          converted = true;
          logger.info(`EMF/WMF→PNG conversion succeeded with ${name}`, {
            mime,
            originalSize: buffer.length,
            convertedSize: stat.size
          });
          break;
        }
      } catch {
        // This converter failed or is not installed, try the next one
        logger.debug(`Converter ${name} failed or not available, trying next`, { mime });
      }
    }

    if (!converted) {
      logger.warn('All EMF/WMF→PNG converters failed, image will be replaced with placeholder', {
        mime
      });
      return null;
    }

    // Read converted PNG
    const pngBuffer = await fs.readFile(outputPath);
    const pngBase64 = pngBuffer.toString('base64');

    return {
      base64: pngBase64,
      mime: 'image/png'
    };
  } catch (error) {
    logger.error('EMF/WMF→PNG conversion error', { mime, error });
    return null;
  } finally {
    // Clean up temp files
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    // LibreOffice creates output as inputPath + '.png' in current dir
    const libreOfficeOutput = `${inputPath}.png`;
    await fs.unlink(libreOfficeOutput).catch(() => {});
  }
};

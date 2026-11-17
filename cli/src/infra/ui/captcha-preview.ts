import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Prompter } from './prompter';

export type CaptchaPreviewHandle = {
  captchaPath: string;
  opened: boolean;
  cleanup: () => Promise<void>;
};

export type CaptchaPreviewer = (params: {
  captchaImage: string;
  prompter: Prompter;
}) => Promise<CaptchaPreviewHandle>;

function decodeCaptchaDataUrl(captchaImage: string): { ext: string; buffer: Buffer } {
  const match = captchaImage.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (match) {
    const rawExt = match[1].toLowerCase().replace('+xml', '');
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    return {
      ext,
      buffer: Buffer.from(match[2], 'base64')
    };
  }
  return {
    ext: 'png',
    buffer: Buffer.from(captchaImage, 'base64')
  };
}

/**
 * 将 2FA 图片验证码落盘到 `0600` 临时文件并尝试通过系统默认查看器打开，返回清理句柄。
 */
export function createTempFileCaptchaPreviewer({
  openExternal
}: {
  openExternal?: (targetPath: string) => Promise<boolean>;
}): CaptchaPreviewer {
  return async ({ captchaImage, prompter }) => {
    const { ext, buffer } = decodeCaptchaDataUrl(captchaImage);
    const tempDir = await mkdtemp(join(tmpdir(), 'fastgpt-captcha-'));
    const captchaPath = join(tempDir, `captcha.${ext}`);

    const cleanup = async () => {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    };

    try {
      await writeFile(captchaPath, buffer, { mode: 0o600 });
      if (process.platform !== 'win32') {
        await chmod(captchaPath, 0o600).catch(() => {});
      }
      const opened = (await openExternal?.(captchaPath)) ?? false;
      prompter.note(
        opened ? `Opened captcha image: ${captchaPath}` : `Captcha image saved at: ${captchaPath}`,
        '2FA Captcha'
      );
      return { captchaPath, opened, cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  };
}

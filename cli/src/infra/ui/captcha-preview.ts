import type { Prompter } from './prompter';
import type {
  PuzzleCaptchaChallenge,
  PuzzleCaptchaSubmission,
  PuzzleCaptchaResult
} from '@fastgpt/global/support/user/account/captcha/type';
import { createPuzzlePreview } from './puzzle-preview';

export type CaptchaPreviewHandle = {
  url: string;
  opened: boolean;
  solution: Promise<string>;
  cleanup: () => Promise<void>;
};

export type CaptchaPreviewer = (params: {
  challenge: PuzzleCaptchaChallenge;
  getCaptcha: () => Promise<PuzzleCaptchaChallenge>;
  verify: (submission: PuzzleCaptchaSubmission) => Promise<PuzzleCaptchaResult>;
  prompter: Prompter;
}) => Promise<CaptchaPreviewHandle>;

/** 在本地浏览器打开旋转验证页面，所有验证请求由 CLI 代理到 FastGPT 服务端。 */
export function createBrowserCaptchaPreviewer({
  openExternal
}: {
  openExternal?: (url: string) => Promise<boolean>;
}): CaptchaPreviewer {
  return async ({ challenge, getCaptcha, verify, prompter }) => {
    const preview = await createPuzzlePreview({ challenge, getCaptcha, verify });
    try {
      const opened = (await openExternal?.(preview.url)) ?? false;
      prompter.note(
        `Turn the image upright in your browser: ${preview.url}`,
        'Security verification'
      );
      return { url: preview.url, opened, solution: preview.solution, cleanup: preview.cleanup };
    } catch (error) {
      await preview.cleanup();
      throw error;
    }
  };
}

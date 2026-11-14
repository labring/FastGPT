import { describe, expect, it, vi } from 'vitest';
import { createPuzzlePreview } from '../../../src/infra/ui/puzzle-preview';
import type { PuzzleCaptchaResult } from '@fastgpt/global/support/user/account/captcha/type';
const challenge = {
  challengeId: 'a'.repeat(64),
  captchaImage: 'data:image/png;base64,AAAA',
  mode: 'rotate' as const,
  width: 224,
  height: 224,
  expiresAt: new Date(Date.now() + 300_000).toISOString()
};
const submission = {
  challengeId: challenge.challengeId,
  angle: 100,
  track: [0, 25, 50, 75, 100].map((x, i) => ({ x, y: 0, t: i * 150 }))
};

describe('CLI puzzle preview', () => {
  it('keeps the image for two retries and loads a fresh challenge after the third failure', async () => {
    const fresh = { ...challenge, challengeId: 'c'.repeat(64) };
    const getCaptcha = vi.fn(async () => fresh);
    const verify = vi
      .fn<() => Promise<PuzzleCaptchaResult>>()
      .mockResolvedValueOnce({ status: 'retry', remainingAttempts: 2 })
      .mockResolvedValueOnce({ status: 'retry', remainingAttempts: 1 })
      .mockResolvedValueOnce({ status: 'refreshRequired' })
      .mockResolvedValueOnce({ status: 'passed', captcha: 'b'.repeat(64) });
    const preview = await createPuzzlePreview({ challenge, getCaptcha, verify });
    try {
      await fetch(preview.url);
      for (const expected of ['retry', 'retry', 'refreshRequired']) {
        const response = await fetch(preview.url, {
          method: 'POST',
          body: JSON.stringify(submission)
        });
        expect((await response.json()).status).toBe(expected);
      }
      expect(getCaptcha).not.toHaveBeenCalled();
      expect(await (await fetch(preview.url)).text()).toContain(fresh.challengeId);
      expect(getCaptcha).toHaveBeenCalledOnce();
      await fetch(preview.url, {
        method: 'POST',
        body: JSON.stringify({ ...submission, challengeId: fresh.challengeId })
      });
      expect(await preview.solution).toBe('b'.repeat(64));
    } finally {
      await preview.cleanup();
    }
  });
  it('isolates the local callback and resolves one server-verified proof', async () => {
    const verify = vi.fn(async () => ({ status: 'passed' as const, captcha: 'b'.repeat(64) }));
    const preview = await createPuzzlePreview({
      challenge,
      verify,
      getCaptcha: async () => challenge
    });
    try {
      expect((await fetch(preview.url)).headers.get('content-security-policy')).toContain(
        "frame-ancestors 'none'"
      );
      expect((await fetch(new URL('/wrong', preview.url))).status).toBe(403);
      expect(
        (
          await fetch(preview.url, {
            method: 'POST',
            headers: { Origin: 'https://example.com' },
            body: JSON.stringify(submission)
          })
        ).status
      ).toBe(403);
      expect(verify).not.toHaveBeenCalled();
      expect(
        (await fetch(preview.url, { method: 'POST', body: JSON.stringify(submission) })).status
      ).toBe(200);
      expect(await preview.solution).toBe('b'.repeat(64));
      expect(
        (await fetch(preview.url, { method: 'POST', body: JSON.stringify(submission) })).status
      ).toBe(409);
      expect(verify).toHaveBeenCalledOnce();
    } finally {
      await preview.cleanup();
    }
  });
  it('rejects a substituted challenge without contacting the business server', async () => {
    const verify = vi.fn(async () => ({ status: 'passed' as const, captcha: 'b'.repeat(64) }));
    const preview = await createPuzzlePreview({
      challenge,
      verify,
      getCaptcha: async () => challenge
    });
    try {
      expect(
        (
          await fetch(preview.url, {
            method: 'POST',
            body: JSON.stringify({ ...submission, challengeId: 'c'.repeat(64) })
          })
        ).status
      ).toBe(400);
      await expect(preview.solution).rejects.toThrow('Image rotation verification failed');
      expect(verify).not.toHaveBeenCalled();
    } finally {
      await preview.cleanup();
    }
  });
});

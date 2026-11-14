import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { PUZZLE_CAPTCHA_BACKGROUNDS } from '@fastgpt/service/support/user/account/captcha/constants';
import { describe, expect, it } from 'vitest';
import {
  renderPuzzleCaptcha,
  isPlausiblePuzzleTrack
} from '@fastgpt/service/support/user/account/captcha/utils';

describe('built-in captcha background catalog', () => {
  it('ships exactly 100 distinct 224x224 WebP images below 40KB', async () => {
    expect(PUZZLE_CAPTCHA_BACKGROUNDS).toHaveLength(100);
    const hashes = new Set<string>();
    for (const image of PUZZLE_CAPTCHA_BACKGROUNDS) {
      expect(image).toMatch(/^data:image\/webp;base64,/);
      const buffer = Buffer.from(image.split(',')[1], 'base64');
      expect(buffer.byteLength).toBeLessThan(40_000);
      expect(await sharp(buffer).metadata()).toMatchObject({
        format: 'webp',
        width: 224,
        height: 224
      });
      hashes.add(createHash('sha256').update(buffer).digest('hex'));
    }
    expect(hashes.size).toBe(100);
  });
});

describe('renderPuzzleCaptcha', () => {
  it('returns a fixed-size circular raster with an answer kept separate from display data', async () => {
    const image = await renderPuzzleCaptcha();
    const buffer = Buffer.from(image.captchaImage.split(',')[1], 'base64');
    expect(await sharp(buffer).metadata()).toMatchObject({
      format: 'png',
      width: 224,
      height: 224,
      hasAlpha: true
    });
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect([alpha(0, 0), alpha(223, 0), alpha(0, 223), alpha(223, 223)]).toEqual([0, 0, 0, 0]);
    expect(alpha(112, 112)).toBe(255);
    // 圆形边缘保留抗锯齿透明度，避免缓存原始蒙版后出现锯齿或不透明方框。
    expect(alpha(32, 32)).toBeGreaterThan(0);
    expect(alpha(32, 32)).toBeLessThan(255);
    expect(image.mode).toBe('rotate');
    expect(image.angle).toBeGreaterThanOrEqual(45);
    expect(image.angle).toBeLessThanOrEqual(315);
    expect(image).not.toHaveProperty('pieceImage');
    expect(buffer.includes(Buffer.from('<svg'))).toBe(false);
  });
});

describe('isPlausiblePuzzleTrack', () => {
  const valid = {
    challengeId: 'a'.repeat(64),
    angle: 140,
    track: [0, 30, 65, 100, 140].map((x, i) => ({ x, y: 0, t: i * 150 }))
  };
  it('accepts a horizontal drag or keyboard trajectory', () => {
    expect(isPlausiblePuzzleTrack({ submission: valid, elapsed: 800 })).toBe(true);
  });
  it.each([
    { ...valid, track: [] },
    { ...valid, angle: -1 },
    { ...valid, angle: 361 },
    { ...valid, angle: NaN },
    { ...valid, track: valid.track.map((p) => ({ ...p, x: 140 })) },
    { ...valid, track: valid.track.map((p, i) => ({ ...p, t: i === 2 ? 10 : p.t })) },
    { ...valid, track: valid.track.map((p, i) => ({ ...p, x: i === 2 ? NaN : p.x })) }
  ])('rejects malformed or implausible movements', (submission) => {
    expect(isPlausiblePuzzleTrack({ submission, elapsed: 800 })).toBe(false);
  });
});

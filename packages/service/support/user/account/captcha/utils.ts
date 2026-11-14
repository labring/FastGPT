import { randomInt } from 'node:crypto';
import sharp from 'sharp';
import { PUZZLE_CAPTCHA_BACKGROUNDS } from './constants';
import type { PuzzleCaptchaSubmission } from '@fastgpt/global/support/user/account/captcha/type';

export const PuzzleCaptchaSize = { width: 224, height: 224 } as const;

/**
 * 服务端随机选择方向明确的插画，烘焙初始旋转后裁成圆形 PNG。
 * 只下发已旋转的位图；原图、初始角度和转正答案都留在服务端，前端仅追加用户旋转。
 * 初始偏转避开正向附近，完整旋转后再居中裁切，确保物件和圆形边缘不会被方框截断。
 */
export const renderPuzzleCaptcha = async () => {
  const { width, height } = PuzzleCaptchaSize;
  const initialAngle = randomInt(45, 316);
  const image = PUZZLE_CAPTCHA_BACKGROUNDS[randomInt(0, PUZZLE_CAPTCHA_BACKGROUNDS.length)];
  const rotated = await sharp(Buffer.from(image.split(',')[1], 'base64'))
    .flop(randomInt(0, 2) === 1)
    .modulate({ brightness: randomInt(96, 105) / 100, saturation: randomInt(94, 107) / 100 })
    .rotate(initialAngle, { background: '#F4F2ED' })
    .png()
    .toBuffer({ resolveWithObject: true });

  // 旋转后画布会扩大，使用 extract 而非 resize，保持物件的尺寸与圆心不变。
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="224" height="224"><circle cx="112" cy="112" r="112" fill="white"/></svg>`
  );
  const circularImage = await sharp(rotated.data)
    .extract({
      left: Math.floor((rotated.info.width - width) / 2),
      top: Math.floor((rotated.info.height - height) / 2),
      width,
      height
    })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return {
    angle: 360 - initialAngle,
    mode: 'rotate' as const,
    ...PuzzleCaptchaSize,
    captchaImage: `data:image/png;base64,${circularImage.toString('base64')}`
  };
};

/** 基础拖动合理性检查：拒绝瞬移、倒序时间和伪造终点，不把轨迹当作强身份凭证。 */
export const isPlausiblePuzzleTrack = ({
  submission,
  elapsed
}: {
  submission: PuzzleCaptchaSubmission;
  elapsed: number;
}) => {
  const { track, angle } = submission;
  if (!Number.isFinite(angle) || angle < 0 || angle > 360) return false;
  const first = track[0];
  const last = track.at(-1);
  if (!first || !last || track.length < 5 || track.length > 256) return false;
  if (Math.abs(first.x) > 2 || first.t !== 0 || last.t < 300 || last.t > 120_000) return false;
  // 服务端经过的时间必须覆盖拖动耗时；只容忍很小的节点时钟差，不能凭空伪造整段拖动时间。
  if (last.t > elapsed + 100 || Math.abs(last.x - angle) > 2) return false;
  if (new Set(track.map((point) => Math.round(point.x))).size < 4) return false;

  return track.every((point, index) => {
    if (![point.x, point.y, point.t].every(Number.isFinite)) return false;
    if (index === 0) return true;
    const previous = track[index - 1];
    const dt = point.t - previous.t;
    return dt >= 0 && Math.abs(point.x - previous.x) <= Math.max(6, dt * 4);
  });
};

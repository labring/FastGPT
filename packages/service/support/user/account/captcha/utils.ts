import { randomInt } from 'node:crypto';
import sharp, { type Matrix3x3 } from 'sharp';
import { PUZZLE_CAPTCHA_BACKGROUNDS } from './constants';
import type { PuzzleCaptchaSubmission } from '@fastgpt/global/support/user/account/captcha/type';

export const PuzzleCaptchaSize = { width: 224, height: 224 } as const;

// 内置图片的 Base64 和圆形透明蒙版仅初始化一次，避免每次取图重复解析 Base64 和 SVG。
const backgrounds = PUZZLE_CAPTCHA_BACKGROUNDS.map((image) =>
  Buffer.from(image.split(',')[1], 'base64')
);
const circleMask = (() => {
  const { width, height } = PuzzleCaptchaSize;
  const radius = width / 2;
  const mask = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 边缘保留一个像素的抗锯齿覆盖，圆外完全透明，旋转时不显示方形画布。
      const coverage = Math.min(
        1,
        Math.max(0, radius + 0.5 - Math.hypot(x + 0.5 - radius, y + 0.5 - radius))
      );
      mask[(y * width + x) * 4 + 3] = Math.round(coverage * 255);
    }
  }
  return mask;
})();

/**
 * 服务端随机选择方向明确的插画，烘焙初始旋转后裁成圆形 PNG。
 * 只下发已旋转的位图；原图、初始角度和转正答案都留在服务端，前端仅追加用户旋转。
 * 初始偏转避开正向附近，完整旋转后再居中裁切，确保物件和圆形边缘不会被方框截断。
 */
export const renderPuzzleCaptcha = async () => {
  const { width, height } = PuzzleCaptchaSize;
  const initialAngle = randomInt(45, 316);
  const image = backgrounds[randomInt(0, backgrounds.length)];
  const flipped = randomInt(0, 2) === 1;
  const brightness = randomInt(96, 105) / 100;
  const saturation = randomInt(94, 107) / 100;
  // RGB 矩阵仍保留轻微亮度/饱和度扰动，避免 modulate 的逐像素 LCh 颜色空间转换。
  const red = (1 - saturation) * 0.2126 * brightness;
  const green = (1 - saturation) * 0.7152 * brightness;
  const blue = (1 - saturation) * 0.0722 * brightness;
  const diagonal = saturation * brightness;
  const colorMatrix: Matrix3x3 = [
    [red + diagonal, green, blue],
    [red, green + diagonal, blue],
    [red, green, blue + diagonal]
  ];
  const rotated = await sharp(image)
    .flop(flipped)
    .recomb(colorMatrix)
    .rotate(initialAngle, { background: '#F4F2ED' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 旋转后直接传递原始像素，省去中间 PNG 编码及再次解码；最终只编码一次。
  const circularImage = await sharp(rotated.data, {
    raw: { width: rotated.info.width, height: rotated.info.height, channels: rotated.info.channels }
  })
    .extract({
      left: Math.floor((rotated.info.width - width) / 2),
      top: Math.floor((rotated.info.height - height) / 2),
      width,
      height
    })
    .composite([{ input: circleMask, raw: { width, height, channels: 4 }, blend: 'dest-in' }])
    .png({ compressionLevel: 3 })
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

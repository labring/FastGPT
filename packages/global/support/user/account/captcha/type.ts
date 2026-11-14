import { z } from 'zod';
import { IntSchema, NumSchema } from '../../../../common/zod';
import { CAPTCHA_MAX_ATTEMPTS } from './constants';

export const PuzzleCaptchaChallengeSchema = z.object({
  challengeId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .meta({ description: '一次性旋转挑战 ID' }),
  mode: z.literal('rotate').meta({ description: '拖动滑块将圆形图片转正', example: 'rotate' }),
  captchaImage: z.string().meta({ description: '服务端已旋转的圆形 PNG，Base64 Data URL' }),
  width: IntSchema.positive().meta({ description: '图片原始宽度，单位像素', example: 224 }),
  height: IntSchema.positive().meta({ description: '图片原始高度，单位像素', example: 224 }),
  expiresAt: z.iso.datetime().meta({ description: '挑战过期时间' })
});
export type PuzzleCaptchaChallenge = z.infer<typeof PuzzleCaptchaChallengeSchema>;

export const PuzzleCaptchaTrackPointSchema = z.object({
  x: NumSchema.min(0).max(360).meta({ description: '滑块值，即顺时针旋转角度，单位度' }),
  y: NumSchema.min(-360).max(360).meta({ description: '相对拖动起点的纵向位移，CSS 像素' }),
  t: IntSchema.max(120_000).meta({ description: '距离拖动开始的毫秒数' })
});
export type PuzzleCaptchaTrackPoint = z.infer<typeof PuzzleCaptchaTrackPointSchema>;

export const PuzzleCaptchaSubmissionSchema = z.object({
  challengeId: PuzzleCaptchaChallengeSchema.shape.challengeId,
  angle: NumSchema.min(0).max(360).meta({
    description: '用户在初始图片上追加的顺时针旋转角度，单位度',
    example: 140
  }),
  track: z.array(PuzzleCaptchaTrackPointSchema).min(2).max(256).meta({
    description: '起点与终点之间的实际拖动轨迹；采样不足由服务端计为失败，不应伪造补点'
  })
});
export type PuzzleCaptchaSubmission = z.infer<typeof PuzzleCaptchaSubmissionSchema>;

export const CaptchaProofSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/)
  .meta({
    description: '图像验证通过后签发的短期一次性凭证，绑定账号与业务场景',
    example: 'a'.repeat(64)
  });

export const PuzzleCaptchaResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z
      .literal('passed')
      .meta({ description: '验证通过，当前图片已消费', example: 'passed' }),
    captcha: CaptchaProofSchema
  }),
  z.object({
    status: z
      .literal('retry')
      .meta({ description: '验证失败，可以继续尝试当前图片', example: 'retry' }),
    remainingAttempts: IntSchema.min(1)
      .max(CAPTCHA_MAX_ATTEMPTS - 1)
      .meta({
        description: '当前图片剩余尝试次数，由服务端计数',
        example: 2
      })
  }),
  z.object({
    status: z.literal('refreshRequired').meta({
      description: '当前图片已用尽次数、已消费或已过期，需要获取新图',
      example: 'refreshRequired'
    })
  })
]);
export type PuzzleCaptchaResult = z.infer<typeof PuzzleCaptchaResultSchema>;

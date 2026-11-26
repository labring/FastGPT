import {
  PuzzleCaptchaChallengeSchema,
  PuzzleCaptchaResultSchema
} from '../../../../../support/user/account/captcha/type';
import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { GetImgCaptchaQuerySchema, VerifyPuzzleCaptchaBodySchema } from './api';

export const CaptchaPath: OpenAPIPath = {
  '/support/user/account/captcha/getImgCaptcha': {
    get: {
      summary: '获取一次性旋转图像挑战',
      description:
        '每个服务进程最多同时生成 10 张图片，最多排队 1000 个请求；等待满 60 秒取消任务并报错，生成开始后不再计算排队超时。',
      tags: [DevApiTagsMap.userLogin],
      requestParams: { query: GetImgCaptchaQuerySchema },
      responses: {
        200: {
          description: '旋转图像挑战',
          content: { 'application/json': { schema: PuzzleCaptchaChallengeSchema } }
        },
        429: { description: '超过 IP/账号限流或图片生成等待队列已满' },
        503: { description: '图片生成排队超时，任务已移除且不会继续生成' }
      }
    }
  },
  '/support/user/account/captcha/verify': {
    post: {
      summary: '校验一次性旋转图像挑战',
      description:
        '每张图片最多尝试三次，前两次失败返回剩余次数，第三次失败需换图；成功签发 30 秒有效凭证。',
      tags: [DevApiTagsMap.userLogin],
      requestBody: { content: { 'application/json': { schema: VerifyPuzzleCaptchaBodySchema } } },
      responses: {
        200: {
          description: '验证结果：通过、重试或换图',
          content: { 'application/json': { schema: PuzzleCaptchaResultSchema } }
        }
      }
    }
  }
};

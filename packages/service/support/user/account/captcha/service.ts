import { randomBytes } from 'node:crypto';
import type {
  PuzzleCaptchaChallenge,
  PuzzleCaptchaSubmission,
  PuzzleCaptchaResult
} from '@fastgpt/global/support/user/account/captcha/type';
import {
  VerificationTtlSeconds,
  type CaptchaVerificationPurpose
} from '@fastgpt/global/support/user/account/verification/type';
import { CAPTCHA_MAX_ATTEMPTS } from '@fastgpt/global/support/user/account/captcha/constants';
import { verification } from '../../../tmpData/verification';
import {
  assertCaptchaVerificationCreateRateLimit,
  assertCaptchaVerificationConsumeRateLimit
} from '../../../../common/rateLimit/interface/accountVerification';
import { isPlausiblePuzzleTrack, renderPuzzleCaptcha } from './utils';
import { claimCaptchaAttempt } from './entity';

const defaultDependencies = {
  render: renderPuzzleCaptcha,
  materials: verification,
  claimAttempt: claimCaptchaAttempt,
  assertCreateFrequency: assertCaptchaVerificationCreateRateLimit,
  assertConsumeFrequency: assertCaptchaVerificationConsumeRateLimit,
  now: Date.now,
  randomToken: () => randomBytes(32).toString('hex')
};

/**
 * 每张旋转图片最多尝试三次；前两次失败可以重试，第三次失败或成功后消费图片。
 * 服务端原子预占次数，并通过条件删除保证同题最多签发一次绑定业务作用域的凭证。
 */
export class PuzzleCaptchaService {
  private readonly dependencies: typeof defaultDependencies;

  constructor(dependencies: Partial<typeof defaultDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async create({
    username,
    purpose,
    scopeKey = username
  }: {
    username: string;
    purpose: CaptchaVerificationPurpose;
    scopeKey?: string;
  }): Promise<PuzzleCaptchaChallenge> {
    await this.dependencies.assertCreateFrequency({ account: username, scene: purpose });
    const { angle, ...image } = await this.dependencies.render();
    const challengeId = this.dependencies.randomToken();
    const createdAt = this.dependencies.now();
    const created = await this.dependencies.materials.createIfInactive({
      scene: purpose,
      type: 'puzzle',
      key: challengeId,
      data: { scopeKey, angle, createdAt, attempts: 0 },
      ttlPreset: 'medium'
    });
    if (!created) throw new Error('Failed to allocate puzzle challenge');

    return {
      ...image,
      challengeId,
      expiresAt: new Date(createdAt + VerificationTtlSeconds.medium * 1000).toISOString()
    };
  }

  async verify({
    purpose,
    ...submission
  }: PuzzleCaptchaSubmission & {
    purpose: CaptchaVerificationPurpose;
  }): Promise<PuzzleCaptchaResult> {
    const material = await this.dependencies.materials.get({
      scene: purpose,
      type: 'puzzle',
      key: submission.challengeId
    });
    if (!material) return { status: 'refreshRequired' };
    await this.dependencies.assertConsumeFrequency({ account: material.scopeKey, scene: purpose });

    // 不刷新 TTL；即使请求并发或前端重开弹窗，同一道题也只能占用三次机会。
    const attempted = await this.dependencies.claimAttempt({
      challengeId: submission.challengeId,
      purpose
    });
    if (!attempted) return { status: 'refreshRequired' };
    const { attempts, ...identity } = attempted;
    const difference = Math.abs(submission.angle - attempted.angle);
    if (
      !Number.isFinite(attempted.angle) ||
      Math.min(difference, 360 - difference) > 6 ||
      !isPlausiblePuzzleTrack({
        submission,
        elapsed: this.dependencies.now() - attempted.createdAt
      })
    ) {
      if (attempts < CAPTCHA_MAX_ATTEMPTS) {
        return { status: 'retry', remainingAttempts: CAPTCHA_MAX_ATTEMPTS - attempts };
      }
      await this.dependencies.materials.deleteIfMatch({
        scene: purpose,
        type: 'puzzle',
        key: submission.challengeId,
        match: identity
      });
      return { status: 'refreshRequired' };
    }

    // 不把可变的次数放进删除条件，允许已预占的正确请求竞争消费；只有删除成功者能签发凭证。
    const consumed = await this.dependencies.materials.deleteIfMatch({
      scene: purpose,
      type: 'puzzle',
      key: submission.challengeId,
      match: identity
    });
    if (consumed.deletedCount !== 1) return { status: 'refreshRequired' };
    const captcha = this.dependencies.randomToken();
    await this.dependencies.materials.upsert({
      scene: purpose,
      type: 'captcha',
      key: attempted.scopeKey,
      data: { code: captcha },
      ttlPreset: 'short'
    });
    return { status: 'passed', captcha };
  }
}

export const puzzleCaptchaService = new PuzzleCaptchaService();

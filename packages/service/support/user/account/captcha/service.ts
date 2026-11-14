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
import type { ClientSession } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';

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

  /** 可传入调用方事务；图片计算先完成，数据库材料写入使用同一 session。 */
  async create(
    {
      username,
      purpose,
      scopeKey = username
    }: { username: string; purpose: CaptchaVerificationPurpose; scopeKey?: string },
    session?: ClientSession
  ): Promise<PuzzleCaptchaChallenge> {
    await this.dependencies.assertCreateFrequency({ account: username, scene: purpose });
    const { angle, ...image } = await this.dependencies.render();
    const challengeId = this.dependencies.randomToken();
    const createdAt = this.dependencies.now();
    const created = await this.dependencies.materials.createIfInactive({
      scene: purpose,
      type: 'puzzle',
      key: challengeId,
      data: { scopeKey, angle, createdAt, attempts: 0 },
      ttlPreset: 'medium',
      session
    });
    if (!created) throw new Error('Failed to allocate puzzle challenge');

    return {
      ...image,
      challengeId,
      expiresAt: new Date(createdAt + VerificationTtlSeconds.medium * 1000).toISOString()
    };
  }

  /**
   * 默认先原子提交次数预占，再用短事务同时消费图片和签发凭证，存储失败不丢失图片。
   * 传入 session 时所有读写加入调用方事务；调用方负责提交失败尝试，回滚也会撤销次数预占。
   */
  async verify(
    { purpose, ...submission }: PuzzleCaptchaSubmission & { purpose: CaptchaVerificationPurpose },
    session?: ClientSession
  ): Promise<PuzzleCaptchaResult> {
    const material = await this.dependencies.materials.get({
      scene: purpose,
      type: 'puzzle',
      key: submission.challengeId,
      session
    });
    if (!material) return { status: 'refreshRequired' };
    await this.dependencies.assertConsumeFrequency({ account: material.scopeKey, scene: purpose });

    // 不刷新 TTL；即使请求并发或前端重开弹窗，同一道题也只能占用三次机会。
    const attempted = await this.dependencies.claimAttempt(
      {
        challengeId: submission.challengeId,
        purpose
      },
      session
    );
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
        match: identity,
        session
      });
      return { status: 'refreshRequired' };
    }

    // 不把可变次数放入删除条件；消费与签发同处事务，写入失败时恢复图片但保留已提交的尝试。
    const issueProof = async (writeSession: ClientSession): Promise<PuzzleCaptchaResult> => {
      const consumed = await this.dependencies.materials.deleteIfMatch({
        scene: purpose,
        type: 'puzzle',
        key: submission.challengeId,
        match: identity,
        session: writeSession
      });
      if (consumed.deletedCount !== 1) return { status: 'refreshRequired' };
      const captcha = this.dependencies.randomToken();
      await this.dependencies.materials.upsert({
        scene: purpose,
        type: 'captcha',
        key: attempted.scopeKey,
        data: { code: captcha },
        ttlPreset: 'short',
        session: writeSession
      });
      return { status: 'passed', captcha };
    };
    return session ? issueProof(session) : mongoSessionRun(issueProof);
  }
}

export const puzzleCaptchaService = new PuzzleCaptchaService();

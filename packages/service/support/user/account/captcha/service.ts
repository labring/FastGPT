import { randomBytes } from 'node:crypto';
import { UserError } from '@fastgpt/global/common/error/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
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

declare global {
  var puzzleCaptchaRenderQueue: ReturnType<typeof createCaptchaRenderQueue> | undefined;
}

/**
 * 固定十个渲染名额，最多等待一千个任务；仅排队阶段计时，满六十秒移除并拒绝任务。
 * Map 保持 FIFO 且支持单项删除，超时任务立即归还队列容量，不会在稍后补做图片。
 * 排队失败返回业务标记，由调用方构造 UserError，避免跨路由构建共享函数时类身份不一致。
 */
function createCaptchaRenderQueue() {
  type Result =
    | Awaited<ReturnType<typeof renderPuzzleCaptcha>>
    | UserErrEnum.captchaRenderQueueFull
    | UserErrEnum.captchaRenderQueueTimeout;
  type Task = {
    render: typeof renderPuzzleCaptcha;
    resolve: (result: Result) => void;
    reject: (error: unknown) => void;
  };
  type PendingTask = Task & {
    expiresAt: number;
    timer: ReturnType<typeof setTimeout>;
  };
  const concurrency = 10;
  const maxPending = 1000;
  const waitTimeoutMs = 60_000;
  const pending = new Map<symbol, PendingTask>();
  let active = 0;

  /** 淘汰到期任务后按 FIFO 补位；派发前复查时限，避免事件循环延迟时先执行过期任务。 */
  const dispatch = () => {
    while (pending.size > 0) {
      const first = pending.entries().next().value;
      if (!first) return;
      const [id, task] = first;
      const expired = performance.now() >= task.expiresAt;
      if (!expired && active >= concurrency) return;

      pending.delete(id);
      clearTimeout(task.timer);
      if (expired) task.resolve(UserErrEnum.captchaRenderQueueTimeout);
      else start(task);
    }
  };

  /** 成功和同步/异步异常均释放名额；延迟调用 render，避免同步失败连续补位形成递归。 */
  const start = (task: Task) => {
    active += 1;
    void (async () => {
      try {
        task.resolve(await Promise.resolve().then(task.render));
      } catch (error) {
        task.reject(error);
      } finally {
        active -= 1;
        dispatch();
      }
    })();
  };

  return (render: typeof renderPuzzleCaptcha) =>
    new Promise<Result>((resolve, reject) => {
      // 先处理已过期的队列项，超时回调尚未执行时也不让它们占着容量。
      dispatch();
      const task = { render, resolve, reject };
      if (active < concurrency) {
        start(task);
        return;
      }
      if (pending.size >= maxPending) {
        resolve(UserErrEnum.captchaRenderQueueFull);
        return;
      }

      const id = Symbol();
      const expiresAt = performance.now() + waitTimeoutMs;
      const timer = setTimeout(() => {
        // 已开始的任务从 Map 移除了，排队超时不能影响正在生成的图片。
        if (pending.delete(id)) resolve(UserErrEnum.captchaRenderQueueTimeout);
      }, waitTimeoutMs);
      pending.set(id, { ...task, expiresAt, timer });
    });
}

// 放在进程全局，避免路由打包或模块重载各自创建独立队列。
const renderQueue = (global.puzzleCaptchaRenderQueue ??= createCaptchaRenderQueue());

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

  /**
   * 限流通过后使用进程共享的十个生成名额，等待上限一千，排队满一分钟即取消并报错。
   * 仅限制图片计算；等待结束后再分配材料与 TTL，数据库写入使用调用方可选 session。
   */
  async create(
    {
      username,
      purpose,
      scopeKey = username
    }: { username: string; purpose: CaptchaVerificationPurpose; scopeKey?: string },
    session?: ClientSession
  ): Promise<PuzzleCaptchaChallenge> {
    await this.dependencies.assertCreateFrequency({ account: username, scene: purpose });
    const rendered = await renderQueue(() => this.dependencies.render());
    if (typeof rendered === 'string') throw new UserError(rendered);
    const { angle, ...image } = rendered;
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

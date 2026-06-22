import {
  generateSandboxId,
  SandboxStatusEnum,
  SANDBOX_SUSPEND_MINUTES
} from '@fastgpt/global/core/ai/sandbox/constants';
import { env } from '../../../env';
import { MongoSandboxInstance, MongoSemaphore } from './schema';
import {
  createSandbox,
  type ExecuteResult,
  type ISandbox,
  type ResourceLimits,
  type OpenSandboxConfigType
} from '@fastgpt-sdk/sandbox-adapter';
import {
  getOpenSandboxConnectionConfig,
  getSealosConnectionConfig,
  buildOpenSandboxCreateConfig,
  getVolumeManagerConfig,
  deleteSessionVolume,
  type VolumeManagerResult
} from './config';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';
import { subMinutes } from 'date-fns';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { tryBecomeLeader } from './cronLeader';
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

type UnionIdType = {
  appId: string;
  userId: string;
  chatId: string;
};

// --- Semaphore helpers (atomic sandbox count limit) ---

function getMaxCount(): number | undefined {
  return (global as any).feConfigs?.limit?.agentSandboxMaxCount ?? env.AGENT_SANDBOX_MAX_COUNT;
}

const SEMAPHORE_ID = 'sandbox_count';

// Idempotent init: only runs countDocuments on first creation.
// cronJob Step 0 handles periodic drift correction.
async function ensureSemaphoreInit(): Promise<void> {
  const exists = await MongoSemaphore.findById(SEMAPHORE_ID).lean();
  if (exists) return;

  const actual = await MongoSandboxInstance.countDocuments({
    status: SandboxStatusEnum.running
  });
  await MongoSemaphore.findOneAndUpdate(
    { _id: SEMAPHORE_ID },
    { $setOnInsert: { count: actual, updatedAt: new Date() } },
    { upsert: true }
  );
}

// Atomically acquire a slot. Returns true on success, false when at capacity.
async function tryAcquireSemaphore(): Promise<boolean> {
  const max = getMaxCount();
  if (max === undefined) return true;

  await ensureSemaphoreInit();

  const r = await MongoSemaphore.findOneAndUpdate(
    { _id: SEMAPHORE_ID, count: { $lt: max } },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { new: true }
  );
  return !!r;
}

async function releaseSemaphore(): Promise<void> {
  if (getMaxCount() === undefined) return;
  await MongoSemaphore.updateOne(
    { _id: SEMAPHORE_ID, count: { $gte: 1 } },
    { $inc: { count: -1 }, $set: { updatedAt: new Date() } }
  );
}

// --- SandboxClient ---

export class SandboxClient {
  private appId?: string;
  private userId?: string;
  private chatId?: string;
  private sandboxId: string;
  private semaphoreAcquired = false;
  readonly provider: ISandbox;

  constructor(
    props: {
      sandboxId: string;
      appId?: string;
      userId?: string;
      chatId?: string;
    },
    private readonly opts: {
      resourceLimits?: ResourceLimits;
      vmConfig?: VolumeManagerResult | undefined;
      createConfig?: OpenSandboxConfigType;
    }
  ) {
    this.sandboxId = props.sandboxId;
    this.appId = props.appId;
    this.userId = props.userId;
    this.chatId = props.chatId;

    const providerName = env.AGENT_SANDBOX_PROVIDER;

    if (providerName === 'sealosdevbox') {
      const config = getSealosConnectionConfig(this.sandboxId);
      this.provider = createSandbox('sealosdevbox', config, undefined);
    } else if (providerName === 'opensandbox') {
      // volumes always come from vmConfig (ensures PVC binding is correct);
      // custom createConfig takes priority for image/entrypoint/env/metadata
      this.provider = createSandbox(
        'opensandbox',
        getOpenSandboxConnectionConfig({ sessionId: this.sandboxId }),
        buildOpenSandboxCreateConfig({
          resourceLimits: opts?.resourceLimits,
          volumes: opts?.vmConfig?.volumes,
          createConfig: opts?.createConfig
        })
      );
    } else if (providerName === 'e2b') {
      if (!env.AGENT_SANDBOX_E2B_API_KEY) {
        throw new Error('AGENT_SANDBOX_E2B_API_KEY required');
      }
      this.provider = createSandbox('e2b', {
        apiKey: env.AGENT_SANDBOX_E2B_API_KEY,
        sandboxId: this.sandboxId
      });
    } else if (!providerName) {
      throw new Error(
        'AGENT_SANDBOX_PROVIDER is not configured. Please set it in your environment variables.'
      );
    } else {
      throw new Error(`Unsupported sandbox provider: ${env.AGENT_SANDBOX_PROVIDER}`);
    }
  }

  async ensureAvailable() {
    const existing = await MongoSandboxInstance.findOne({
      provider: this.provider.provider,
      sandboxId: this.sandboxId
    }).lean();

    // Path 1: no document → cold start, must acquire semaphore
    if (!existing) {
      const acquired = await tryAcquireSemaphore();
      if (!acquired) {
        const sem = await MongoSemaphore.findById(SEMAPHORE_ID).lean();
        const current = sem?.count ?? 0;
        const max = getMaxCount();
        throw new Error(
          `Active agent sandbox limit reached (${current}/${max}). Please try again later.`
        );
      }
      this.semaphoreAcquired = true;

      try {
        await MongoSandboxInstance.findOneAndUpdate(
          { provider: this.provider.provider, sandboxId: this.sandboxId },
          {
            $set: {
              status: SandboxStatusEnum.running,
              lastActiveAt: new Date()
            },
            $setOnInsert: {
              ...(this.appId ? { appId: this.appId } : {}),
              ...(this.userId ? { userId: this.userId } : {}),
              ...(this.chatId ? { chatId: this.chatId } : {}),
              storage: this.opts?.vmConfig?.storage,
              ...(this.opts?.resourceLimits && {
                limit: {
                  cpuCount: this.opts?.resourceLimits?.cpuCount,
                  memoryMiB: this.opts?.resourceLimits?.memoryMiB,
                  diskGiB: this.opts?.resourceLimits?.diskGiB
                }
              }),
              metadata: {
                volumeEnabled: !!this.opts?.vmConfig,
                ...(this.opts?.createConfig?.metadata || {})
              },
              createdAt: new Date()
            }
          },
          { upsert: true }
        );
        await this.provider.ensureRunning();
      } catch (error) {
        // Rollback: revert DB status to stopped so the orphan record doesn't
        // trick a future Path 3 (warm start) into creating a container without
        // acquiring a semaphore slot.
        await MongoSandboxInstance.updateOne(
          { sandboxId: this.sandboxId, status: SandboxStatusEnum.running },
          { $set: { status: SandboxStatusEnum.stopped, lastActiveAt: new Date() } }
        ).catch((e) =>
          logger.error('db status rollback on ensureRunning failure failed', {
            sandboxId: this.sandboxId,
            error: e
          })
        );
        if (this.semaphoreAcquired) {
          await releaseSemaphore().catch((e) =>
            logger.error('semaphore release failed', { error: e })
          );
          this.semaphoreAcquired = false;
        }
        throw error;
      }
      return;
    }

    // Path 2: document exists but stopped → recovery needs a slot.
    // Use CAS to atomically claim the stopped→running transition so only
    // one request acquires the semaphore per sandbox.
    if (existing.status === SandboxStatusEnum.stopped) {
      const claimed = await MongoSandboxInstance.findOneAndUpdate(
        { sandboxId: this.sandboxId, status: SandboxStatusEnum.stopped },
        { $set: { status: SandboxStatusEnum.running, lastActiveAt: new Date() } }
      );

      if (!claimed) {
        // Lost the race — CAS winner already set status=running and will call ensureRunning().
        // Only update lastActiveAt to reflect this access.
        await MongoSandboxInstance.updateOne(
          { sandboxId: this.sandboxId },
          { $set: { lastActiveAt: new Date() } }
        );
        return;
      }

      // Won the CAS — now acquire the semaphore slot.
      const acquired = await tryAcquireSemaphore();
      if (!acquired) {
        // Rollback: revert to stopped so a future request can retry.
        await MongoSandboxInstance.updateOne(
          { sandboxId: this.sandboxId },
          { $set: { status: SandboxStatusEnum.stopped, lastActiveAt: new Date() } }
        );
        const sem = await MongoSemaphore.findById(SEMAPHORE_ID).lean();
        const current = sem?.count ?? 0;
        const max = getMaxCount();
        throw new Error(
          `Active agent sandbox limit reached (${current}/${max}). Please try again later.`
        );
      }
      this.semaphoreAcquired = true;

      try {
        await this.provider.ensureRunning();
      } catch (error) {
        // Rollback: revert status to stopped so cronJob or next request can retry.
        await MongoSandboxInstance.updateOne(
          { sandboxId: this.sandboxId },
          { $set: { status: SandboxStatusEnum.stopped, lastActiveAt: new Date() } }
        ).catch((e) =>
          logger.error('status rollback on ensureRunning failure failed', { error: e })
        );
        await releaseSemaphore().catch((e) =>
          logger.error('semaphore release failed', { error: e })
        );
        this.semaphoreAcquired = false;
        throw error;
      }
      return;
    }

    // Path 3: document exists and running → true warm start, no semaphore change
    await MongoSandboxInstance.updateOne(
      { provider: this.provider.provider, sandboxId: this.sandboxId },
      { $set: { status: SandboxStatusEnum.running, lastActiveAt: new Date() } }
    );
    await this.provider.ensureRunning();
  }

  async exec(command: string, timeout?: number): Promise<ExecuteResult> {
    try {
      await this.ensureAvailable();
    } catch (err) {
      logger.error('Failed to ensure sandbox available', { sandboxId: this.sandboxId, error: err });
      return {
        stdout: '',
        stderr: `Sandbox service is not available: ${getErrText(err)}`,
        exitCode: -1
      };
    }

    return await this.provider
      .execute(command, {
        timeoutMs: timeout ? timeout * 1000 : undefined
      })
      .catch((err) => {
        logger.error('Failed to execute sandbox', { sandboxId: this.sandboxId, error: err });
        return {
          stdout: '',
          stderr: `Failed to execute sandbox: ${getErrText(err)}`,
          exitCode: -1
        };
      });
  }

  async delete() {
    // Delete provider container. If this fails we still clean up DB + semaphore
    // in the finally block to prevent resource leaks.
    try {
      await this.provider.delete();
    } finally {
      await deleteSessionVolume(this.sandboxId).catch((err) => {
        logger.error('Failed to delete sandbox volume', { sandboxId: this.sandboxId, error: err });
      });
      const doc = await MongoSandboxInstance.findOneAndDelete({ sandboxId: this.sandboxId });
      if (doc && doc.status === SandboxStatusEnum.running) {
        await releaseSemaphore().catch((e) =>
          logger.error('semaphore release on delete failed', { error: e })
        );
        this.semaphoreAcquired = false;
      }
    }
  }

  async stop() {
    // Stop the provider container first — if this fails we leave the DB
    // state as-is so cronJob can retry later.
    const stopError = await this.provider.stop().catch((e) => {
      logger.error('provider.stop failed in stop()', { sandboxId: this.sandboxId, error: e });
      return e;
    });
    if (stopError) return;

    // Atomically transition running → stopped. Only the winner releases the semaphore.
    const doc = await MongoSandboxInstance.findOneAndUpdate(
      { sandboxId: this.sandboxId, status: SandboxStatusEnum.running },
      { $set: { status: SandboxStatusEnum.stopped, lastActiveAt: new Date() } }
    );

    if (doc) {
      await releaseSemaphore().catch((e) =>
        logger.error('semaphore release on stop failed', { error: e })
      );
      this.semaphoreAcquired = false;
    }
  }
}

export const getSandboxClient = async (
  props:
    | {
        sandboxId: string;
      }
    | UnionIdType,
  opts: {
    resourceLimits?: ResourceLimits;
    createConfig?: OpenSandboxConfigType;
  } = {}
) => {
  const sandboxId = (() => {
    if ('sandboxId' in props) {
      return props.sandboxId;
    } else {
      return generateSandboxId(props.appId, props.userId, props.chatId);
    }
  })();
  const vmConfig = await getVolumeManagerConfig(sandboxId);

  const sandbox = new SandboxClient({ ...props, sandboxId }, { ...opts, vmConfig });
  await sandbox.ensureAvailable();
  return sandbox;
};

/** Like getSandboxClient but checks for an existing sandbox by chatId first. */
export const getSandboxClientByChat = async (
  props: UnionIdType,
  opts: {
    resourceLimits?: ResourceLimits;
    createConfig?: OpenSandboxConfigType;
  } = {}
) => {
  // Prefer an existing sandbox already associated with this chatId
  const existingSandbox = await MongoSandboxInstance.findOne({
    chatId: props.chatId
  }).lean();

  if (existingSandbox) {
    return getSandboxClient({ sandboxId: existingSandbox.sandboxId }, opts);
  }

  // Fallback: create/find by appId/userId/chatId hash
  return getSandboxClient(props, opts);
};

// ==== Delete Sandboxes ====

/** Direct sandbox deletion, bypassing ensureAvailable (no semaphore acquire). */
const deleteSandboxDirectly = async (sandboxId: string) => {
  const client = new SandboxClient({ sandboxId }, {});
  await client.delete().catch((err) => {
    logger.error('Failed to delete sandbox', { sandboxId, error: err });
  });
};

export const deleteSandboxesByChatIds = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}) => {
  const instances = await MongoSandboxInstance.find({ appId, chatId: { $in: chatIds } }).lean();
  if (!instances.length) return;

  const results = await Promise.allSettled(
    instances.map(async (doc) => deleteSandboxDirectly(doc.sandboxId))
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.warn('Some sandboxes failed to delete', { total: instances.length, failed });
  }
};
export const deleteSandboxesByAppId = async (appId: string) => {
  const instances = await MongoSandboxInstance.find({ appId }).lean();
  if (!instances.length) return;

  const results = await Promise.allSettled(
    instances.map(async (doc) => deleteSandboxDirectly(doc.sandboxId))
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.warn('Some sandboxes failed to delete', { total: instances.length, failed });
  }
};

// 5 分钟检查一遍，暂停
// Uses leader election to prevent N replicas from all running the same cleanup.
const CRON_LEADER_KEY = 'sandbox_idle_cleanup';

export const cronJob = async () => {
  setCron('*/5 * * * *', async () => {
    if (!(await tryBecomeLeader(CRON_LEADER_KEY))) return;

    // Step 0: Correct the semaphore to match actual running count.
    // Uses $inc delta (not $set) to compose safely with concurrent tryAcquireSemaphore.
    // Caps correction at maxCount so over-limit states are never "legitimized"
    // — idle sandboxes must be stopped to reclaim slots, not the ceiling raised.
    const runningCount = await MongoSandboxInstance.countDocuments({
      status: SandboxStatusEnum.running
    });
    const max = getMaxCount();
    const sem = await MongoSemaphore.findById(SEMAPHORE_ID).lean();
    if (!sem) {
      await ensureSemaphoreInit();
    } else {
      const target = max !== undefined ? Math.min(runningCount, max) : runningCount;
      const delta = target - sem.count;
      if (delta !== 0) {
        await MongoSemaphore.updateOne(
          { _id: SEMAPHORE_ID },
          { $inc: { count: delta }, $set: { updatedAt: new Date() } }
        );
      }
    }

    const instances = await MongoSandboxInstance.find({
      status: SandboxStatusEnum.running,
      lastActiveAt: { $lt: subMinutes(new Date(), SANDBOX_SUSPEND_MINUTES) }
    }).lean();
    if (!instances.length) return;

    logger.info('Found running sandboxes inactive > 5 min', { count: instances.length });

    await batchRun(instances, async (doc) => {
      // Bypass ensureAvailable: cron stop only needs provider.stop + DB CAS.
      // Creating a SandboxClient without getSandboxClient avoids an unnecessary
      // semaphore acquire (Path 1) when the sandbox was already deleted.
      const client = new SandboxClient({ sandboxId: doc.sandboxId }, {});
      await client.stop().catch((err) => {
        logger.error('Failed to stop sandbox', { sandboxId: doc.sandboxId, error: err });
      });
    });
  });
};

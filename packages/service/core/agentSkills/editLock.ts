/**
 * Distributed edit lock for AgentSkill package mutations.
 *
 * Replaces the in-process Map-based withSkillEditLock (only serializes
 * within one Node.js process) with a MongoDB-backed advisory lock so that
 * multiple FastGPT replicas cannot interleave read-modify-write cycles on
 * the same MinIO package.zip.
 *
 * Lock lifecycle:
 *   acquireSkillEditLock → (work, renew if needed) → releaseSkillEditLock
 *
 * Stale locks are auto-cleaned by the MongoDB TTL index on expiresAt.
 * The next acquirer steals an expired lock transparently.
 */
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { connectionMongo, getMongoModel } from '../../common/mongo';
import type { Model } from 'mongoose';

const { Schema } = connectionMongo;

// ---- Mongoose schema -------------------------------------------------------

export const skillEditLocksCollectionName = 'skill_edit_locks';

export type SkillEditLockDoc = {
  skillId: string;
  lockToken: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
};

const SkillEditLockSchema = new Schema<SkillEditLockDoc>({
  skillId: { type: String, required: true, unique: true },
  lockToken: { type: String, required: true },
  lockedBy: { type: String, required: true },
  lockedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
});

// TTL index: MongoDB auto-deletes docs when expiresAt passes
SkillEditLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MongoSkillEditLock: Model<SkillEditLockDoc> = getMongoModel(
  skillEditLocksCollectionName,
  SkillEditLockSchema
);

// ---- Types -----------------------------------------------------------------

export type LockHandle = {
  skillId: string;
  lockToken: string;
  instanceId: string;
  expiresAt: Date;
};

export class SkillEditLockBusyError extends Error {
  code = 'SKILL_EDIT_LOCK_BUSY';
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'SkillEditLockBusyError';
  }
}

export class SkillEditLockExpiredError extends Error {
  code = 'SKILL_EDIT_LOCK_EXPIRED';
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'SkillEditLockExpiredError';
  }
}

// ---- Helpers ---------------------------------------------------------------

function instanceId(): string {
  return `${os.hostname()}:${process.pid}`;
}

// ---- Public API ------------------------------------------------------------

const DEFAULT_TTL_MS = 30_000;

/**
 * Acquire a distributed edit lock for `skillId`.
 *
 * When the lock is held by another live instance a SkillEditLockBusyError
 * (HTTP 409) is thrown.  Stale locks (expiresAt < now) are silently stolen.
 */
export async function acquireSkillEditLock(
  skillId: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<LockHandle> {
  const lockToken = randomUUID();
  const id = instanceId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(1000, ttlMs));

  try {
    const result = await MongoSkillEditLock.updateOne(
      {
        skillId,
        $or: [
          { lockToken: { $exists: false } }, // no document yet
          { expiresAt: { $lt: now } } // stale lock
        ]
      },
      {
        $set: { lockToken, lockedBy: id, lockedAt: now, expiresAt },
        $setOnInsert: { skillId }
      },
      { upsert: true }
    );

    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      throw new SkillEditLockBusyError(`Skill ${skillId} is being edited by another process`);
    }
  } catch (e: any) {
    if (e.code === 11000) {
      // Duplicate key — another instance inserted between our read and write
      throw new SkillEditLockBusyError(`Skill ${skillId} is being edited by another process`);
    }
    if (e instanceof SkillEditLockBusyError) throw e;
    throw e;
  }

  return { skillId, lockToken, instanceId: id, expiresAt };
}

/**
 * Release a previously acquired lock.
 *
 * Only the holder (matching lockToken) can release — this prevents
 * accidentally releasing a lock that was stolen after expiry.
 */
export async function releaseSkillEditLock(handle: LockHandle): Promise<void> {
  await MongoSkillEditLock.deleteOne({
    skillId: handle.skillId,
    lockToken: handle.lockToken
  });
}

/**
 * Renew (extend) a lock's TTL.
 *
 * Throws SkillEditLockExpiredError when the lock was stolen or expired.
 * Returns an updated handle — use the *returned* handle for subsequent
 * renew/release calls.
 */
export async function renewSkillEditLock(
  handle: LockHandle,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<LockHandle> {
  const expiresAt = new Date(Date.now() + Math.max(1000, ttlMs));

  const result = await MongoSkillEditLock.updateOne(
    { skillId: handle.skillId, lockToken: handle.lockToken },
    { $set: { expiresAt } }
  );

  if (result.matchedCount === 0) {
    throw new SkillEditLockExpiredError(`Lock for skill ${handle.skillId} expired or was stolen`);
  }

  return { ...handle, expiresAt };
}

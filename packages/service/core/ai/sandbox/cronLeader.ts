/**
 * MongoDB-based leader election for cron jobs.
 *
 * In a multi-replica deployment every process runs the same node-cron
 * schedules.  Without coordination, N replicas all execute the same
 * cleanup work simultaneously.  This module provides a lightweight
 * leader lease so that only one replica runs a given cron job at a time.
 *
 * Usage:
 *   if (!(await tryBecomeLeader())) return; // skip — not the leader
 */
import os from 'node:os';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { Model } from 'mongoose';

const { Schema } = connectionMongo;

export const cronLeaderCollectionName = 'sandbox_cron_leader';

export type CronLeaderDoc = {
  leaderKey: string;
  instanceId: string;
  lastHeartbeat: Date;
  expiresAt: Date;
};

const CronLeaderSchema = new Schema<CronLeaderDoc>({
  leaderKey: { type: String, required: true, unique: true },
  instanceId: { type: String, required: true },
  lastHeartbeat: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
});

// TTL index: MongoDB auto-deletes expired leader leases
CronLeaderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const MongoCronLeader: Model<CronLeaderDoc> = getMongoModel(
  cronLeaderCollectionName,
  CronLeaderSchema
);

// ---- Public API ------------------------------------------------------------

const LEADER_TTL_MS = 120_000; // 2 minutes — exceeds the 5-min cron interval

function instanceId(): string {
  return `${os.hostname()}:${process.pid}`;
}

/**
 * Try to become (or stay) the leader for `leaderKey`.
 *
 * Returns `true` when the calling instance is the current leader.
 * The lease auto-expires after TTL, so a dead process cannot block
 * the leader slot forever.
 */
export async function tryBecomeLeader(
  leaderKey: string,
  ttlMs: number = LEADER_TTL_MS
): Promise<boolean> {
  const id = instanceId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    await MongoCronLeader.findOneAndUpdate(
      {
        leaderKey,
        $or: [
          { instanceId: id }, // We already hold it — renew
          { expiresAt: { $lt: now } } // Previous leader's lease expired
        ]
      },
      {
        $set: { instanceId: id, lastHeartbeat: now, expiresAt },
        $setOnInsert: { leaderKey }
      },
      { upsert: true }
    );
    return true; // We are the leader (inserted or renewed)
  } catch (e: any) {
    if (e.code === 11000) {
      // Another instance holds the lock and the lease hasn't expired
      return false;
    }
    throw e;
  }
}

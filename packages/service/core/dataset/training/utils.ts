import { MongoDatasetCollection } from '../collection/schema';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetTraining } from './schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushCollectionUpdateJob } from '../collection/mq';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET);

// ============================================================
// Throttle helpers — prevent redundant completion checks
// ============================================================

// Each call resets the timer, so the actual DB query only fires once
// after the last chunk completes (instead of once per chunk).
const THROTTLE_MS = 2000;

const indexingEndTimers = new Map<string, ReturnType<typeof setTimeout>>();
const parseEndTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ============================================================
// Collection-level timing helpers
// ============================================================

/**
 * Set parseStartTime on the collection.
 * Idempotent — only the first worker to pick up a parse task sets the timestamp.
 *
 * Non-critical: errors are logged but never thrown.
 */
export const markParseStart = async ({
  collectionId,
  startTime
}: {
  collectionId: string;
  startTime?: Date | null;
}) => {
  try {
    const st = startTime || new Date();
    await MongoDatasetCollection.updateOne(
      { _id: collectionId, parseStartTime: { $exists: false } },
      { $set: { parseStartTime: st } }
    );
  } catch (err) {
    logger.warn('Failed to set parseStartTime', { collectionId, error: err });
  }
};

/**
 * Check if all parse tasks for a collection are complete,
 * and if so, set parsingCompleteTime on the collection.
 *
 * **Throttled**: multiple calls within THROTTLE_MS are coalesced — the DB query
 * runs at most once per window. The caller's Promise resolves immediately.
 *
 * Non-critical: errors are logged but never thrown.
 */
export const markParseEnd = async ({
  collectionId,
  teamId,
  datasetId,
  source
}: {
  collectionId: string;
  teamId?: string;
  datasetId?: string;
  source?: string;
}) => {
  const existing = parseEndTimers.get(collectionId);
  if (existing) clearTimeout(existing);

  parseEndTimers.set(
    collectionId,
    setTimeout(async () => {
      parseEndTimers.delete(collectionId);
      try {
        const anyRemaining = await MongoDatasetTraining.findOne(
          { collectionId, mode: TrainingModeEnum.parse, retryCount: { $gt: 0 } },
          { _id: 1 }
        ).lean();
        if (!anyRemaining) {
          await MongoDatasetCollection.updateOne(
            { _id: collectionId },
            { $set: { parsingCompleteTime: new Date() } }
          );
          logger.info('Collection parsing complete', { collectionId, source });

          // Trigger async collection stats update
          if (teamId && datasetId) {
            pushCollectionUpdateJob({
              collectionId: String(collectionId),
              datasetId: String(datasetId),
              teamId: String(teamId)
            });
          }
        }
      } catch (err) {
        logger.warn('Failed to check collection parse completion', {
          collectionId,
          source,
          error: err
        });
      }
    }, THROTTLE_MS)
  );
};

/**
 * Set indexingStartTime on the collection.
 * Idempotent — only the first worker to pick up an indexing task sets the timestamp.
 *
 * Non-critical: errors are logged but never thrown.
 */
export const markIndexingStart = async ({
  collectionId,
  startTime
}: {
  collectionId: string;
  startTime?: Date | null;
}) => {
  try {
    const st = startTime || new Date();
    await MongoDatasetCollection.updateOne(
      { _id: collectionId, indexingStartTime: { $exists: false } },
      { $set: { indexingStartTime: st } }
    );
  } catch (err) {
    logger.warn('Failed to set indexingStartTime', { collectionId, error: err });
  }
};

/**
 * Check if all indexing tasks for a collection are complete,
 * and if so, set indexingCompleteTime on the collection.
 *
 * **Throttled**: multiple calls within THROTTLE_MS are coalesced — the DB query
 * runs at most once per window. The caller's Promise resolves immediately.
 *
 * Non-critical: errors are logged but never thrown.
 */
export const markIndexingEnd = async ({
  collectionId,
  teamId,
  datasetId,
  source
}: {
  collectionId: string;
  teamId?: string;
  datasetId?: string;
  source?: string;
}) => {
  const existing = indexingEndTimers.get(collectionId);
  if (existing) clearTimeout(existing);

  indexingEndTimers.set(
    collectionId,
    setTimeout(async () => {
      indexingEndTimers.delete(collectionId);
      try {
        const anyRemaining = await MongoDatasetTraining.findOne(
          { collectionId, mode: { $ne: TrainingModeEnum.parse }, retryCount: { $gt: 0 } },
          { _id: 1 }
        ).lean();
        if (!anyRemaining) {
          await MongoDatasetCollection.updateOne(
            { _id: collectionId },
            { $set: { indexingCompleteTime: new Date() } }
          );
          logger.info('Collection indexing complete', { collectionId, source });

          // Trigger async collection stats update
          if (teamId && datasetId) {
            pushCollectionUpdateJob({
              collectionId: String(collectionId),
              datasetId: String(datasetId),
              teamId: String(teamId)
            });
          }
        }
      } catch (err) {
        logger.warn('Failed to check collection indexing completion', {
          collectionId,
          source,
          error: err
        });
      }
    }, THROTTLE_MS)
  );
};

// ============================================================
// Data-level phase timing helpers
// ============================================================

/**
 * Push a completed phaseTimings entry (startTime + endTime) in a single $push.
 * Use when both timestamps are known at the same call site — avoids two separate
 * DB writes (start then end) that would otherwise happen back-to-back.
 *
 * When processing occurs between start and end (e.g. chunk, databaseSchema, small2Big),
 * pass startTime through to the completion point and call this once at the end with
 * both timestamps.
 *
 * Non-critical: errors are logged but never thrown.
 */
export const markDataTrainingPhaseTrace = async ({
  dataId,
  mode,
  startTime,
  endTime
}: {
  dataId: string;
  mode: TrainingModeEnum;
  startTime?: Date | null;
  endTime?: Date | null;
}) => {
  try {
    const st = startTime || new Date();
    const et = endTime || new Date();
    await MongoDatasetData.updateOne(
      { _id: dataId },
      { $push: { phaseTimings: { phase: mode, startTime: st, endTime: et } } }
    );
  } catch (err) {
    logger.warn('Failed to write training phase trace', { dataId, mode, error: err });
  }
};

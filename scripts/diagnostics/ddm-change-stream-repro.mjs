#!/usr/bin/env node

/**
 * Reproduce DDM change-stream failures without loading FastGPT code.
 *
 * The script intentionally uses only collections prefixed with `ddm_repro_`
 * unless WATCH_COLLECTIONS/TEST_COLLECTIONS is explicitly supplied. It keeps several collection
 * change streams open, lets them issue long-polling getMore requests, and then
 * generates a controlled write load. All observed errors are written to the
 * final JSON report and to stderr as soon as they occur.
 */

import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

let MongoClient;
try {
  ({ MongoClient } = await import('mongodb'));
} catch (error) {
  console.error(
    'Cannot load the official mongodb Node.js driver. Install it with: npm install mongodb@6'
  );
  console.error(error?.message ?? error);
  process.exit(2);
}

const numberEnv = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}; got ${value}`);
  }
  return parsed;
};

const booleanEnv = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required. Example:');
  console.error(
    '  MONGODB_URI="mongodb://user:pass@192.168.10.168:27017/fastgpt?authSource=admin" node ddm-change-stream-repro.mjs'
  );
  process.exit(2);
}

const durationSeconds = numberEnv('DURATION_SECONDS', 120, { min: 1, max: 86400 });
const idleSeconds = numberEnv('IDLE_SECONDS', 15, { min: 0, max: durationSeconds });
const writeIntervalMs = numberEnv('WRITE_INTERVAL_MS', 250, { min: 0, max: 60000 });
const writerConcurrency = numberEnv('CONCURRENCY', 2, { min: 1, max: 100 });
const watchCount = numberEnv('WATCH_COUNT', 3, { min: 1, max: 100 });
const maxAwaitTimeMS = numberEnv('MAX_AWAIT_TIME_MS', 1000, { min: 100, max: 120000 });
const forceStopGraceMs = numberEnv('FORCE_STOP_GRACE_MS', 5000, { min: 100, max: 60000 });
const maxPoolSize = numberEnv('MAX_POOL_SIZE', Math.max(20, watchCount + writerConcurrency + 5), {
  min: 1,
  max: 1000
});
const cleanup = booleanEnv('CLEANUP', true);
const includeTransactions = booleanEnv('TRANSACTIONS', false);
const writeEnabled = booleanEnv('WRITE_ENABLED', true);
const allowNonReproCollections = booleanEnv('ALLOW_NON_REPRO_COLLECTIONS', false);
const testDbName =
  process.env.TEST_DB ||
  (() => {
    try {
      const pathname = new URL(uri).pathname.replace(/^\//, '');
      return pathname || 'ddm_repro';
    } catch {
      return 'ddm_repro';
    }
  })();

const parseCollectionList = (value, fallback) =>
  (value || fallback)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

const watchCollectionNames = parseCollectionList(
  process.env.WATCH_COLLECTIONS || process.env.TEST_COLLECTIONS,
  'ddm_repro_watch_a,ddm_repro_watch_b,ddm_repro_watch_c'
);
const defaultWriteCollections = watchCollectionNames.every((name) => name.startsWith('ddm_repro_'))
  ? watchCollectionNames
  : [];
const writeCollectionNames = writeEnabled
  ? parseCollectionList(process.env.WRITE_COLLECTIONS, defaultWriteCollections.join(','))
  : [];

if (watchCollectionNames.length === 0)
  throw new Error('WATCH_COLLECTIONS must contain at least one collection name');
if (
  !allowNonReproCollections &&
  [...watchCollectionNames, ...writeCollectionNames].some(
    (name) => !/^ddm_repro_[a-zA-Z0-9_-]+$/.test(name)
  )
) {
  throw new Error(
    'For safety, collection names must match ddm_repro_<name>; set ALLOW_NON_REPRO_COLLECTIONS=1 only for an intentional read-only production-collection reproduction'
  );
}
if (
  writeCollectionNames.length > 0 &&
  writeCollectionNames.some((name) => watchCollectionNames.includes(name) === false)
) {
  console.warn('[warning] WRITE_COLLECTIONS contains collections that are not being watched');
}

const startedAt = new Date();
const deadline = Date.now() + durationSeconds * 1000;
const runId = `run_${startedAt.toISOString().replace(/[-:.TZ]/g, '')}_${Math.random().toString(36).slice(2, 8)}`;
const state = {
  stopping: false,
  eventCount: 0,
  writeCount: 0,
  errors: [],
  streams: [],
  writers: [],
  unhandled: [],
  warnings: [],
  forcedShutdown: false,
  activeStreams: new Set()
};

const redactUri = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return value.replace(/(mongodb(?:\+srv)?:\/\/[^:/]+:)[^@]+@/i, '$1***@');
  }
};

const errorObject = (error) => ({
  name: error?.name,
  message: error?.message || String(error),
  code: error?.code,
  codeName: error?.codeName,
  errorLabels: error?.errorLabels,
  stack: error?.stack
});

const recordError = (context, error) => {
  const entry = { at: new Date().toISOString(), context, ...errorObject(error) };
  state.errors.push(entry);
  console.error(`\n[ERROR ${entry.at}] ${context}: ${entry.message}`);
  if (entry.stack) console.error(entry.stack);
};

const recordWarning = (context, error) => {
  const entry = { at: new Date().toISOString(), context, ...errorObject(error) };
  state.warnings.push(entry);
  console.error(`\n[WARN ${entry.at}] ${context}: ${entry.message}`);
};

const remaining = () => Math.max(0, deadline - Date.now());

const stopLater = async (client) => {
  const waitMs = remaining();
  if (waitMs > 0) await sleep(waitMs);
  state.stopping = true;

  // A broken server-side getMore may never resolve. Close each stream with a
  // bounded wait so the support test always produces its final report.
  const activeStreams = [...state.activeStreams];
  await Promise.allSettled(
    activeStreams.map(async (stream) => {
      try {
        await Promise.race([
          stream.close(),
          sleep(forceStopGraceMs).then(() => {
            throw new Error(`change stream close timed out after ${forceStopGraceMs}ms`);
          })
        ]);
      } catch (error) {
        recordWarning('forced stream close', error);
      }
    })
  );

  if (state.activeStreams.size > 0) {
    state.forcedShutdown = true;
    console.error(
      `[timeout] ${state.activeStreams.size} change stream(s) remained active; closing MongoClient`
    );
    await Promise.race([
      client.close(),
      sleep(forceStopGraceMs).then(() => {
        throw new Error(`MongoClient close timed out after ${forceStopGraceMs}ms`);
      })
    ]).catch((error) => recordWarning('forced MongoClient close', error));
  }
};

const runWatcher = async (client, db, collectionName, index) => {
  const label = `watch-${index + 1}:${collectionName}`;
  const collection = db.collection(collectionName);
  const streamStartedAt = new Date().toISOString();
  const stream = collection.watch([], {
    fullDocument: 'updateLookup',
    maxAwaitTimeMS
  });
  state.activeStreams.add(stream);
  const streamState = {
    label,
    collection: collectionName,
    startedAt: streamStartedAt,
    events: 0,
    endedAt: null,
    status: 'running',
    error: null
  };
  state.streams.push(streamState);
  console.log(`[watch] ${label} started at ${streamStartedAt} maxAwaitTimeMS=${maxAwaitTimeMS}`);

  try {
    for await (const change of stream) {
      streamState.events += 1;
      state.eventCount += 1;
      if (streamState.events <= 3 || streamState.events % 100 === 0) {
        console.log(
          `[event] ${label} #${streamState.events} operation=${change.operationType} resumeToken=${JSON.stringify(change._id)}`
        );
      }
      if (state.stopping) break;
    }
    streamState.status = state.stopping ? 'stopped' : 'ended';
  } catch (error) {
    if (state.stopping && error?.message === 'ChangeStream is closed') {
      streamState.status = 'stopped';
      streamState.shutdownError = errorObject(error);
      recordWarning(`${label} forced shutdown`, error);
    } else {
      streamState.status = 'error';
      streamState.error = errorObject(error);
      recordError(`${label} async iterator/getMore`, error);
    }
  } finally {
    state.activeStreams.delete(stream);
    streamState.endedAt = new Date().toISOString();
    try {
      await stream.close();
    } catch (error) {
      if (state.stopping) recordWarning(`${label} close`, error);
      else recordError(`${label} close`, error);
    }
    console.log(`[watch] ${label} ${streamState.status} events=${streamState.events}`);
  }
};

const writeOnce = async (client, db, writerIndex, sequence) => {
  const collectionName =
    writeCollectionNames[(writerIndex + sequence) % writeCollectionNames.length];
  const collection = db.collection(collectionName);
  const base = {
    reproRunId: runId,
    writer: writerIndex,
    sequence,
    createdAt: new Date(),
    payload: 'ddm-change-stream-repro'
  };

  if (includeTransactions) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const inserted = await collection.insertOne(base, { session });
        await collection.updateOne(
          { _id: inserted.insertedId },
          { $set: { phase: 'updated-in-transaction', updatedAt: new Date() } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
  } else {
    const inserted = await collection.insertOne(base);
    await collection.updateOne(
      { _id: inserted.insertedId },
      { $set: { phase: 'updated', updatedAt: new Date() } }
    );
  }
  state.writeCount += 1;
};

const runWriter = async (client, db, writerIndex) => {
  const writerState = { writer: writerIndex, writes: 0, status: 'running', error: null };
  state.writers.push(writerState);
  let sequence = 0;
  try {
    while (!state.stopping && remaining() > 0) {
      try {
        await writeOnce(client, db, writerIndex, sequence);
        writerState.writes += 1;
        sequence += 1;
      } catch (error) {
        writerState.status = 'error';
        writerState.error = errorObject(error);
        recordError(`writer-${writerIndex}`, error);
        break;
      }
      if (writeIntervalMs > 0) await sleep(Math.min(writeIntervalMs, remaining()));
    }
    if (writerState.status === 'running') writerState.status = 'stopped';
  } finally {
    console.log(
      `[writer] writer-${writerIndex} ${writerState.status} writes=${writerState.writes}`
    );
  }
};

const cleanupRun = async (db) => {
  if (!cleanup || state.forcedShutdown) return;
  for (const collectionName of writeCollectionNames) {
    try {
      const result = await db.collection(collectionName).deleteMany({ reproRunId: runId });
      console.log(`[cleanup] ${collectionName} deleted=${result.deletedCount}`);
    } catch (error) {
      recordError(`cleanup:${collectionName}`, error);
    }
  }
};

process.on('unhandledRejection', (error) => {
  state.unhandled.push(errorObject(error));
  recordError('process unhandledRejection', error);
});
process.on('uncaughtException', (error) => {
  state.unhandled.push(errorObject(error));
  recordError('process uncaughtException', error);
});

let client;
let exitCode = 0;
try {
  client = new MongoClient(uri, {
    retryWrites: true,
    retryReads: true,
    maxPoolSize,
    minPoolSize: 1,
    connectTimeoutMS: 60000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 60000,
    heartbeatFrequencyMS: 5000,
    appName: 'ddm-change-stream-repro'
  });
  await client.connect();
  const db = client.db(testDbName);
  const buildInfo = await client
    .db('admin')
    .command({ buildInfo: 1 })
    .catch((error) => ({ error: errorObject(error) }));
  const hello = await db.command({ hello: 1 }).catch((error) => ({ error: errorObject(error) }));

  console.log(`[connection] uri=${redactUri(uri)}`);
  console.log(`[connection] db=${testDbName} runId=${runId} driver=${MongoClient.name}`);
  console.log(`[server] buildInfo=${JSON.stringify(buildInfo)}`);
  console.log(`[server] hello=${JSON.stringify(hello)}`);
  console.log(
    `[config] duration=${durationSeconds}s idle=${idleSeconds}s watches=${watchCount} writers=${writeEnabled ? writerConcurrency : 0} interval=${writeIntervalMs}ms transactions=${includeTransactions}`
  );
  console.log(
    `[config] watchCollections=${watchCollectionNames.join(',')} writeCollections=${writeCollectionNames.join(',') || '(disabled)'}`
  );

  for (const collectionName of writeCollectionNames) {
    try {
      await db.createCollection(collectionName);
      console.log(`[setup] created ${collectionName}`);
    } catch (error) {
      if (error?.codeName !== 'NamespaceExists' && error?.code !== 48) throw error;
      console.log(`[setup] exists ${collectionName}`);
    }
  }

  const watchers = Array.from({ length: watchCount }, (_, index) =>
    runWatcher(client, db, watchCollectionNames[index % watchCollectionNames.length], index)
  );
  const stopTimer = stopLater(client);

  if (idleSeconds > 0) {
    console.log(`[phase] idle getMore phase for ${idleSeconds}s; no test writes yet`);
    await sleep(Math.min(idleSeconds * 1000, remaining()));
  }

  console.log(
    writeEnabled && writeCollectionNames.length > 0
      ? '[phase] write load started'
      : '[phase] write load disabled'
  );
  const writers =
    writeEnabled && writeCollectionNames.length > 0
      ? Array.from({ length: writerConcurrency }, (_, index) => runWriter(client, db, index))
      : [];
  await Promise.allSettled([stopTimer, ...writers]);
  state.stopping = true;
  await Promise.allSettled(watchers);
  await cleanupRun(db);
  await client.close();
} catch (error) {
  exitCode = 1;
  recordError('fatal', error);
  state.stopping = true;
  if (client)
    await client.close().catch((closeError) => recordError('client close after fatal', closeError));
}

const report = {
  runId,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  durationSeconds,
  idleSeconds,
  uri: redactUri(uri),
  database: testDbName,
  watchCollections: watchCollectionNames,
  writeCollections: writeCollectionNames,
  watchCount,
  writerConcurrency,
  writeIntervalMs,
  maxAwaitTimeMS,
  forceStopGraceMs,
  includeTransactions,
  cleanup,
  eventCount: state.eventCount,
  writeCount: state.writeCount,
  streams: state.streams,
  writers: state.writers,
  errors: state.errors,
  warnings: state.warnings,
  unhandled: state.unhandled,
  forcedShutdown: state.forcedShutdown
};

console.log('\n=== DDM change-stream reproduction report ===');
console.log(JSON.stringify(report, null, 2));
if (state.errors.length > 0) exitCode = 1;
process.exitCode = exitCode;

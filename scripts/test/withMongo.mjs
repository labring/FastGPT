import { spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  console.error('Usage: node scripts/test/withMongo.mjs <command> [args...]');
  process.exitCode = 1;
} else {
  const replset = process.env.FASTGPT_TEST_MONGODB_URI
    ? undefined
    : await MongoMemoryReplSet.create({
        replSet: {
          count: 1,
          // MongoDB 7 can abort in the FTDC collector under highly concurrent test workloads.
          args: ['--setParameter', 'diagnosticDataCollectionEnabled=false']
        }
      });
  const mongoUri = process.env.FASTGPT_TEST_MONGODB_URI ?? replset?.getUri();
  let stopPromise;

  const stopMongo = () => {
    if (!replset) return Promise.resolve();
    stopPromise ??= replset.stop().catch((error) => {
      console.warn('Failed to stop the shared test MongoDB cleanly', error);
    });
    return stopPromise;
  };

  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FASTGPT_TEST_MONGODB_URI: mongoUri
    },
    stdio: 'inherit'
  });

  const forwardSignal = (signal) => {
    child.kill(signal);
    void stopMongo();
  };

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });

    await stopMongo();
    process.exitCode = result.code ?? 1;
  } finally {
    await stopMongo();
  }
}

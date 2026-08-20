import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

/**
 * Provides one MongoDB Replica Set for the DAL integration test project.
 * An externally managed URI can be supplied for CI or debugging.
 */
export default async function setup(project: TestProject) {
  const sharedUri = process.env.FASTGPT_TEST_MONGODB_URI;
  if (sharedUri) {
    project.provide('MONGODB_URI', sharedUri);
    return;
  }

  const replset = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      args: ['--setParameter', 'diagnosticDataCollectionEnabled=false']
    }
  });
  project.provide('MONGODB_URI', replset.getUri('fastgpt_dal_integration'));

  return async () => {
    await replset.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    MONGODB_URI: string;
  }
}

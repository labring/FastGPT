import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

export default async function setup(project: TestProject) {
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  project.provide('MONGODB_URI', uri);

  return async () => {
    await replset.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    MONGODB_URI: string;
  }
}

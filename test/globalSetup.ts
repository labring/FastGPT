import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';
import { basename } from 'node:path';

const getWorkspaceMongoUri = (sharedUri: string) => {
  const url = new URL(sharedUri);
  const workspaceName = basename(process.cwd()).replace(/[^a-zA-Z0-9_-]/g, '_');
  url.pathname = `/fastgpt_test_${workspaceName}`;
  return url.toString();
};

export default async function setup(project: TestProject) {
  const sharedUri = process.env.FASTGPT_TEST_MONGODB_URI;
  if (sharedUri) {
    // Workspaces share one Mongo process, but cleanup must stay isolated per database.
    project.provide('MONGODB_URI', getWorkspaceMongoUri(sharedUri));
    return;
  }

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

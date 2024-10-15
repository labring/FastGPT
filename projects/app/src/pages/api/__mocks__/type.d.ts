import type { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
declare global {
  var mongod: MongoMemoryServer | undefined;
  var replSet: MongoMemoryReplSet | undefined;
}

export type RequestResponse<T = any> = {
  code: number;
  error?: string;
  data?: T;
};

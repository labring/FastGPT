import { MongoMemoryServer } from 'mongodb-memory-server';
declare global {
  var mongod: MongoMemoryServer | undefined;
}

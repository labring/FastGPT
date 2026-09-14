import type { ClientSession } from '../../../common/mongo';
import { MongoUserCapacityGuard } from './schema';

/** Serialize non-synchronization user creation transactions through one Mongo document. */
export const touchUserCapacityGuard = (session: ClientSession) =>
  MongoUserCapacityGuard.findOneAndUpdate(
    { _id: 'global' },
    { $inc: { version: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true, session }
  );

import { connectionMongo, getMongoModel } from '../../../common/mongo';

const { Schema } = connectionMongo;

export const UserCapacityGuardCollectionName = 'user_create_capacity_guard';

const UserCapacityGuardSchema = new Schema({
  _id: { type: String, default: 'global' },
  version: { type: Number, default: 0 },
  updatedAt: { type: Date, default: () => new Date() }
});

export const MongoUserCapacityGuard = getMongoModel<{ _id: string; version: number }>(
  UserCapacityGuardCollectionName,
  UserCapacityGuardSchema
);

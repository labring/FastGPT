import type * as mongoose from 'mongoose';

export type WithId__v<T extends object> = mongoose.Default__v<mongoose.Require_id<T>>;

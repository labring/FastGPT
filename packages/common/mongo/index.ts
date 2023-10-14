import mongoose from 'mongoose';

export default mongoose;
export * from 'mongoose';

export const connectionMongo = global.mongodb || mongoose;

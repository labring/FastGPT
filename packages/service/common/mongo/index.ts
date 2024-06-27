import mongoose from 'mongoose';

export default mongoose;
export * from 'mongoose';

export const connectionMongo = (() => {
  if (!global.mongodb) {
    global.mongodb = mongoose;
  }

  return global.mongodb;
})();

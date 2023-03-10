import type { Mongoose } from 'mongoose';

declare global {
  namespace NodeJS {
    interface Global {
      mongodb: Mongoose | string;
    }
  }
}

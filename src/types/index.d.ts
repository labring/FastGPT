import type { Mongoose } from 'mongoose';

declare global {
  interface Global {
    mongodb: Mongoose;
  }
}

export type a = string;

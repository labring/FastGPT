import type { Mongoose } from 'mongoose';
import type { Logger } from 'winston';

declare global {
  var mongodb: Mongoose | undefined;
}

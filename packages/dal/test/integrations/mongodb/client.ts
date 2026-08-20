import { Mongoose } from 'mongoose';
import { inject } from 'vitest';

/**
 * Creates a Mongoose client connected to the Replica Set provided by global setup.
 * Each test file owns and closes its client so models and connections do not leak.
 */
export const connectMongoIntegration = async (): Promise<Mongoose> => {
  const client = new Mongoose();
  await client.connect(inject('MONGODB_URI'));
  return client;
};

/** Closes a MongoDB integration client and releases its connection resources. */
export const disconnectMongoIntegration = async (client: Mongoose | undefined) => {
  await client?.disconnect();
};

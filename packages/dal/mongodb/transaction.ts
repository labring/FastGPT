import mongoose, { type ClientSession, type Mongoose } from 'mongoose';
import type { TransactionContext, TransactionRunner } from '../transaction';
import { isDatabaseOperationError, type DatabaseErrorAdapter } from '../db';
import { MongoErrorAdapter, MongoInvalidArgumentError } from './errors';

const sessions = new WeakMap<TransactionContext, ClientSession>();

class TransactionHandlerError extends Error {
  constructor(readonly originalError: unknown) {
    super('Transaction handler failed');
  }
}

export const getMongoSession = (context?: TransactionContext) => {
  if (!context) return undefined;

  const session = sessions.get(context);
  if (!session) throw new MongoInvalidArgumentError('Invalid MongoDB transaction context');
  return session;
};

export class MongoTransactionRunner implements TransactionRunner {
  constructor(
    private readonly client: Mongoose = mongoose,
    private readonly errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
  ) {}

  async withTransaction<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T> {
    const session = await this.errorAdapter.execute(() => this.client.startSession());
    const context = Symbol('mongo-transaction');
    sessions.set(context, session);
    let operationError: unknown;

    try {
      try {
        return await session.withTransaction(
          async () => {
            try {
              return await handler(context);
            } catch (error) {
              if (isDatabaseOperationError(error) && error.cause !== undefined) {
                throw error.cause;
              }
              throw new TransactionHandlerError(error);
            }
          },
          { maxCommitTimeMS: 60000 }
        );
      } catch (error) {
        operationError =
          error instanceof TransactionHandlerError
            ? error.originalError
            : this.errorAdapter.adapt(error);
        throw operationError;
      }
    } finally {
      sessions.delete(context);
      try {
        await session.endSession();
      } catch (error) {
        if (operationError === undefined) {
          throw this.errorAdapter.adapt(error);
        }
      }
    }
  }
}

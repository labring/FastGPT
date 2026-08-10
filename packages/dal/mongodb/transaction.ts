import type { ClientSession, Connection } from 'mongoose';
import mongoose from 'mongoose';
import type { TransactionContext, ITransactionRunner } from '../transaction';

const sessions = new WeakMap<TransactionContext, ClientSession>();

export const getSession = (context?: TransactionContext) => {
  return context ? sessions.get(context) : undefined;
};

export class TransactionRunner implements ITransactionRunner {
  constructor(private readonly connection: Connection = mongoose.connection) {}

  async withTransaction<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    const context = Symbol('tx');
    sessions.set(context, session);
    try {
      return await session.withTransaction(() => handler(context));
    } finally {
      sessions.delete(context);
      await session.endSession();
    }
  }
}

export const mtxr = new TransactionRunner();

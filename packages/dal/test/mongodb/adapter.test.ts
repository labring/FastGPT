import { Mongoose } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { MongoAdapter } from '../../mongodb/adapter';
import { MongoUserRepository } from '../../mongodb/repositories/user';
import { MongoTransactionRunner } from '../../mongodb/transaction';
import { MongoErrorAdapter } from '../../mongodb/errors';

describe('MongoAdapter', () => {
  it('assembles repositories and transaction runner from one client', () => {
    const adapter = new MongoAdapter({ client: new Mongoose() });

    expect(adapter.userRepository).toBeInstanceOf(MongoUserRepository);
    expect(adapter.transactionRunner).toBeInstanceOf(MongoTransactionRunner);
    expect(adapter.errorAdapter).toBeInstanceOf(MongoErrorAdapter);
  });
});

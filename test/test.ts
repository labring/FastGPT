import { MongoUser } from '@fastgpt/service/support/user/schema';
import { it, expect } from 'vitest';

it('should be a test', async () => {
  expect(1).toBe(1);
});

it('should be able to connect to mongo', async () => {
  expect(global.mongodb).toBeDefined();
  expect(global.mongodb?.connection.readyState).toBe(1);
  await MongoUser.create({
    username: 'test',
    password: '123456'
  });
  const user = await MongoUser.findOne({ username: 'test' });
  expect(user).toBeDefined();
  expect(user?.username).toBe('test');
});

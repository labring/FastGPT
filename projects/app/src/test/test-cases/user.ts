import type { UserModelSchema } from '@fastgpt/global/support/user/type';

export const root: UserModelSchema = {
  _id: 'rootUserId',
  username: 'root',
  password: '123456',
  avatar: 'rootAvatar',
  promotionRate: 0,
  openaiKey: '',
  createTime: 0,
  timezone: '',
  status: 'active'
};

export const testUser1: UserModelSchema = {
  _id: 'testUser1',
  username: 'testUser1',
  password: '123456',
  avatar: 'testUser1Avatar',
  promotionRate: 0,
  openaiKey: '',
  createTime: 0,
  timezone: '',
  status: 'active'
};

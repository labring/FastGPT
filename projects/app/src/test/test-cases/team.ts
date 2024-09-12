import { root, testUser1 } from './user';

export const team_root = {
  _id: 'team-root',
  name: 'team-root',
  ownerId: root._id
};

export const team_test1 = {
  _id: 'team-test1',
  name: 'team-test1',
  ownerId: testUser1._id
};

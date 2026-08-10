import type { User } from '../../domain/user';
import type { UserDocument } from '../models/user';
import { toEntityId } from '../utils';

export const toUser = (document: UserDocument): User => ({
  ...document,
  id: toEntityId(document._id),
  lastLoginTmbId: document.lastLoginTmbId ? toEntityId(document.lastLoginTmbId) : null
});

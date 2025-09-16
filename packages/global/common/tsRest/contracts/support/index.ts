import { c } from '../../init';
import { userContract } from './user';

export const supportContract = c.router({
  user: userContract
});

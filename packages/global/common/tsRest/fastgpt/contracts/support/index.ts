import { userContract } from './user';
import { c } from '../../../init';

export const supportContract = c.router({
  user: userContract
});

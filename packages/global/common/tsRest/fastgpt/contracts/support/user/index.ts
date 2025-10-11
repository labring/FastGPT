import { accountContract } from '../../../../fastgpt/contracts/support/user/account';
import { c } from '../../../../init';

export const userContract = c.router({
  account: accountContract
});

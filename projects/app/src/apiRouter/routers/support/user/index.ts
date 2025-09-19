import logout from './logout';
import type { Router } from '@fastgpt/global/common/tsRest/types';
import type { userContract } from '@fastgpt/global/common/tsRest/contracts/support/user';

const user: Router<typeof userContract> = {
  logout
};

export default user;

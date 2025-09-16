import type { supportContract } from '@fastgpt/global/common/tsRest/contracts/support';
import type { Router } from '@fastgpt/global/common/tsRest/types';
import user from './user';

const support: Router<typeof supportContract> = {
  user
};

export default support;

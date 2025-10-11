import { createServerRouter } from '@fastgpt/global/common/tsRest/fastgpt/router';
import { proApi } from '@/apiRouters/proApi';
import { loginout } from '@/apiRouters/support/user/acccount/loginout';
import { createServerRoute } from '@fastgpt/global/common/tsRest/fastgpt/router';

const router = createServerRoute({
  core: {
    chat: {
      setting: {
        favourite: {
          list: proApi,
          update: proApi,
          delete: proApi,
          order: proApi,
          tags: proApi
        },
        detail: proApi,
        update: proApi
      }
    }
  },
  support: {
    user: {
      account: {
        loginout
      }
    }
  }
});

export default createServerRouter(router);

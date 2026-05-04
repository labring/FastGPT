import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getAIProxyAdminConfig } from '@fastgpt/service/thirdProvider/aiproxy/config';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  try {
    await authSystemAdmin({ req });
    const { baseUrl, token } = getAIProxyAdminConfig();

    const { data } = await axiosWithoutSSRF.post(`${baseUrl}/api/channel/`, req.body, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    res.json(data);
  } catch (error) {
    res.json({
      success: false,
      message: getErrText(error),
      data: error
    });
  }
}

export default handler;

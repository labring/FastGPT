import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { getErrText } from '@fastgpt/global/common/error/utils';

const baseUrl = process.env.AIPROXY_API_ENDPOINT;
const token = process.env.AIPROXY_API_TOKEN;

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  try {
    await authSystemAdmin({ req });

    if (!baseUrl || !token) {
      return Promise.reject('AIPROXY_API_ENDPOINT or AIPROXY_API_TOKEN is not set');
    }

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

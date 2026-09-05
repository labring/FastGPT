import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getAIProxyAdminConfig } from '@fastgpt/service/thirdProvider/aiproxy/config';
import { withAIProxyChannelMutation } from '@fastgpt/service/thirdProvider/aiproxy/lease';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateAdminAIProxyChannelBodySchema,
  CreateAdminAIProxyChannelResponseSchema,
  type CreateAdminAIProxyChannelBody,
  type CreateAdminAIProxyChannelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(
  req: ApiRequestProps<CreateAdminAIProxyChannelBody>,
  res: ApiResponseType<CreateAdminAIProxyChannelResponse>
): Promise<void> {
  try {
    await authSystemAdmin({ req });
    const { body } = parseApiInput({ req, bodySchema: CreateAdminAIProxyChannelBodySchema });
    const { baseUrl, token } = getAIProxyAdminConfig();

    const { data } = await withAIProxyChannelMutation(({ signal }) =>
      axiosWithoutSSRF.post(`${baseUrl}/api/channel/`, body, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal,
        timeout: 30000
      })
    );

    res.json(CreateAdminAIProxyChannelResponseSchema.parse(data));
  } catch (error) {
    res.json({
      success: false,
      message: getErrText(error)
    });
  }
}

export default handler;

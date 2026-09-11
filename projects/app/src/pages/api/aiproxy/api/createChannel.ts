import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getAIProxyAdminConfig } from '@fastgpt/service/thirdProvider/aiproxy/config';
import { withAIProxyChannelMutation } from '@fastgpt/service/thirdProvider/aiproxy/lease';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { z } from 'zod';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  CreateAdminAIProxyChannelBodySchema,
  CreateAdminAIProxyChannelResponseSchema,
  type CreateAdminAIProxyChannelBody,
  type CreateAdminAIProxyChannelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

/** 在同一写租约内保证名称唯一并解析旧版创建结果，禁止猜测或返回空渠道 ID。 */
async function handler(
  req: ApiRequestProps<CreateAdminAIProxyChannelBody>,
  res: ApiResponseType<CreateAdminAIProxyChannelResponse>
): Promise<void> {
  try {
    await authSystemAdmin({ req });
    const { body } = parseApiInput({ req, bodySchema: CreateAdminAIProxyChannelBodySchema });
    const { baseUrl, token } = getAIProxyAdminConfig();

    const result = await withAIProxyChannelMutation(async ({ signal }) => {
      const config = {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal,
        timeout: 30000
      };
      const getNamedChannels = async () => {
        const { data } = await axiosWithoutSSRF.get(`${baseUrl}/api/channels/all`, config);
        const result = z
          .object({
            success: z.literal(true),
            data: z.array(
              z.object({ id: z.number().int().positive(), name: z.string(), type: z.number() })
            )
          })
          .parse(data);
        return result.data.filter((channel) => channel.name.trim() === body.name);
      };
      if ((await getNamedChannels()).length > 0) {
        throw new Error(i18nT('config_model:channel_name_duplicate'));
      }
      const { data } = await axiosWithoutSSRF.post(`${baseUrl}/api/channel/`, body, config);
      // v0.6.5 成功响应没有 data。已在写入前排除重名，按精确名称解析，不能用列表差集猜 ID。
      if (data?.success === true && data.data == null) {
        const unresolvedMessage =
          'Channel created, but its ID could not be uniquely resolved. Refresh the channel list before retrying.';
        const channels = await getNamedChannels().catch(() => {
          // 创建已生效，后续读取失败不能诱导用户直接重复创建。
          throw new Error(unresolvedMessage);
        });
        if (channels.length !== 1 || channels[0].type !== body.type) {
          throw new Error(unresolvedMessage);
        }
        return { success: true, data: { id: channels[0].id } };
      }
      return data;
    });

    res.json(CreateAdminAIProxyChannelResponseSchema.parse(result));
  } catch (error) {
    res.json({
      success: false,
      message: getErrText(error)
    });
  }
}

export default handler;

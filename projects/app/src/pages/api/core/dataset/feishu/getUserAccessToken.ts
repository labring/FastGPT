import axios from 'axios';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const appId = global.feConfigs.feishu_auth_robot_client_id;
const appSecret = global.feConfigs.feishu_auth_robot_client_secret;

export async function getUserAccessToken(code: string, datasetId: string) {
  if (!appId || !appSecret) {
    throw new Error('FEISHU_APP_ID or FEISHU_APP_SECRET is not set');
  }
  if (!code || !datasetId) {
    throw new Error('code or datasetId is not set');
  }
  const dataset = await MongoDataset.findById(datasetId);
  if (!dataset) {
    throw new Error('Dataset not found');
  }

  // 检查数据集类型
  if (
    dataset.type !== DatasetTypeEnum.feishuPrivate &&
    dataset.type !== DatasetTypeEnum.feishuShare &&
    dataset.type !== DatasetTypeEnum.feishuKnowledge
  ) {
    throw new Error('Dataset type is not feishu]');
  }

  try {
    const response = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>(
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      {
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:3000/api/core/dataset/feishu/oauth',
        code_verifier: 'TxYmzM4PHLBlqm5NtnCmwxMH8mFlRWl_ipie3O0aVzo'
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response?.data.access_token) {
      throw new Error('Failed to get access token');
    }

    await MongoDataset.findByIdAndUpdate(datasetId, {
      $set: {
        [`${dataset.type}Server`]: {
          user_access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
          outdate_time: Date.now() + response.data.expires_in * 1000
        }
      }
    });

    return response.data.access_token;
  } catch (error) {
    console.error('Get Feishu Access Token Error:', error);
    throw error;
  }
}

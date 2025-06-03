import axios from 'axios';
import { MongoDataset } from '../../schema';
import { addLog } from '../../../../common/system/log';

/**
 * refresh feishu token
 * refresh token before 10 minutes
 */
export async function refreshFeishuToken() {
  try {
    const datasets = await MongoDataset.find({
      type: { $in: ['feishuPrivate', 'feishuShare', 'feishuKnowledge'] }
    });

    const appId = global.feConfigs?.feishu_auth_robot_client_id;
    const appSecret = global.feConfigs?.feishu_auth_robot_client_secret;

    const refreshPromises = datasets
      .filter(
        (dataset) =>
          (dataset.type === 'feishuPrivate' && dataset.feishuPrivateServer) ||
          (dataset.type === 'feishuShare' && dataset.feishuShareServer) ||
          (dataset.type === 'feishuKnowledge' && dataset.feishuKnowledgeServer)
      )
      .map(async (dataset) => {
        try {
          const serverKey = `${dataset.type}Server` as keyof typeof dataset;
          const response = await axios.post<{
            access_token: string;
            refresh_token: string;
            expires_in: number;
          }>(
            'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
            {
              client_id: appId,
              client_secret: appSecret,
              grant_type: 'refresh_token',
              refresh_token: dataset[serverKey]?.refresh_token
            },
            {
              headers: {
                'Content-Type': 'application/json; charset=utf-8'
              }
            }
          );

          if (!response?.data.access_token) {
            addLog.error('Failed to refresh access token', {
              datasetId: dataset._id
            });
            return;
          }

          // update dataset
          await MongoDataset.findByIdAndUpdate(dataset._id, {
            $set: {
              [serverKey]: {
                user_access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                outdate_time: Date.now() + response.data.expires_in * 1000
              }
            }
          });

          addLog.info('Feishu token refreshed successfully', {
            datasetId: dataset._id
          });
        } catch (error) {
          addLog.error('Refresh Feishu token error', {
            datasetId: dataset._id,
            error: JSON.stringify(error)
          });
        }
      });

    await Promise.all(refreshPromises);
  } catch (error) {
    addLog.error('Refresh Feishu tokens error', { error });
  }
}

import axios from 'axios';
import { MongoDataset } from '../schema';
import { addLog } from '../../../common/system/log';

const appId = global.feConfigs.feishu_auth_robot_client_id;
const appSecret = global.feConfigs.feishu_auth_robot_client_secret;

/**
 * refresh feishu token
 * refresh token before 10 minutes
 */
export async function refreshFeishuToken() {
  try {
    const datasets = await MongoDataset.find({
      type: { $in: ['feishuPrivate'] }
    });

    const refreshPromises = datasets
      .filter((dataset) => dataset.feishuPrivateServer)
      .map(async (dataset) => {
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
              grant_type: 'refresh_token',
              refresh_token: dataset.feishuPrivateServer?.refresh_token
            },
            {
              headers: {
                'Content-Type': 'application/json'
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
              feishuPrivateServer: {
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
            error,
            datasetId: dataset._id
          });
        }
      });

    await Promise.all(refreshPromises);
  } catch (error) {
    addLog.error('Refresh Feishu tokens error', { error });
  }
}

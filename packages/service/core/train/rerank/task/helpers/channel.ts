import axios from 'axios';
import { addLog } from '../../../../../common/system/log';
import { CHANNEL_CREATE_TIMEOUT } from '../../constants';

/**
 * Create channel for finetuned model
 *
 * Creates a dedicated AI proxy channel for the finetuned model.
 *
 * @param params - Channel creation parameters
 * @param params.channelName - Channel name
 * @param params.endpoint - Model endpoint configuration
 * @param params.modelConfigId - Model configuration ID
 * @throws {Error} When environment variables missing or channel creation fails
 */
export async function createTunedModelChannel(params: {
  channelName: string;
  endpoint: {
    base_url: string;
    model: string;
    api_key: string;
  };
  modelConfigId: string;
}): Promise<void> {
  const { channelName, endpoint, modelConfigId } = params;

  const aiproxyUrl = process.env.AIPROXY_API_ENDPOINT;
  const aiproxyToken = process.env.AIPROXY_API_TOKEN;

  if (!aiproxyUrl || !aiproxyToken) {
    throw new Error('AIPROXY_API_ENDPOINT or AIPROXY_API_TOKEN environment variable is required');
  }

  try {
    const createChannelUrl = `${aiproxyUrl}/api/channel/`;

    const requestData = {
      type: 1,
      name: channelName,
      base_url: endpoint.base_url,
      models: [modelConfigId],
      model_mapping: {},
      key: endpoint.api_key,
      priority: 1
    };

    const response = await axios.post(createChannelUrl, requestData, {
      headers: {
        Authorization: `Bearer ${aiproxyToken}`,
        'Content-Type': 'application/json'
      },
      timeout: CHANNEL_CREATE_TIMEOUT
    });

    if (!response.data) {
      throw new Error('Empty response from aiproxy service');
    }

    if (response.data.success === false) {
      const errorMsg = response.data.message || 'Unknown error';
      throw new Error(`Channel creation failed: ${errorMsg}`);
    }

    return;
  } catch (error) {
    let errorMessage = 'Unknown error occurred';

    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorData = error.response.data;
        if (errorData && typeof errorData === 'object') {
          errorMessage = errorData.message || errorData.error || 'Server error';
        } else {
          errorMessage = `Server error: ${error.response.status}`;
        }
      } else if (error.request) {
        errorMessage = 'No response from aiproxy service';
      } else {
        errorMessage = error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    addLog.error('Failed to create tuned model channel', {
      channelName,
      error: errorMessage,
      aiproxyUrl: aiproxyUrl ? aiproxyUrl.replace(/\/$/, '') + '/***' : 'not set',
      hasToken: !!aiproxyToken
    });

    throw new Error(`Failed to create channel: ${errorMessage}`);
  }
}

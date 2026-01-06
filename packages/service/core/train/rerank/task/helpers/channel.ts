import axios from 'axios';
import { addLog } from '../../../../../common/system/log';
import { CHANNEL_CREATE_TIMEOUT } from '../../constants';

/**
 * Create channel for finetuned model (idempotent)
 *
 * Creates a dedicated AI proxy channel for the finetuned model.
 * This function is idempotent - if a channel for this model already exists,
 * it will be updated with the new configuration.
 *
 * @param params - Channel creation parameters
 * @param params.channelName - Channel name
 * @param params.endpoint - Model endpoint configuration
 * @param params.modelConfigId - Model configuration ID
 * @throws {Error} When environment variables missing or channel operations fail
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
    // Step 1: Check if channel already exists for this model
    // Note: Use /api/channels/all endpoint with pagination (same as frontend)
    const channelsListUrl = `${aiproxyUrl}/api/channels/all`;
    const queryResponse = await axios.get(channelsListUrl, {
      params: {
        page: 1,
        perPage: 1000 // Large enough to get all channels
      },
      headers: {
        Authorization: `Bearer ${aiproxyToken}`
      },
      timeout: CHANNEL_CREATE_TIMEOUT
    });

    // AI Proxy response format: { success: boolean, data: ChannelInfoType[] }
    if (!queryResponse.data?.success) {
      addLog.warn('AI Proxy returned non-success response', {
        response: queryResponse.data
      });
      // Continue to create new channel
    } else if (queryResponse.data.data && Array.isArray(queryResponse.data.data)) {
      const channels = queryResponse.data.data;
      const existingChannel = channels.find(
        (ch: any) => ch.models && ch.models.includes(modelConfigId)
      );

      if (existingChannel) {
        // Channel exists, update it to ensure configuration is current
        const updateUrl = `${aiproxyUrl}/api/channel/${existingChannel.id}`;
        const updateData = {
          type: 1,
          name: channelName,
          base_url: endpoint.base_url,
          models: [modelConfigId],
          model_mapping: {},
          key: endpoint.api_key,
          priority: 1
        };

        const updateResponse = await axios.put(updateUrl, updateData, {
          headers: {
            Authorization: `Bearer ${aiproxyToken}`,
            'Content-Type': 'application/json'
          },
          timeout: CHANNEL_CREATE_TIMEOUT
        });

        if (updateResponse.data?.success === false) {
          throw new Error(
            `Channel update failed: ${updateResponse.data.message || 'Unknown error'}`
          );
        }

        addLog.info('Updated existing channel for model', {
          channelId: existingChannel.id,
          modelConfigId,
          channelName
        });
        return;
      }
    }

    // Step 2: Channel doesn't exist, create it
    const channelApiUrl = `${aiproxyUrl}/api/channel/`;
    const requestData = {
      type: 1,
      name: channelName,
      base_url: endpoint.base_url,
      models: [modelConfigId],
      model_mapping: {},
      key: endpoint.api_key,
      priority: 1
    };

    const response = await axios.post(channelApiUrl, requestData, {
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

    addLog.info('Created new channel for model', {
      modelConfigId,
      channelName
    });

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

    addLog.error('Failed to create or update tuned model channel', {
      channelName,
      error: errorMessage,
      aiproxyUrl: aiproxyUrl ? aiproxyUrl.replace(/\/$/, '') + '/***' : 'not set',
      hasToken: !!aiproxyToken
    });

    throw new Error(`Failed to create or update channel: ${errorMessage}`);
  }
}

/**
 * Delete channel for finetuned model
 *
 * Deletes the dedicated AI proxy channel for the finetuned model by model name.
 * Since we don't store channel ID, we query channels by model name first, then delete.
 *
 * @param modelConfigId - Model configuration ID (used to identify the channel)
 * @throws {Error} When environment variables missing or channel deletion fails
 */
export async function deleteTunedModelChannel(modelConfigId: string): Promise<void> {
  const aiproxyUrl = process.env.AIPROXY_API_ENDPOINT;
  const aiproxyToken = process.env.AIPROXY_API_TOKEN;

  if (!aiproxyUrl || !aiproxyToken) {
    addLog.warn('AIPROXY environment variables not configured, skipping channel deletion', {
      modelConfigId
    });
    return;
  }

  try {
    // Query channels to find the one with this model
    // Note: Use /api/channels/all endpoint with pagination (same as frontend)
    const channelsListUrl = `${aiproxyUrl}/api/channels/all`;
    const queryResponse = await axios.get(channelsListUrl, {
      params: {
        page: 1,
        perPage: 1000 // Large enough to get all channels
      },
      headers: {
        Authorization: `Bearer ${aiproxyToken}`
      },
      timeout: CHANNEL_CREATE_TIMEOUT
    });

    // AI Proxy response format: { success: boolean, data: ChannelInfoType[] }
    if (!queryResponse.data?.success) {
      addLog.warn('AI Proxy returned non-success response (delete)', {
        response: queryResponse.data
      });
      return;
    }

    if (!queryResponse.data.data || !Array.isArray(queryResponse.data.data)) {
      addLog.warn('No channel data returned from aiproxy', { modelConfigId });
      return;
    }

    // Find channel(s) that contain this model
    const channels = queryResponse.data.data;
    const matchingChannels = channels.filter(
      (ch: any) => ch.models && ch.models.includes(modelConfigId)
    );

    if (matchingChannels.length === 0) {
      addLog.info('No matching channel found for model', { modelConfigId });
      return;
    }

    // Delete each matching channel
    for (const channel of matchingChannels) {
      const channelId = channel.id;
      const deleteUrl = `${aiproxyUrl}/api/channel/${channelId}`;

      const deleteResponse = await axios.delete(deleteUrl, {
        headers: {
          Authorization: `Bearer ${aiproxyToken}`
        },
        timeout: CHANNEL_CREATE_TIMEOUT
      });

      if (deleteResponse.data?.success === false) {
        addLog.warn('Channel deletion returned non-success status', {
          channelId,
          modelConfigId,
          message: deleteResponse.data?.message
        });
      } else {
        addLog.info('Successfully deleted channel', {
          channelId,
          modelConfigId
        });
      }
    }
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

    addLog.error('Failed to delete tuned model channel', {
      modelConfigId,
      error: errorMessage
    });

    throw new Error(`Failed to delete channel: ${errorMessage}`);
  }
}

import { PLUGIN_BASE_URL, PLUGIN_TOKEN, pluginClient } from './index';
import type {
  PluginListItemType,
  ToolListItemType,
  ToolDetailType,
  ModerationDetailType
} from '@fastgpt/global/sdk/fastgpt-plugin';

type Installation = { installationStatus?: 'active' | 'disabled' };

/** Bridge lifecycle endpoints until the installed SDK exposes restore and disabled-list options. */
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${PLUGIN_BASE_URL.replace(/\/$/, '')}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(PLUGIN_TOKEN ? { Authorization: `Bearer ${PLUGIN_TOKEN}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new Error(
      payload?.error?.message ??
        payload?.error?.reason?.['zh-CN'] ??
        payload?.error?.reason?.en ??
        'Plugin lifecycle request failed'
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text).data : (undefined as T);
}

/** List retained installations, including disabled ones, for administrator recovery only. */
export const listRetainedPlugins = () =>
  request<Array<PluginListItemType & Installation>>('plugins?includeDisabled=true&sources=system');

/** List retained tool summaries without exposing disabled tools to business callers. */
export const listRetainedTools = () =>
  request<Array<ToolListItemType & Installation>>('tools?includeDisabled=true&sources=system');

/** Disable only the system installation; retries skip installations already disabled. */
export const disableSystemPlugin = async (pluginId: string) => {
  const installed = (await listRetainedPlugins()).find((item) => item.pluginId === pluginId);
  if (!installed || installed.installationStatus === 'disabled') return;
  await pluginClient.deletePlugin({ pluginId, source: 'system', scope: 'allVersions' });
};

/** Reactivate retained files before exposing the plugin in FastGPT. Pruned packages require reinstallation. */
export const restoreSystemPlugin = async (pluginId: string) => {
  const installed = (await listRetainedPlugins()).find((item) => item.pluginId === pluginId);
  if (!installed) throw new Error('插件文件已清理，请重新上传或从插件市场安装');
  await request<void>('plugin/restore', {
    pluginId,
    source: 'system',
    version: installed.version,
    etag: installed.etag
  });
};

/** Read disabled metadata only on administrator paths; never use this to invoke tools. */
export const getRetainedToolDetail = (pluginId: string, version?: string) => {
  const query = new URLSearchParams({
    pluginId,
    source: 'system',
    includeDisabled: 'true',
    ...(version ? { version } : {})
  });
  return request<ToolDetailType>(`tool?${query}`);
};
/** Read retained moderation metadata for recovery. */
export const getRetainedModerationDetail = (pluginId: string, source = 'system') => {
  const query = new URLSearchParams({ pluginId, source, includeDisabled: 'true' });
  return request<ModerationDetailType>(`moderation?${query}`);
};

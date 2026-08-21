import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { ChannelType } from '@fastgpt/global/openapi/core/ai/channel/api';
import {
  getGlobalGroupChannelById,
  getGroupChannelById,
  getSystemChannelById,
  getSystemGroupId,
  normalizeAiproxyError,
  type AiproxyChannel,
  type AiproxyGroupChannel
} from '@fastgpt/service/core/ai/channel';

/**
 * Channel ownership routing (design §2.9.4).
 *
 * The caller declares the channel kind (channelType), so every operation is a
 * single-fetch lookup (exactly 1 round trip) — no list traversal, no
 * system-first fallback:
 * - system → the system channel by id (root only; handlers reject members
 *   with rootOnlyPermit before calling here). The group path is never touched.
 * - team → the member's own group channel (getGroupChannelById with the
 *   session-derived groupId — the group path itself enforces "own channel
 *   only"); root resolves through the global single-fetch (no groupId needed,
 *   its group_id is then used for the group write variant).
 *
 * aiproxy single-fetch endpoints return HTTP 500 + "record not found" for
 * missing ids instead of 404; normalizeAiproxyError maps that to
 * channelNotExist so a miss is distinguishable from a real failure.
 */

export type ResolvedChannel =
  | { kind: 'system'; channel: AiproxyChannel }
  | { kind: 'group'; channel: AiproxyGroupChannel; groupId: string };

/** Single-fetch a channel; undefined when aiproxy reports it as missing */
const fetchOrMissing = async <T>(fetch: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fetch();
  } catch (error) {
    if (normalizeAiproxyError(error) === ModelErrEnum.channelNotExist) return undefined;
    throw error; // real aiproxy failure — propagate for the caller to normalize
  }
};

/**
 * Resolve a channel for a member/root operation by its declared kind. aiproxy
 * failures are normalized (404/500-not-found → channelNotExist, 401/403 →
 * unAuthChannel); an id that does not exist in the declared scope rejects with
 * ModelErrEnum.channelNotExist.
 */
export const resolveChannelForOperation = async ({
  id,
  channelType,
  tmbId,
  isRoot
}: {
  id: number;
  channelType: ChannelType;
  tmbId: string;
  isRoot: boolean;
}): Promise<ResolvedChannel> => {
  try {
    if (channelType === 'system') {
      // Handlers reject non-root callers with rootOnlyPermit before this point.
      const channel = await fetchOrMissing(() => getSystemChannelById(id));
      if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
      return { kind: 'system', channel };
    }

    if (!isRoot) {
      const groupId = getSystemGroupId(tmbId);
      const channel = await fetchOrMissing(() => getGroupChannelById(groupId, id));
      if (!channel) return Promise.reject(ModelErrEnum.channelNotExist);
      return { kind: 'group', channel, groupId };
    }

    const groupChannel = await fetchOrMissing(() => getGlobalGroupChannelById(id));
    if (!groupChannel) return Promise.reject(ModelErrEnum.channelNotExist);
    return { kind: 'group', channel: groupChannel, groupId: groupChannel.group_id };
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }
};

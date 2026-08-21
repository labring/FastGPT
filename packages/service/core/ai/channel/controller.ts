import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { SourceMemberType, UserModelSchema } from '@fastgpt/global/support/user/type';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from '../../../support/user/team/teamMemberSchema';
import type { SystemModelItemType } from '../model/type';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/channel/api';
import {
  getRealtimeGroupChannels,
  getRealtimeSystemChannels,
  getSystemGroupId,
  listGlobalGroupChannels,
  listGroupChannels,
  listSystemChannels,
  type AiproxyChannel,
  type AiproxyGroupChannel
} from './api';

/**
 * Channel business logic (design §2.9.2 / §2.9.5).
 *
 * Association is derived by owner pairing — no mapping table:
 * - system channel (no groupId) ↔ system models (isSystem) with M.model ∈ C.models
 * - member X's group channel (groupId = fastgpt:tmb:X) ↔ X's own models with M.model ∈ C.models
 * This mirrors aiproxy's route scope isolation: global scope → system channels only,
 * own scope → the group's own channels only.
 */

/* ═══ Model bucket helpers (from in-memory model cache) ═══ */

const getSystemModels = (): SystemModelItemType[] =>
  (global.systemModelList || []).filter((m) => m.isSystem);

const getOwnerModels = (tmbId: string): SystemModelItemType[] =>
  (global.systemModelList || []).filter((m) => !m.isSystem && String(m.tmbId) === tmbId);

/** Parse the tmbId out of a FastGPT groupId; undefined for non-FastGPT groups */
const parseTmbIdFromGroupId = (groupId: string): string | undefined => {
  const prefix = 'fastgpt:tmb:';
  return groupId.startsWith(prefix) ? groupId.slice(prefix.length) : undefined;
};

/** Pair channels to models by upstream model name match (M.model ∈ C.models) */
const pairChannelsToModels = (
  channels: Array<AiproxyChannel | AiproxyGroupChannel> = [],
  models: SystemModelItemType[] = []
): Map<string, { id: number; name: string; status: number }[]> => {
  // Defensive: aiproxy may return a null channels payload (Go nil slice → JSON
  // null). An empty map keeps channelCount etc. working instead of crashing.
  if (!Array.isArray(channels) || !Array.isArray(models)) return new Map();
  const map = new Map<string, { id: number; name: string; status: number }[]>();
  for (const channel of channels) {
    for (const model of models) {
      if (channel.models?.includes(model.model)) {
        const list = map.get(model.id);
        const brief = { id: channel.id, name: channel.name, status: channel.status };
        if (list) {
          list.push(brief);
        } else {
          map.set(model.id, [brief]);
        }
      }
    }
  }
  return map;
};

/* ═══ Error normalization ═══ */

/**
 * Normalize an aiproxy admin call failure into ModelErrEnum (falling back to the
 * raw error text for business messages, e.g. an invalid key validation error).
 *
 * aiproxy single-fetch endpoints return HTTP 500 with a gorm "record not found"
 * message for missing ids (core/controller/channel.go GetChannel) instead of the
 * standard 404 — recognized here so single-fetch routing can distinguish "missing"
 * from a real failure.
 */
export const normalizeAiproxyError = (error: any): ModelErrEnum | string => {
  const status = error?.response?.status as number | undefined;
  if (status === 404) return ModelErrEnum.channelNotExist;
  if (status === 401 || status === 403) return ModelErrEnum.unAuthChannel;
  if (status === 500 && /record not found/i.test(error?.response?.data?.message || '')) {
    return ModelErrEnum.channelNotExist;
  }
  return getErrText(error, ModelErrEnum.unExist);
};

/** Reject with the normalized error so callers can `await` and let it propagate */
const rejectNormalized = (error: any): Promise<never> =>
  Promise.reject(normalizeAiproxyError(error));

/**
 * Map an aiproxy RELAY failure (v1/chat, embeddings, tts, stt, rerank) to
 * ModelErrEnum.noAvailableChannel when the relay could not route the model to
 * any channel in the request scope (global/system or own/team).
 *
 * Detection: HTTP 404 + the relay's "no available channel" message pattern
 * ("... no available channel for model ... under the current group ..." /
 * "当前分组 ... 下对于模型 ... 无可用渠道"). The 404 alone is NOT enough — a channel
 * may exist but its upstream provider 404s (model name typo etc.); requiring the
 * message pattern keeps those pass-through errors untouched (design §5.1 / F2-S4-TC04).
 *
 * Other errors pass through unchanged, so the normal call path is unaffected.
 */
export const normalizeRelayNoChannelError = (error: any): any => {
  // OpenAI SDK errors carry `status`; axios errors (stt/rerank) carry response.status.
  const status = error?.status ?? error?.response?.status;
  if (
    status === 404 &&
    /no available channel|无可用渠道|channel not found|channel_not_found/i.test(getErrText(error))
  ) {
    return ModelErrEnum.noAvailableChannel;
  }
  return error;
};

/* ═══ Permission helpers ═══ */

/** Member operations require TeamModelCreatePermissionVal (design §2.9.4) */
export const assertMemberChannelPermission = (tmbPer: TeamPermission): Promise<void> => {
  if (!tmbPer.hasModelCreatePer) return Promise.reject(ModelErrEnum.unAuthChannel);
  return Promise.resolve();
};

/** A member may only operate on their own group channels (channel.group_id === fastgpt:tmb:<tmbId>) */
export const assertOwnGroupChannel = (
  channel: AiproxyGroupChannel,
  tmbId: string
): Promise<void> => {
  if (channel.group_id !== getSystemGroupId(tmbId)) {
    return Promise.reject(ModelErrEnum.unAuthChannel);
  }
  return Promise.resolve();
};

/* ═══ Association computation (design §2.9.2) ═══ */

export type ChannelBrief = { id: number; name: string; status: number };

/** channelCount(modelId): matching channel count within M's own bucket */
export const channelCount = (modelId: string, map: Map<string, ChannelBrief[]>): number =>
  map.get(modelId)?.length ?? 0;

/**
 * Owner-paired association map for an arbitrary model set — each model is
 * counted against its OWN bucket (system model → system channels; private
 * model → its owner's group channels). Used by the model list for channelCount
 * / hover details when the visible models span multiple owners (root team
 * view, collaborator-shared models). Channels are fetched once per bucket
 * that actually appears in the model set.
 */
export const getModelChannelsMapByModels = async (
  models: SystemModelItemType[]
): Promise<Map<string, ChannelBrief[]>> => {
  try {
    const map = new Map<string, ChannelBrief[]>();

    // System bucket: fetch once, pair with every system model in the set
    const systemModels = models.filter((m) => m.isSystem);
    if (systemModels.length > 0) {
      const systemChannels = (await listSystemChannels()).channels;
      for (const [modelId, list] of pairChannelsToModels(systemChannels, systemModels)) {
        map.set(modelId, list);
      }
    }

    // Owner buckets: fetch per unique owner, pair with that owner's models in the set
    const ownerModelsByTmb = new Map<string, SystemModelItemType[]>();
    for (const model of models) {
      if (model.isSystem || !model.tmbId) continue;
      const list = ownerModelsByTmb.get(String(model.tmbId)) || [];
      list.push(model);
      ownerModelsByTmb.set(String(model.tmbId), list);
    }
    for (const [tmbId, ownerModels] of ownerModelsByTmb) {
      const groupChannels = (await listGroupChannels(getSystemGroupId(tmbId))).channels;
      for (const [modelId, list] of pairChannelsToModels(groupChannels, ownerModels)) {
        map.set(modelId, list);
      }
    }

    return map;
  } catch (error) {
    return rejectNormalized(error);
  }
};

/**
 * getChannelAffectedModels: models that would lose their only channel if this
 * channel is deleted (same upstream name appears in exactly one channel of the
 * bucket). System channels count the system bucket, group channels the owner bucket.
 */
export const getChannelAffectedModels = async (
  channel: AiproxyChannel | AiproxyGroupChannel
): Promise<{ modelId: string; name: string; model: string }[]> => {
  try {
    const groupId = (channel as AiproxyGroupChannel).group_id;
    const tmbId = groupId ? parseTmbIdFromGroupId(groupId) : undefined;
    const bucketModels = groupId
      ? tmbId
        ? getOwnerModels(tmbId)
        : [] // foreign group: no FastGPT models to associate
      : getSystemModels();
    if (bucketModels.length === 0) return [];

    // Count bucket channels per upstream model name (realtime — delete
    // protection must reflect current state, F2-S4/F3-S4)
    const bucketChannels = groupId
      ? await getRealtimeGroupChannels(groupId)
      : await getRealtimeSystemChannels();
    const nameCount = new Map<string, number>();
    for (const ch of bucketChannels) {
      for (const name of ch.models || []) {
        nameCount.set(name, (nameCount.get(name) || 0) + 1);
      }
    }

    // Affected: bucket models served by this channel whose name has exactly one channel
    const channelModels = new Set(channel.models || []);
    return bucketModels
      .filter((m) => channelModels.has(m.model) && nameCount.get(m.model) === 1)
      .map((m) => ({ modelId: m.id, name: m.name || m.model, model: m.model }));
  } catch (error) {
    return rejectNormalized(error);
  }
};

/**
 * getChannelModels: ALL models the channel serves within its own bucket (upstream
 * model name match, no "only channel" filter) — the hover detail source for the
 * channel list's related-model column (F2-S5 场景3/4). Cheaper than
 * getChannelAffectedModels: bucket models come from the in-memory model cache,
 * no bucket channel fetch is needed.
 */
export const getChannelModels = (
  channel: AiproxyChannel | AiproxyGroupChannel
): { modelId: string; name: string; model: string }[] => {
  const groupId = (channel as AiproxyGroupChannel).group_id;
  const tmbId = groupId ? parseTmbIdFromGroupId(groupId) : undefined;
  const bucketModels = groupId
    ? tmbId
      ? getOwnerModels(tmbId)
      : [] // foreign group: no FastGPT models to associate
    : getSystemModels();

  const channelModels = new Set(channel.models || []);
  return bucketModels
    .filter((m) => channelModels.has(m.model))
    .map((m) => ({ modelId: m.id, name: m.name || m.model, model: m.model }));
};

/**
 * getModelChannelRefs: channel count in the model's own bucket serving the same
 * upstream model name — shown as a hint when deleting a model (F2-S3; not blocking,
 * since channels route by name and keep working independently).
 */
export const getModelChannelRefs = async (modelData: SystemModelItemType): Promise<number> => {
  try {
    const channels = modelData.isSystem
      ? (await listSystemChannels()).channels
      : modelData.tmbId
        ? (await listGroupChannels(getSystemGroupId(String(modelData.tmbId)))).channels
        : [];
    return channels.filter((ch) => ch.models?.includes(modelData.model)).length;
  } catch (error) {
    return rejectNormalized(error);
  }
};

/* ═══ Channel list assembly (three views, each with relatedModelCount) ═══ */

const buildChannelListItem = (
  channel: AiproxyChannel | AiproxyGroupChannel,
  bucketModels: SystemModelItemType[]
): ChannelListItem => ({
  id: channel.id,
  name: channel.name,
  type: channel.type,
  status: channel.status,
  models: channel.models || [],
  model_mapping: channel.model_mapping,
  base_url: channel.base_url,
  priority: channel.priority,
  sets: channel.sets,
  used_amount: channel.used_amount,
  request_count: channel.request_count,
  created_at: channel.created_at,
  ...((channel as AiproxyGroupChannel).group_id !== undefined
    ? { group_id: (channel as AiproxyGroupChannel).group_id }
    : {}),
  relatedModelCount: bucketModels.filter((m) => channel.models?.includes(m.model)).length
});

const paginate = <T>(
  list: T[],
  pageNum?: number,
  pageSize?: number
): { list: T[]; total: number } => {
  const total = list.length;
  const size = pageSize ? Number(pageSize) : total;
  const page = pageNum ? Number(pageNum) : 1;
  const start = (page - 1) * size;
  return { list: list.slice(start, start + size), total };
};

/** System channels view (root) — relatedModelCount counts the system model bucket */
export const getSystemChannelList = async ({
  pageNum,
  pageSize
}: {
  pageNum?: number;
  pageSize?: number;
} = {}): Promise<{ list: ChannelListItem[]; total: number }> => {
  try {
    const systemModels = getSystemModels();
    const all = (await listSystemChannels()).channels;
    const list = all.map((ch) => buildChannelListItem(ch, systemModels));
    return paginate(list, pageNum, pageSize);
  } catch (error) {
    return rejectNormalized(error);
  }
};

/** Member channels view — the member's own group channels, owner bucket counts */
export const getMemberChannelList = async ({
  tmbId,
  pageNum,
  pageSize
}: {
  tmbId: string;
  pageNum?: number;
  pageSize?: number;
}): Promise<{ list: ChannelListItem[]; total: number }> => {
  try {
    const ownerModels = getOwnerModels(tmbId);
    const all = (await listGroupChannels(getSystemGroupId(tmbId))).channels;
    const list = all.map((ch) => buildChannelListItem(ch, ownerModels));
    return paginate(list, pageNum, pageSize);
  } catch (error) {
    return rejectNormalized(error);
  }
};

/** Root cross-member view — all member channels, per-owner bucket counts */
export const getGlobalGroupChannelList = async ({
  groupId,
  pageNum,
  pageSize
}: {
  groupId?: string;
  pageNum?: number;
  pageSize?: number;
} = {}): Promise<{ list: ChannelListItem[]; total: number }> => {
  try {
    const all = (await listGlobalGroupChannels({ groupId })).channels;
    // Group channels by owner so each channel is counted against its own bucket
    const list = all.map((ch) => {
      const tmbId = parseTmbIdFromGroupId(ch.group_id);
      const bucketModels = tmbId ? getOwnerModels(tmbId) : [];
      return buildChannelListItem(ch, bucketModels);
    });
    const paged = paginate(list, pageNum, pageSize);
    // Resolve creators for the current page (F2-S5 场景4: 创建人列) — one batch
    // MongoTeamMember lookup with name/avatar/status (same shape as addSourceMember).
    const sourceMemberMap = await getSourceMembersByTmbIds(
      paged.list
        .map((item) => (item.group_id ? parseTmbIdFromGroupId(item.group_id) : undefined))
        .filter((tmbId): tmbId is string => !!tmbId)
    );
    return {
      ...paged,
      list: paged.list.map((item) => {
        const tmbId = item.group_id ? parseTmbIdFromGroupId(item.group_id) : undefined;
        return {
          ...item,
          ...(tmbId ? { sourceMember: sourceMemberMap.get(tmbId) } : {})
        };
      })
    };
  } catch (error) {
    return rejectNormalized(error);
  }
};

/**
 * Resolve creator info for a set of tmbIds (batch Mongo lookup — one query for
 * the page; missing members resolve to no sourceMember). Shared shape with the
 * model list creator column: { name, avatar, status }.
 */
const getSourceMembersByTmbIds = async (
  tmbIds: string[]
): Promise<Map<string, SourceMemberType>> => {
  const ids = tmbIds.filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();

  const tmbList = await MongoTeamMember.find({ _id: { $in: ids } }, 'name avatar status').lean();
  return new Map(
    tmbList.map((tmb) => [
      String(tmb._id),
      {
        name: tmb.name,
        avatar: tmb.avatar,
        status: tmb.status ?? TeamMemberStatusEnum.active
      }
    ])
  );
};

/**
 * Resolve usernames for a set of tmbIds (batch Mongo lookup — one query for the
 * page; missing members resolve to an empty string). Used by the Pro admin
 * endpoints (design §11.2 keeps tmbName/teamName on admin lists).
 */
export const getTmbNamesByTmbIds = async (tmbIds: string[]): Promise<Map<string, string>> => {
  const ids = tmbIds.filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();

  const tmbList = await MongoTeamMember.find({ _id: { $in: ids } })
    .populate<{ user: UserModelSchema }>('user')
    .lean();
  return new Map(tmbList.map((tmb) => [String(tmb._id), tmb.user?.username || '']));
};

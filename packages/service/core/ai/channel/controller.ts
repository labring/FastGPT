import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { SourceMemberType, UserModelSchema } from '@fastgpt/global/support/user/type';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from '../../../support/user/team/teamMemberSchema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { getCachedModelHandle } from '../config/handle';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/channel/api';
import { getModelProviderMetadata } from '../../app/provider/controller';
import {
  batchDeleteGroupChannels,
  batchUpdateGroupChannelStatus,
  requestBatchDeleteSystemChannels,
  requestBatchUpdateSystemChannelStatus,
  getRealtimeGroupChannels,
  getRealtimeSystemChannels,
  getSystemGroupId,
  listGlobalGroupChannels,
  listGroupChannels,
  listSystemChannels,
  type AiproxyChannel,
  type AiproxyGroupChannel,
  type ChannelStatus
} from './api';

/**
 * 渠道业务逻辑与模型关联计算
 * 系统渠道关联系统模型，成员渠道关联成员私有模型。
 */

export type ChannelAssociableModel = {
  id: string;
  model: string;
  name?: string;
  isSystem?: boolean;
  tmbId?: string;
};

/* ═══ Model bucket helpers (from in-memory model cache) ═══ */

const getSystemModels = (): ChannelAssociableModel[] => {
  const handle = getCachedModelHandle();
  if (!handle) return [];
  return handle.getAllModels().map((m) => {
    const scope = (m as { scope?: string }).scope;
    return {
      id: m.modelId,
      model: m.model,
      name: m.name,
      isSystem: scope === ModelScopeEnum.system || !scope
    };
  });
};

const getOwnerModels = (tmbId: string): ChannelAssociableModel[] => {
  const handle = getCachedModelHandle();
  if (!handle) return [];
  return handle
    .getAllModels()
    .filter((m) => {
      const ownerTmbId = (m as { tmbId?: string }).tmbId;
      return ownerTmbId && String(ownerTmbId) === tmbId;
    })
    .map((m) => ({
      id: m.modelId,
      model: m.model,
      name: m.name,
      isSystem: false,
      tmbId: (m as { tmbId?: string }).tmbId
    }));
};

/** Parse the tmbId out of a FastGPT groupId; undefined for non-FastGPT groups */
const parseTmbIdFromGroupId = (groupId: string): string | undefined => {
  const prefix = 'fastgpt:tmb:';
  return groupId.startsWith(prefix) ? groupId.slice(prefix.length) : undefined;
};

/** Pair channels to models by upstream model name match (M.model ∈ C.models) */
const pairChannelsToModels = (
  channels: Array<AiproxyChannel | AiproxyGroupChannel> = [],
  models: ChannelAssociableModel[] = []
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

/** 规范化 AI Proxy 错误信息 */
export const normalizeAiproxyError = (error: unknown): ModelErrEnum | string => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 404) return ModelErrEnum.channelNotExist;
  if (status === 401 || status === 403) return ModelErrEnum.unAuthChannel;
  if (
    status === 500 &&
    /record not found/i.test(
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message || ''
    )
  ) {
    return ModelErrEnum.channelNotExist;
  }
  return getErrText(error, ModelErrEnum.unExist);
};

const rejectNormalized = (error: unknown): Promise<never> =>
  Promise.reject(normalizeAiproxyError(error));

/** 规范化 AI Proxy relay 无可用渠道的错误 */
export const normalizeRelayNoChannelError = <T>(error: T): T | ModelErrEnum => {
  const status =
    (error as { status?: number; response?: { status?: number } })?.status ??
    (error as { status?: number; response?: { status?: number } })?.response?.status;
  if (
    status === 404 &&
    /no available channel|无可用渠道|channel not found|channel_not_found/i.test(getErrText(error))
  ) {
    return ModelErrEnum.noAvailableChannel;
  }
  return error;
};

/** 校验成员是否拥有模型创建权限 */
export const assertMemberChannelPermission = (tmbPer: TeamPermission): Promise<void> => {
  if (!tmbPer.hasModelCreatePer) return Promise.reject(ModelErrEnum.unAuthChannel);
  return Promise.resolve();
};

/** 校验成员是否操作自有分组下的渠道 */
export const assertOwnGroupChannel = (
  channel: AiproxyGroupChannel,
  tmbId: string
): Promise<void> => {
  if (channel.group_id !== getSystemGroupId(tmbId)) {
    return Promise.reject(ModelErrEnum.unAuthChannel);
  }
  return Promise.resolve();
};

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
  models: ChannelAssociableModel[]
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
    const ownerModelsByTmb = new Map<string, ChannelAssociableModel[]>();
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
    // protection must reflect current state)
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

/** 获取指定渠道关联的模型列表 */
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

/** 获取指定模型关联的渠道数量 */
export const getModelChannelRefs = async (modelData: ChannelAssociableModel): Promise<number> => {
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
  bucketModels: ChannelAssociableModel[]
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

/** System channels view (root) — relatedModelCount counts the system model bucket */
export const getSystemChannelList = async ({
  pageNum,
  pageSize,
  search
}: {
  pageNum?: number;
  pageSize?: number;
  search?: string;
} = {}): Promise<{ list: ChannelListItem[]; total: number }> => {
  try {
    const systemModels = getSystemModels();
    const { channels = [], total = 0 } = await listSystemChannels({
      page: pageNum,
      perPage: pageSize,
      search
    });
    const list = (channels || []).map((ch) => buildChannelListItem(ch, systemModels));
    return { list, total };
  } catch (error) {
    return rejectNormalized(error);
  }
};

/** Member channels view — the member's own group channels, owner bucket counts */
export const getMemberChannelList = async ({
  tmbId,
  pageNum,
  pageSize,
  search
}: {
  tmbId: string;
  pageNum?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ list: ChannelListItem[]; total: number }> => {
  try {
    const ownerModels = getOwnerModels(tmbId);
    const { channels = [], total = 0 } = await listGroupChannels(getSystemGroupId(tmbId), {
      page: pageNum,
      perPage: pageSize,
      search
    });
    const list = (channels || []).map((ch) => buildChannelListItem(ch, ownerModels));
    return { list, total };
  } catch (error) {
    return rejectNormalized(error);
  }
};

/** Root cross-member view — all member channels, per-owner bucket counts */
export const getGlobalGroupChannelList = async ({
  groupId,
  pageNum,
  pageSize,
  search
}: {
  groupId?: string;
  pageNum?: number;
  pageSize?: number;
  search?: string;
} = {}): Promise<{ list: ChannelListItem[]; total: number }> => {
  try {
    const { channels = [], total = 0 } = await listGlobalGroupChannels({
      groupId,
      page: pageNum,
      perPage: pageSize,
      search
    });
    // Group channels by owner so each channel is counted against its own bucket
    const list = (channels || []).map((ch) => {
      const tmbId = parseTmbIdFromGroupId(ch.group_id);
      const bucketModels = tmbId ? getOwnerModels(tmbId) : [];
      return buildChannelListItem(ch, bucketModels);
    });
    // 批量解析当前页渠道创建人信息
    const sourceMemberMap = await getSourceMembersByTmbIds(
      list
        .map((item) => (item.group_id ? parseTmbIdFromGroupId(item.group_id) : undefined))
        .filter((tmbId): tmbId is string => !!tmbId)
    );
    return {
      list: list.map((item) => {
        const tmbId = item.group_id ? parseTmbIdFromGroupId(item.group_id) : undefined;
        return {
          ...item,
          ...(tmbId ? { sourceMember: sourceMemberMap.get(tmbId) } : {})
        };
      }),
      total
    };
  } catch (error) {
    return rejectNormalized(error);
  }
};

export const batchDeleteMemberChannels = async ({
  tmbId,
  ids
}: {
  tmbId: string;
  ids: number[];
}): Promise<void> => {
  try {
    await batchDeleteGroupChannels(getSystemGroupId(tmbId), ids);
  } catch (error) {
    return rejectNormalized(error);
  }
};

export const batchUpdateMemberChannelStatus = async ({
  tmbId,
  ids,
  status
}: {
  tmbId: string;
  ids: number[];
  status: ChannelStatus;
}): Promise<void> => {
  try {
    await batchUpdateGroupChannelStatus(getSystemGroupId(tmbId), ids, status);
  } catch (error) {
    return rejectNormalized(error);
  }
};

export const batchDeleteSystemChannels = async ({ ids }: { ids: number[] }): Promise<void> => {
  try {
    await requestBatchDeleteSystemChannels(ids);
  } catch (error) {
    return rejectNormalized(error);
  }
};

export const batchUpdateSystemChannelStatus = async ({
  ids,
  status
}: {
  ids: number[];
  status: ChannelStatus;
}): Promise<void> => {
  try {
    await requestBatchUpdateSystemChannelStatus(ids, status);
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

/** 批量解析成员用户名（供管理员视图使用） */
export const getTmbNamesByTmbIds = async (tmbIds: string[]): Promise<Map<string, string>> => {
  const ids = tmbIds.filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();

  const tmbList = await MongoTeamMember.find({ _id: { $in: ids } })
    .populate<{ user: UserModelSchema }>('user')
    .lean();
  return new Map(tmbList.map((tmb) => [String(tmb._id), tmb.user?.username || '']));
};

/**
 * 聚合管理员模型界面需要的渠道展示信息。
 *
 * 名称和状态来自 AI Proxy，协议名称与图标来自 Plugin 缓存；结果统一按创建时间倒序，
 * 保证模型列表、详情弹窗、关联弹窗与渠道管理页看到相同的渠道顺序。
 */
export const getAdminAIProxyChannelItems = async () => {
  const { channels } = await listSystemChannels();
  const metadata = getModelProviderMetadata();
  const protocolMap = new Map(
    (metadata.aiproxyChannels || []).map((protocol) => [protocol.channelId, protocol])
  );

  return [...channels]
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || b.id - a.id)
    .map((channel) => {
      const protocol = protocolMap.get(channel.type);

      return {
        models: channel.models || [],
        summary: {
          id: channel.id,
          name: channel.name,
          protocol: protocol
            ? { name: protocol.name, avatar: protocol.avatar }
            : {
                name: {
                  en: String(channel.type),
                  'zh-CN': String(channel.type),
                  'zh-Hant': String(channel.type)
                },
                avatar: ''
              },
          status: channel.status ?? 0
        }
      };
    });
};

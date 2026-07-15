import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';

const CREATE_CONTEXT_KEY = 'fastgpt_agent_skill_create_context';
export const AGENT_SKILL_PENDING_ASSOCIATE_KEY = 'fastgpt_agent_skill_pending_associate';
export const AGENT_SKILL_ASSOCIATE_CHANNEL = 'fastgpt_agent_skill_associate';
const PENDING_ASSOCIATE_KEY = AGENT_SKILL_PENDING_ASSOCIATE_KEY;

export type AgentSkillCreateContext = {
  appId: string;
  selectedSkillIds: string[];
};

type PendingAgentSkillAssociate = {
  appId: string;
  skill: SelectedAgentSkillItemType;
};

type PendingAgentSkillAssociateMap = Record<string, SelectedAgentSkillItemType>;

/** 使用 localStorage，以便 Agent 编辑页与 Dashboard 新标签页之间共享创建/关联上下文 */
const getAssociateStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

export const normalizeAssociateAppId = (appId: string) => String(appId).trim();

export const isSameAssociateAppId = (left: string, right: string) =>
  normalizeAssociateAppId(left) === normalizeAssociateAppId(right);

/** Agent 空态跳转 Dashboard 创建前，记录要给哪个 App 关联 skill */
export const setAgentSkillCreateContext = (context: AgentSkillCreateContext) => {
  getAssociateStorage()?.setItem(
    CREATE_CONTEXT_KEY,
    JSON.stringify({
      appId: normalizeAssociateAppId(context.appId),
      selectedSkillIds: context.selectedSkillIds
    })
  );
};

export const getAgentSkillCreateContext = (): AgentSkillCreateContext | null => {
  const raw = getAssociateStorage()?.getItem(CREATE_CONTEXT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AgentSkillCreateContext;
    if (!parsed.appId) return null;
    return {
      appId: normalizeAssociateAppId(parsed.appId),
      selectedSkillIds: parsed.selectedSkillIds || []
    };
  } catch {
    return null;
  }
};

export const clearAgentSkillCreateContext = () => {
  getAssociateStorage()?.removeItem(CREATE_CONTEXT_KEY);
};

const parsePendingAgentSkillAssociateMap = (
  raw?: string | null
): PendingAgentSkillAssociateMap | null => {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    // 兼容旧版单条 pending 结构，避免升级后丢失已经写入的待关联 skill。
    if (
      'appId' in parsed &&
      'skill' in parsed &&
      typeof parsed.appId === 'string' &&
      !!parsed.skill &&
      typeof parsed.skill === 'object'
    ) {
      const pendingSkill = parsed.skill as SelectedAgentSkillItemType;
      return {
        [normalizeAssociateAppId(parsed.appId)]: pendingSkill
      };
    }

    return parsed as PendingAgentSkillAssociateMap;
  } catch {
    return null;
  }
};

/** 从 Dashboard 打开参数解析 Agent 关联上下文（URL 比 localStorage 更可靠） */
export const parseAgentSkillCreateContextFromQuery = (query: {
  associateAppId?: string | string[];
  excludeSkillIds?: string | string[];
}): AgentSkillCreateContext | null => {
  const associateAppId = Array.isArray(query.associateAppId)
    ? query.associateAppId[0]
    : query.associateAppId;
  if (!associateAppId) return null;

  const excludeSkillIdsRaw = Array.isArray(query.excludeSkillIds)
    ? query.excludeSkillIds[0]
    : query.excludeSkillIds;

  return {
    appId: normalizeAssociateAppId(associateAppId),
    selectedSkillIds: excludeSkillIdsRaw
      ? excludeSkillIdsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : []
  };
};

/** Dashboard 创建成功后，写入待关联 skill，供 Agent 编辑页恢复 */
export const setPendingAgentSkillAssociate = (payload: PendingAgentSkillAssociate) => {
  const storage = getAssociateStorage();
  const pendingMap = parsePendingAgentSkillAssociateMap(storage?.getItem(PENDING_ASSOCIATE_KEY));
  if (!storage || !pendingMap) return;

  pendingMap[normalizeAssociateAppId(payload.appId)] = payload.skill;
  storage.setItem(PENDING_ASSOCIATE_KEY, JSON.stringify(pendingMap));
};

/** Agent 编辑页进入时读取并清除待关联 skill */
export const consumePendingAgentSkillAssociate = (
  appId: string
): SelectedAgentSkillItemType | null => {
  const storage = getAssociateStorage();
  const pendingMap = parsePendingAgentSkillAssociateMap(storage?.getItem(PENDING_ASSOCIATE_KEY));

  if (!storage || !pendingMap) {
    storage?.removeItem(PENDING_ASSOCIATE_KEY);
    return null;
  }

  const normalizedAppId = normalizeAssociateAppId(appId);
  const skill = pendingMap[normalizedAppId];
  if (!skill) return null;

  delete pendingMap[normalizedAppId];
  if (Object.keys(pendingMap).length === 0) {
    storage?.removeItem(PENDING_ASSOCIATE_KEY);
  } else {
    storage.setItem(PENDING_ASSOCIATE_KEY, JSON.stringify(pendingMap));
  }
  return skill;
};

import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import {
  AGENT_SKILL_ASSOCIATE_CHANNEL,
  AGENT_SKILL_PENDING_ASSOCIATE_KEY,
  consumePendingAgentSkillAssociate,
  isSameAssociateAppId,
  normalizeAssociateAppId,
  setPendingAgentSkillAssociate
} from '@/web/core/skill/agentSkillCreateAssociate';

export const AGENT_SKILL_ASSOCIATE_MESSAGE_TYPE = 'agent_skill_created' as const;

export type AgentSkillAssociateMessage = {
  type: typeof AGENT_SKILL_ASSOCIATE_MESSAGE_TYPE;
  appId: string;
  skill: SelectedAgentSkillItemType;
};

const isAgentSkillAssociateMessage = (data: unknown): data is AgentSkillAssociateMessage => {
  if (!data || typeof data !== 'object') return false;
  const message = data as AgentSkillAssociateMessage;
  return (
    message.type === AGENT_SKILL_ASSOCIATE_MESSAGE_TYPE &&
    typeof message.appId === 'string' &&
    !!message.skill &&
    typeof message.skill.skillId === 'string'
  );
};

/** Dashboard 创建成功后，跨页回传 skill 给 Agent 编辑页 */
export const notifyAgentSkillCreated = (payload: {
  appId: string;
  skill: SelectedAgentSkillItemType;
}) => {
  if (typeof window === 'undefined') return;

  const message: AgentSkillAssociateMessage = {
    type: AGENT_SKILL_ASSOCIATE_MESSAGE_TYPE,
    appId: normalizeAssociateAppId(payload.appId),
    skill: payload.skill
  };

  // 1. localStorage：切标签页 / 刷新后的兜底
  setPendingAgentSkillAssociate({ appId: message.appId, skill: message.skill });

  // 2. BroadcastChannel：同域多标签页实时回传
  try {
    const channel = new BroadcastChannel(AGENT_SKILL_ASSOCIATE_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // ignore
  }

  // 3. window.opener：从 Agent 页 window.open 打开的子页直接回传
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin);
    }
  } catch {
    // ignore
  }
};

/**
 * Agent 编辑页绑定跨页回传监听。
 * 收到 Dashboard 创建结果后直接关联 skill，并保留 localStorage 兜底。
 */
export const bindAgentSkillAssociateListener = (
  appId: string,
  onAssociate: (skill: SelectedAgentSkillItemType) => boolean | void
) => {
  if (typeof window === 'undefined') return () => {};

  const normalizedAppId = normalizeAssociateAppId(appId);
  if (!normalizedAppId) return () => {};

  const applyAssociateMessage = (message: AgentSkillAssociateMessage) => {
    if (!isSameAssociateAppId(message.appId, normalizedAppId)) return;

    const added = onAssociate(message.skill);
    if (added === false) {
      setPendingAgentSkillAssociate({ appId: message.appId, skill: message.skill });
      return;
    }
    consumePendingAgentSkillAssociate(normalizedAppId);
  };

  const applyPendingAssociate = () => {
    const pendingSkill = consumePendingAgentSkillAssociate(normalizedAppId);
    if (!pendingSkill) return;

    const added = onAssociate(pendingSkill);
    if (added === false) {
      setPendingAgentSkillAssociate({ appId: normalizedAppId, skill: pendingSkill });
    }
  };

  const onBroadcastMessage = (event: MessageEvent) => {
    if (!isAgentSkillAssociateMessage(event.data)) return;
    applyAssociateMessage(event.data);
  };

  const onWindowMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (!isAgentSkillAssociateMessage(event.data)) return;
    applyAssociateMessage(event.data);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== AGENT_SKILL_PENDING_ASSOCIATE_KEY) return;
    applyPendingAssociate();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      applyPendingAssociate();
    }
  };

  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(AGENT_SKILL_ASSOCIATE_CHANNEL);
    channel.onmessage = onBroadcastMessage;
  } catch {
    // ignore
  }

  applyPendingAssociate();
  window.addEventListener('message', onWindowMessage);
  window.addEventListener('focus', applyPendingAssociate);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.removeEventListener('message', onWindowMessage);
    window.removeEventListener('focus', applyPendingAssociate);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    channel?.close();
  };
};

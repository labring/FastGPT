import { GET, DELETE, POST } from '@/web/common/api/request';
import { downloadFetch } from '@/web/common/system/utils';
import { EventStreamContentType, fetchEventSource } from '@fortaine/fetch-event-source';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import type {
  ListSkillsQuery,
  ListSkillsResponse,
  CreateSkillBody,
  GetSkillDetailQuery,
  GetSkillDetailResponse,
  UpdateSkillBody,
  CopySkillBody,
  CopySkillResponse,
  SaveDeploySkillBody,
  SaveDeploySkillResponse,
  GetSkillFolderPathQuery,
  GetSkillFolderPathResponse,
  CreateEditDebugSandboxBody,
  CreateEditDebugSandboxResponse,
  CreateSkillFolderBody,
  SkillDebugRecordsBody,
  ListAppsBySkillIdResponse,
  ListSkillVersionsBody,
  ListSkillVersionsResponse,
  SwitchSkillVersionBody,
  UpdateSkillVersionBody
} from '@fastgpt/global/core/agentSkills/api';
import type { getChatRecordsResponse } from '@/pages/api/core/chat/record/getRecords_v2';
import type { SkillDebugDeleteChatItemBody } from '@fastgpt/global/core/agentSkills/api';
import type { GetResourceFolderListProps } from '@fastgpt/global/common/parentFolder/type';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';

/** 获取 Skill 列表（支持分页、搜索、分类、文件夹过滤） */
export const getSkillList = (data: ListSkillsQuery) =>
  POST<ListSkillsResponse>('/core/agentSkills/list', data);

/** 获取 Skill 文件夹列表（用于移动弹窗） */
export const getSkillFolderList = ({ parentId }: GetResourceFolderListProps) =>
  getSkillList({
    source: 'mine',
    type: AgentSkillTypeEnum.folder,
    parentId: parentId ?? null
  }).then((res) => res.list.map((item) => ({ id: item._id, name: item.name })));

/** 获取 Skill 详情 */
export const getSkillDetail = (data: GetSkillDetailQuery) =>
  GET<GetSkillDetailResponse>('/core/agentSkills/detail', data);

/** 创建 Skill（支持 AI 辅助生成 SKILL.md） */
export const postCreateSkill = (data: CreateSkillBody) =>
  POST<string>('/core/agentSkills/create', data);

/** 更新 Skill 基本信息（名称、描述、分类、配置、头像） */
export const postUpdateSkill = (data: UpdateSkillBody) => POST('/core/agentSkills/update', data);

/** 创建 Skill 副本 */
export const postCopySkill = (data: CopySkillBody) =>
  POST<CopySkillResponse>('/core/agentSkills/copy', data);

/** 删除 Skill */
export const deleteSkill = (skillId: string) => DELETE('/core/agentSkills/delete', { skillId });

/** 导入 Skill 压缩包 */
export const importSkill = (formData: FormData) =>
  POST<string>('/core/agentSkills/import', formData);

/** 从 Sandbox 打包并发布新版本 */
export const postSaveDeploySkill = (data: SaveDeploySkillBody) =>
  POST<SaveDeploySkillResponse>('/core/agentSkills/save-deploy', data);

/** 创建编辑调试沙箱（SSE 流式返回状态，最终推送 endpoint 信息） */
export const postCreateEditDebugSandbox = (data: CreateEditDebugSandboxBody) =>
  POST<CreateEditDebugSandboxResponse>('/core/agentSkills/edit', data);

/** 创建编辑调试沙箱 — SSE 流式版本，逐阶段回调 */
export const streamCreateEditDebugSandbox = ({
  data,
  onStatus,
  onError,
  abortCtrl
}: {
  data: CreateEditDebugSandboxBody;
  onStatus: (status: SandboxStatusItemType) => void;
  onError: (err: string) => void;
  abortCtrl: AbortController;
}): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      abortCtrl.abort('Timeout');
    }, 60000);

    fetchEventSource(getWebReqUrl('/api/core/agentSkills/edit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: abortCtrl.signal,
      async onopen(res) {
        clearTimeout(timeoutId);
        if (!res.ok || !res.headers.get('content-type')?.startsWith(EventStreamContentType)) {
          try {
            const errData = await res.clone().json();
            reject(errData?.message || 'SSE open failed');
          } catch {
            reject('SSE open failed');
          }
        }
      },
      onmessage({ event, data: rawData }) {
        if (event === SseResponseEventEnum.sandboxStatus) {
          try {
            const status: SandboxStatusItemType = JSON.parse(rawData);
            onStatus(status);
          } catch {}
        } else if (event === SseResponseEventEnum.error) {
          try {
            const err = JSON.parse(rawData);
            onError(err?.message || 'Unknown error');
          } catch {
            onError(rawData || 'Unknown error');
          }
        }
      },
      onclose() {
        resolve();
      },
      onerror(err) {
        clearTimeout(timeoutId);
        reject(err?.message || String(err) || 'SSE connection error');
        throw err; // stop retrying
      },
      openWhenHidden: true
    });
  });

/** Skill 调试对话 SSE 接口 URL */
export const SKILL_DEBUG_CHAT_URL = '/api/core/agentSkills/debugChat';

/** 创建 Skill 文件夹 */
export const postCreateSkillFolder = (data: CreateSkillFolderBody) =>
  POST('/core/agentSkills/folder/create', data);

/** 获取 Skill 文件夹路径 */
export const getSkillFolderPath = (data: GetSkillFolderPathQuery) =>
  GET<GetSkillFolderPathResponse>('/core/agentSkills/folder/path', data);

/** 导出 Skill 压缩包（触发浏览器下载） */
export const exportSkill = (skillId: string, skillName: string) =>
  downloadFetch({
    url: `/api/core/agentSkills/export?skillId=${encodeURIComponent(skillId)}`,
    filename: `${skillName}.zip`
  });

/** 获取引用了某个 Skill 的应用列表 */
export const getAppsBySkillId = (skillId: string) =>
  GET<ListAppsBySkillIdResponse>('/core/agentSkills/apps', { skillId });

/** 删除 Skill 调试会话中的单条对话消息（用于"重新生成"时清除旧记录） */
export const delSkillDebugChatItem = (data: SkillDebugDeleteChatItemBody) =>
  POST('/core/agentSkills/debugSession/chatItem/delete', data);

/** 获取 Skill 调试会话的对话记录（用于预览界面加载历史记录） */
export const getSkillDebugRecords = (data: SkillDebugRecordsBody) =>
  POST<getChatRecordsResponse>('/core/agentSkills/debugSession/records', data);

/** 获取 Skill 历史版本列表（支持分页滚动加载） */
export const getSkillVersionList = (data: ListSkillVersionsBody) =>
  POST<ListSkillVersionsResponse>('/core/agentSkills/version/list', data);

/** 切换 Skill 当前激活版本 */
export const postSwitchSkillVersion = (data: SwitchSkillVersionBody) =>
  POST('/core/agentSkills/version/switch', data);

/** 更新 Skill 版本名称 */
export const postUpdateSkillVersion = (data: UpdateSkillVersionBody) =>
  POST('/core/agentSkills/version/update', data);

/** 恢复 Skill 权限继承 */
export const resumeInheritPer = (skillId: string) =>
  GET('/core/agentSkills/resumeInheritPermission', { skillId });

/** 转让 Skill 所有者 */
export const postChangeSkillOwner = (data: { skillId: string; ownerId: string }) =>
  POST('/proApi/core/agentSkills/changeOwner', data);

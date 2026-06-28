import { GET, DELETE, POST } from '@/web/common/api/request';
import { streamFetch, type StreamResponseType } from '@/web/common/api/fetch';
import { downloadFetch } from '@/web/common/system/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
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
  CreateSkillFolderBody,
  SkillDebugChatBody,
  ListAppsBySkillIdResponse,
  ListSkillVersionsBody,
  ListSkillVersionsResponse,
  SkillRuntimeBody,
  SkillRuntimeStatusResponse,
  SwitchSkillVersionBody,
  UpdateSkillVersionBody
} from '@fastgpt/global/core/ai/skill/api';
import type { GetResourceFolderListProps } from '@fastgpt/global/common/parentFolder/type';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

/** 获取 Skill 列表（支持分页、搜索、分类、文件夹过滤） */
export const getSkillList = (data: ListSkillsQuery) =>
  POST<ListSkillsResponse>('/core/ai/skill/list', data);

/** 获取 Skill 文件夹列表（用于移动弹窗） */
export const getSkillFolderList = ({ parentId }: GetResourceFolderListProps) =>
  getSkillList({
    source: 'mine',
    type: AgentSkillTypeEnum.folder,
    parentId: parentId ?? null
  }).then((res) =>
    res.list
      .filter((item) => item.permission.hasWritePer)
      .map((item) => ({ id: item._id, name: item.name }))
  );

/** 获取 Skill 详情 */
export const getSkillDetail = (data: GetSkillDetailQuery) =>
  GET<GetSkillDetailResponse>('/core/ai/skill/detail', data);

/** 创建 Skill（支持 AI 辅助生成 SKILL.md） */
export const postCreateSkill = (data: CreateSkillBody) =>
  POST<string>('/core/ai/skill/create', data);

/** 更新 Skill 基本信息（名称、描述、分类、配置、头像） */
export const postUpdateSkill = (data: UpdateSkillBody) => POST('/core/ai/skill/update', data);

/** 创建 Skill 副本 */
export const postCopySkill = (data: CopySkillBody) =>
  POST<CopySkillResponse>('/core/ai/skill/copy', data);

/** 删除 Skill */
export const deleteSkill = (skillId: string) => DELETE('/core/ai/skill/delete', { skillId });

/** 导入 Skill 压缩包 */
export const importSkill = (formData: FormData) => POST<string>('/core/ai/skill/import', formData);

/** 从 Sandbox 打包并发布新版本 */
export const postSaveDeploySkill = (data: SaveDeploySkillBody) =>
  POST<SaveDeploySkillResponse>('/core/ai/skill/save-deploy', data);

/** 获取 Skill Edit runtime 状态 */
export const getSkillRuntimeStatus = (data: SkillRuntimeBody) =>
  POST<SkillRuntimeStatusResponse>('/core/ai/skill/runtime/getStatus', data);

/** 触发 Skill Edit runtime 升级归档 */
export const postUpgradeSkillRuntime = (data: SkillRuntimeBody) =>
  POST<SkillRuntimeStatusResponse>('/core/ai/skill/runtime/upgrade', data);

/** 初始化 Skill Edit runtime sandbox — SSE 流式版本，逐阶段回调 */
export const streamInitSkillRuntime = ({
  data,
  onStatus,
  onError,
  abortCtrl
}: {
  data: SkillRuntimeBody;
  onStatus: (status: SandboxStatusItemType) => void;
  onError: (err: string) => void;
  abortCtrl: AbortController;
}): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      abortCtrl.abort('Timeout');
    }, 60000);

    fetchEventSource(getWebReqUrl('/api/core/ai/skill/runtime/init'), {
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
        throw err;
      },
      openWhenHidden: true
    });
  });

/** 发起 Skill 调试对话，使用 Skill 专属鉴权与编辑沙箱运行态。 */
export const streamSkillDebugChat = ({
  data,
  onMessage,
  abortCtrl
}: {
  data: SkillDebugChatBody;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
}): Promise<StreamResponseType> => {
  const { feConfigs } = useSystemStore.getState();
  return streamFetch({
    url: feConfigs?.isPlus ? '/api/proApi/core/ai/skill/debugChat' : '/api/core/ai/skill/debugChat',
    data,
    onMessage,
    abortCtrl
  });
};

/** 创建 Skill 文件夹 */
export const postCreateSkillFolder = (data: CreateSkillFolderBody) =>
  POST('/core/ai/skill/folder/create', data);

/** 获取 Skill 文件夹路径 */
export const getSkillFolderPath = (data: GetSkillFolderPathQuery) =>
  GET<GetSkillFolderPathResponse>('/core/ai/skill/folder/path', data);

/** 导出当前 Skill 编辑沙盒工作区压缩包（触发浏览器下载） */
export const exportSkill = (skillId: string, skillName: string) => {
  const { setLoading } = useSystemStore.getState();
  setLoading(true);
  return downloadFetch({
    url: `/api/core/ai/skill/export?skillId=${encodeURIComponent(skillId)}`,
    filename: `${skillName}.zip`,
    waitResponse: true
  }).finally(() => {
    setLoading(false);
  });
};

/** 获取引用了某个 Skill 的应用列表 */
export const getAppsBySkillId = (skillId: string) =>
  GET<ListAppsBySkillIdResponse>('/core/ai/skill/apps', { skillId });

/** 获取 Skill 历史版本列表（支持分页滚动加载） */
export const getSkillVersionList = (data: ListSkillVersionsBody) =>
  POST<ListSkillVersionsResponse>('/core/ai/skill/version/list', data);

/** 切换 Skill 当前激活版本 */
export const postSwitchSkillVersion = (data: SwitchSkillVersionBody) =>
  POST('/core/ai/skill/version/switch', data);

/** 更新 Skill 版本名称 */
export const postUpdateSkillVersion = (data: UpdateSkillVersionBody) =>
  POST('/core/ai/skill/version/update', data);

/** 恢复 Skill 权限继承 */
export const resumeInheritPer = (skillId: string) =>
  GET('/core/ai/skill/resumeInheritPermission', { skillId });

/** 转让 Skill 所有者 */
export const postChangeSkillOwner = (data: { skillId: string; ownerId: string }) =>
  POST('/proApi/core/ai/skill/changeOwner', data);

import { GET, DELETE, POST } from '@/web/common/api/request';
import { downloadFetch } from '@/web/common/system/utils';
import type {
  ListSkillsQuery,
  ListSkillsResponse,
  CreateSkillBody,
  GetSkillDetailQuery,
  GetSkillDetailResponse,
  UpdateSkillBody,
  CopySkillBody,
  CopySkillResponse,
  GetSkillFolderPathQuery,
  GetSkillFolderPathResponse,
  CreateSkillFolderBody,
  SkillDebugRecordsBody,
  ListAppsBySkillIdResponse
} from '@fastgpt/global/core/agentSkills/api';
import type { SkillDebugDeleteChatItemBody } from '@fastgpt/global/core/agentSkills/api';
import type { GetResourceFolderListProps } from '@fastgpt/global/common/parentFolder/type';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { GetRecordsV2ResponseType } from '@fastgpt/global/openapi/core/chat/record/api';

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

/** 创建 Skill 副本 */
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
  POST<GetRecordsV2ResponseType>('/core/agentSkills/debugSession/records', data);

/** 恢复 Skill 权限继承 */
export const resumeInheritPer = (skillId: string) =>
  GET('/core/agentSkills/resumeInheritPermission', { skillId });

/** 转让 Skill 所有者 */
export const postChangeSkillOwner = (data: { skillId: string; ownerId: string }) =>
  POST('/proApi/core/agentSkills/changeOwner', data);

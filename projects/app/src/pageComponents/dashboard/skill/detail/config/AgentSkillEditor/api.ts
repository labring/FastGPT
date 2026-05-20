import type {
  ListPackageFilesBody,
  ListPackageFilesResponse,
  ReadPackageFileBody,
  WritePackageFileBody,
  BatchWritePackageFilesBody,
  DeletePackageEntryBody,
  RenamePackageEntryBody,
  MkdirPackageBody,
  MutatePackageResponse,
  SyncSkillSandboxBody,
  SyncSkillSandboxResponse,
  CheckPackageVersionBody,
  CheckPackageVersionResponse
} from '@fastgpt/global/openapi/core/agentSkills/package/api';
import { POST } from '@/web/common/api/request';

/**
 * 列出 Skill 包内目录
 */
export const listSkillPackageFiles = (data: ListPackageFilesBody) =>
  POST<ListPackageFilesResponse>('/core/agentSkills/package/list', data);

/**
 * 读取 Skill 包内文件（原始流，前端按需 utf-8 / blob 解码）
 */
export const getSkillPackageFile = async (data: ReadPackageFileBody) => {
  const response = await fetch('/api/core/agentSkills/package/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `Fetch file failed: ${response.status}`);
  }
  return response;
};

/**
 * 写入单文件
 */
export const writeSkillPackageFile = (data: WritePackageFileBody) =>
  POST<MutatePackageResponse>('/core/agentSkills/package/write', data);

/**
 * 批量写入文本文件（单次 zip 重写）
 */
export const batchWriteSkillPackageFiles = (data: BatchWritePackageFilesBody) =>
  POST<MutatePackageResponse>('/core/agentSkills/package/batchWrite', data);

/**
 * 删除文件或目录
 */
export const deleteSkillPackageEntry = (data: DeletePackageEntryBody) =>
  POST<MutatePackageResponse>('/core/agentSkills/package/delete', data);

/**
 * 重命名文件或目录
 */
export const renameSkillPackageEntry = (data: RenamePackageEntryBody) =>
  POST<MutatePackageResponse>('/core/agentSkills/package/rename', data);

/**
 * 新建目录
 */
export const mkdirSkillPackageEntry = (data: MkdirPackageBody) =>
  POST<MutatePackageResponse>('/core/agentSkills/package/mkdir', data);

/**
 * 上传二进制文件
 */
export const uploadSkillPackageFile = async (params: {
  skillId: string;
  path: string;
  file: File;
}): Promise<MutatePackageResponse> => {
  const form = new FormData();
  form.append('skillId', params.skillId);
  form.append('path', params.path);
  form.append('file', params.file);

  const response = await fetch('/api/core/agentSkills/package/upload', {
    method: 'POST',
    body: form
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Upload failed: ${response.status}`);
  }

  try {
    const json = JSON.parse(text) as {
      code: number;
      data: MutatePackageResponse;
      message?: string;
    };
    if (json.code < 200 || json.code >= 400) {
      throw new Error(json.message || 'Upload failed');
    }
    return json.data;
  } catch {
    throw new Error('Failed to parse response as JSON');
  }
};

/**
 * 同步当前 Skill 包到正在运行的沙箱（Run Preview 前调用）
 */
export const syncSkillSandbox = (data: SyncSkillSandboxBody) =>
  POST<SyncSkillSandboxResponse>('/core/agentSkills/package/sandbox/sync', data);

/**
 * 检查 Skill 包的 packageVersion 是否自 knownVersion 后发生变化。
 * 用于前端轮询检测来自其他副本/会话的编辑。
 */
export const checkSkillPackageVersion = (data: CheckPackageVersionBody) =>
  POST<CheckPackageVersionResponse>('/core/agentSkills/package/checkVersion', data);

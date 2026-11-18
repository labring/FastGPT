import z from 'zod';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { normalizeWorkflowDocument } from '@fastgpt/workflow-core/domain/checksum';
import { parseCompatibleWorkflowDocument } from '@fastgpt/workflow-core/domain/document';
import type { FileIoAdapter } from '../../infra/fs/file-io';
import { CliArgumentError } from '../../shared/errors';
import { rethrowMappedWorkflowError } from './workflow-error';

export const WORKFLOW_FILE_NAME = 'workflow.json';
export const WORKFLOW_SYNC_FILE_NAME = '.fastgpt-workflow-sync.json';

export const WorkflowSyncStateSchema = z.object({
  appId: z.string().min(1),
  baseUrl: z.string().optional(),
  lastSyncedAt: z.string(),
  lastChecksum: z.string().min(1),
  lastRemoteChecksum: z.string().min(1).optional(),
  lastAction: z.enum(['pull', 'push', 'publish']),
  lastVersionId: z.string().optional(),
  lastVersionName: z.string().optional()
});

export type WorkflowSyncState = z.infer<typeof WorkflowSyncStateSchema>;

/**
 * 解析并校验本地 workflow.json 文档结构与版本兼容性。
 */
export function parseWorkflowDocumentInput(input: unknown): WorkflowDocument {
  try {
    return parseCompatibleWorkflowDocument(input);
  } catch (error) {
    return rethrowMappedWorkflowError(error);
  }
}

/**
 * 规范化并序列化工作流文档，保证磁盘内容与校验和计算一致。
 */
export function serializeWorkflowDocument(document: WorkflowDocument): string {
  return `${JSON.stringify(normalizeWorkflowDocument(parseCompatibleWorkflowDocument(document)), null, 2)}\n`;
}

/**
 * 读取指定目录下的 workflow.json；缺失或 JSON 无效时给出可操作的 CliArgumentError。
 */
export async function readWorkflowDocument({
  fileIo,
  dir
}: {
  fileIo: FileIoAdapter;
  dir: string;
}): Promise<WorkflowDocument> {
  const exists = await fileIo.exists(WORKFLOW_FILE_NAME, dir);
  if (!exists) {
    const filePath = fileIo.resolvePath(WORKFLOW_FILE_NAME, dir);
    throw new CliArgumentError(
      `Workflow file "${filePath}" does not exist.`,
      { filePath },
      'Run: fastgpt workflow-build init or fastgpt app pull <appId>'
    );
  }

  const content = await fileIo.readTextFile(WORKFLOW_FILE_NAME, dir);
  try {
    return parseWorkflowDocumentInput(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliArgumentError('workflow.json must contain valid JSON.');
    }
    throw error;
  }
}

/**
 * 原子写入目录下的 workflow.json，避免中断导致工作流损坏。
 */
export async function writeWorkflowDocument({
  fileIo,
  dir,
  document
}: {
  fileIo: FileIoAdapter;
  dir: string;
  document: WorkflowDocument;
}): Promise<string> {
  return fileIo.writeTextAtomic(WORKFLOW_FILE_NAME, serializeWorkflowDocument(document), dir);
}

/**
 * 原子写入通用 JSON 产物（如 compiled StoreWorkflow 或 WorkflowPlan）。
 */
export async function writeJsonArtifact({
  fileIo,
  filePath,
  value,
  baseDir
}: {
  fileIo: FileIoAdapter;
  filePath: string;
  value: unknown;
  baseDir?: string;
}): Promise<string> {
  return fileIo.writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`, baseDir);
}

/**
 * 读取可选的同步元数据；未拉取/推送过或文件不存在时返回 undefined。
 */
export async function readWorkflowSyncState({
  fileIo,
  dir
}: {
  fileIo: FileIoAdapter;
  dir: string;
}): Promise<WorkflowSyncState | undefined> {
  const exists = await fileIo.exists(WORKFLOW_SYNC_FILE_NAME, dir);
  if (!exists) {
    return undefined;
  }
  const content = await fileIo.readTextFile(WORKFLOW_SYNC_FILE_NAME, dir);
  try {
    return WorkflowSyncStateSchema.parse(JSON.parse(content));
  } catch {
    throw new CliArgumentError(
      `Sync state file "${WORKFLOW_SYNC_FILE_NAME}" is invalid JSON or schema.`,
      undefined,
      `Re-sync with: fastgpt app pull <appId> --force`
    );
  }
}

/**
 * 原子写入同步元数据 `.fastgpt-workflow-sync.json`。
 */
export async function writeWorkflowSyncState({
  fileIo,
  dir,
  state
}: {
  fileIo: FileIoAdapter;
  dir: string;
  state: WorkflowSyncState;
}): Promise<string> {
  const validated = WorkflowSyncStateSchema.parse(state);
  return fileIo.writeTextAtomic(
    WORKFLOW_SYNC_FILE_NAME,
    `${JSON.stringify(validated, null, 2)}\n`,
    dir
  );
}

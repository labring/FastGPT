import {
  WorkflowCommandError,
  WorkflowValidationError,
  type WorkflowDiagnostic
} from '@fastgpt/workflow-core/domain/diagnostic';
import {
  WORKFLOW_DOCUMENT_MIGRATION_GUIDANCE,
  WorkflowDocumentVersionError
} from '@fastgpt/workflow-core/domain/document';
import { CliArgumentError } from '../../shared/errors';

function formatDiagnosticItem(item: unknown): string {
  if (typeof item === 'string') {
    return item;
  }
  if (item !== null && typeof item === 'object' && 'code' in item) {
    const diag = item as Partial<WorkflowDiagnostic>;
    const severity = diag.severity ?? 'warning';
    const code = diag.code ?? 'UNKNOWN_DIAGNOSTIC';
    const locationParts = [
      diag.nodeId ? `node=${diag.nodeId}` : '',
      diag.inputKey ? `input=${diag.inputKey}` : ''
    ].filter(Boolean);
    const location = locationParts.length > 0 ? ` (${locationParts.join(', ')})` : '';
    const paramsSuffix =
      diag.params && Object.keys(diag.params).length > 0 ? `: ${JSON.stringify(diag.params)}` : '';
    return `[${severity}] ${code}${location}${paramsSuffix}`;
  }
  return JSON.stringify(item);
}

/**
 * 将 workflow-core 的结构化诊断数组转换为纯文本 warning 列表，兼容 CliResult.warnings 字符串约束。
 */
export function formatWorkflowWarnings(items: readonly unknown[] | undefined): string[] {
  if (!items || items.length === 0) {
    return [];
  }
  return items.map((item) => formatDiagnosticItem(item));
}

function formatDiagnosticHeadline(
  prefix: string,
  diagnostics: readonly WorkflowDiagnostic[]
): string {
  const first = diagnostics[0];
  if (!first) {
    return `${prefix}.`;
  }
  const detail = formatDiagnosticItem(first);
  if (diagnostics.length === 1) {
    return `${prefix}: ${detail}`;
  }
  return `${prefix} (${diagnostics.length} issues; first: ${detail})`;
}

/**
 * 把 workflow-core 领域异常统一映射为退出码 2（CliArgumentError），同时在 details 保留结构化诊断供 Agent 读取。
 */
export function rethrowMappedWorkflowError(error: unknown): never {
  if (error instanceof WorkflowDocumentVersionError) {
    throw new CliArgumentError(
      error.message,
      {
        code: error.code,
        foundVersion: error.foundVersion,
        guidance: WORKFLOW_DOCUMENT_MIGRATION_GUIDANCE
      },
      WORKFLOW_DOCUMENT_MIGRATION_GUIDANCE
    );
  }
  if (error instanceof WorkflowCommandError) {
    throw new CliArgumentError(
      formatDiagnosticHeadline('Workflow command failed', error.diagnostics),
      {
        code: error.code,
        diagnostics: error.diagnostics
      },
      'Run: fastgpt workflow-build inspect --format json'
    );
  }
  if (error instanceof WorkflowValidationError) {
    throw new CliArgumentError(
      formatDiagnosticHeadline('Workflow validation failed', error.diagnostics),
      {
        code: error.code,
        diagnostics: error.diagnostics
      },
      'Fix the reported diagnostics and re-run: fastgpt workflow-build validate --format json'
    );
  }
  throw error;
}

/**
 * 包装本地工作流操作，统一执行领域异常映射。
 */
export async function withWorkflowErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return rethrowMappedWorkflowError(error);
  }
}

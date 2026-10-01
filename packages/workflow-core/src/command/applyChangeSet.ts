import { getWorkflowChecksum } from '../domain/checksum';
import { WorkflowCommandError, type WorkflowDiagnostic } from '../domain/diagnostic';
import type { WorkflowDocument } from '../domain/document';
import type { WorkflowTemplateProvider } from '../template/type';
import { validateWorkflow } from '../validation';
import { applyWorkflowCommand } from './apply';
import {
  WORKFLOW_PLAN_SCHEMA_VERSION,
  WorkflowChangeSetSchema,
  WorkflowPlanSchema,
  type WorkflowChangeSet,
  type WorkflowChangeSummary,
  type WorkflowPlan
} from './type';

export type WorkflowChangeSetResult = {
  document: WorkflowDocument;
  changes: WorkflowChangeSummary[];
  warnings: WorkflowDiagnostic[];
  diagnostics: WorkflowDiagnostic[];
  checksum: string;
};

type ChangeSetDependencies = {
  templateProvider: WorkflowTemplateProvider;
  locale?: string;
  translate?: (value: string) => string;
};

/**
 * 在内存副本中按顺序执行 ChangeSet。任一命令失败时不返回中间文档，所有领域修改仍复用单命令 dispatcher。
 * commands 是有序操作序列，执行器不得根据命令类型重排，否则会改变克隆、删除等命令的业务语义。
 */
export const applyWorkflowChangeSet = async ({
  document,
  changeSet: rawChangeSet,
  dependencies
}: {
  document: WorkflowDocument;
  changeSet: WorkflowChangeSet;
  dependencies: ChangeSetDependencies;
}): Promise<WorkflowChangeSetResult> => {
  const changeSet = WorkflowChangeSetSchema.parse(rawChangeSet);
  const baseChecksum = await getWorkflowChecksum(document);
  if (changeSet.baseChecksum !== baseChecksum) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_BASE_CHECKSUM_MISMATCH',
        severity: 'error',
        params: { expected: changeSet.baseChecksum, actual: baseChecksum }
      }
    ]);
  }

  let nextDocument = structuredClone(document);
  const changes: WorkflowChangeSummary[] = [];
  const warnings: WorkflowDiagnostic[] = [];
  for (const [commandIndex, command] of changeSet.commands.entries()) {
    try {
      const result = await applyWorkflowCommand({ document: nextDocument, command, dependencies });
      nextDocument = result.document;
      changes.push(...result.changes);
      warnings.push(...result.warnings);
    } catch (error) {
      if (error instanceof WorkflowCommandError) {
        throw new WorkflowCommandError(
          error.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            path: ['commands', commandIndex, ...(diagnostic.path ?? [])],
            params: {
              ...diagnostic.params,
              commandIndex,
              commandType: command.type
            }
          }))
        );
      }
      throw error;
    }
  }

  const diagnostics = validateWorkflow(nextDocument);
  return {
    document: nextDocument,
    changes,
    warnings,
    diagnostics,
    checksum: await getWorkflowChecksum(nextDocument)
  };
};

/**
 * 生成可审阅计划但不写入文档；apply 阶段必须重新执行并比较 targetChecksum。
 * 计划保留调用方提交的命令顺序，使审阅内容与实际执行语义完全一致。
 */
export const planWorkflowChangeSet = async ({
  document,
  changeSet: rawChangeSet,
  dependencies
}: {
  document: WorkflowDocument;
  changeSet: WorkflowChangeSet;
  dependencies: ChangeSetDependencies;
}): Promise<{ plan: WorkflowPlan; document: WorkflowDocument; warnings: WorkflowDiagnostic[] }> => {
  const changeSet = WorkflowChangeSetSchema.parse(rawChangeSet);
  const result = await applyWorkflowChangeSet({
    document,
    changeSet,
    dependencies
  });
  const plan = WorkflowPlanSchema.parse({
    schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
    baseChecksum: changeSet.baseChecksum,
    targetChecksum: result.checksum,
    changeSet,
    changes: result.changes,
    diagnostics: result.diagnostics
  });
  return { plan, document: result.document, warnings: result.warnings };
};

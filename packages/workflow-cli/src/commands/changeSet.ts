import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { option } from '../commandOptions';
import z from 'zod';
import {
  WorkflowChangeSetSchema,
  WorkflowPlanSchema,
  type WorkflowPlan
} from '@fastgpt/workflow-core/command/type';
import {
  WorkflowCommandError,
  WorkflowValidationError
} from '@fastgpt/workflow-core/domain/diagnostic';
import { getWorkflowChecksum } from '@fastgpt/workflow-core/domain/checksum';
import { planWorkflowChangeSet } from '@fastgpt/workflow-core/command/applyChangeSet';
import { type WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CliArgumentError } from '../error';
import { createTranslator } from '@fastgpt/web/i18n/workflowTemplate';
import { readWorkflowFile, writeJsonFileAtomic, writeWorkflowFileAtomic } from '../io/workflowFile';
import type { CliAuditEvent, CliContext, CliResult, CliCommandDefinition } from '../type';
import { requireString } from './helpers';

const readJsonInput = async ({
  source,
  context,
  label
}: {
  source: string;
  context: CliContext;
  label: string;
}) => {
  const content =
    source === '-'
      ? await context.readStdin()
      : await readFile(resolve(context.cwd, source), 'utf8');
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new CliArgumentError(`${label} must contain valid JSON`);
  }
};

const getChangedNodeIds = (plan: WorkflowPlan) => [
  ...new Set(plan.changes.flatMap((change) => (change.nodeId ? [change.nodeId] : [])))
];

const getChangedEdgeCount = (base: WorkflowDocument, target: WorkflowDocument) => {
  const baseEdges = new Set(base.executionEdges.map((edge) => JSON.stringify(edge)));
  const targetEdges = new Set(target.executionEdges.map((edge) => JSON.stringify(edge)));
  return (
    [...baseEdges].filter((edge) => !targetEdges.has(edge)).length +
    [...targetEdges].filter((edge) => !baseEdges.has(edge)).length
  );
};

const createDependencies = (context: CliContext) => ({
  templateProvider: context.templateProvider,
  locale: context.locale,
  translate: createTranslator(context.locale)
});

const createAuditEvent = ({
  command,
  document,
  targetDocument,
  plan,
  startedAt
}: {
  command: string;
  document: WorkflowDocument;
  targetDocument: WorkflowDocument;
  plan: WorkflowPlan;
  startedAt: number;
}): CliAuditEvent => ({
  command,
  appId: document.app.appId,
  baseChecksum: plan.baseChecksum,
  targetChecksum: plan.targetChecksum,
  changedNodeIds: getChangedNodeIds(plan),
  changedEdgeCount: getChangedEdgeCount(document, targetDocument),
  durationMs: Date.now() - startedAt,
  result: 'success'
});

const assertBaseChecksumUnchanged = async ({
  context,
  expectedChecksum
}: {
  context: CliContext;
  expectedChecksum: string;
}) => {
  const latestDocument = await readWorkflowFile(context.dir);
  const actualChecksum = await getWorkflowChecksum(latestDocument);
  if (actualChecksum !== expectedChecksum) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.baseChecksumMismatch,
        severity: 'error',
        params: { expected: expectedChecksum, actual: actualChecksum }
      }
    ]);
  }
};

/** 从版本化 JSON 生成计划；stdin 与文件输入共用同一 Schema 和领域编排。 */
export const planChangeSet = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const startedAt = Date.now();
  const source = requireString(input, 'input');
  const changeSet = WorkflowChangeSetSchema.parse(
    await readJsonInput({ source, context, label: 'ChangeSet input' })
  );
  const document = await readWorkflowFile(context.dir);
  const result = await planWorkflowChangeSet({
    document,
    changeSet,
    dependencies: createDependencies(context)
  });
  if (typeof input.output === 'string') {
    await writeJsonFileAtomic(resolve(context.cwd, input.output), result.plan);
  }
  return {
    changed: false,
    checksum: result.plan.targetChecksum,
    result: result.plan,
    changes: result.plan.changes,
    warnings: result.warnings,
    audit: createAuditEvent({
      command: 'changeset plan',
      document,
      targetDocument: result.document,
      plan: result.plan,
      startedAt
    })
  };
};

/** 重新执行计划并校验 base/target checksum，通过确认门禁后才原子写入 workflow.json。 */
export const applyChangeSetPlan = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const startedAt = Date.now();
  const source = requireString(input, 'plan');
  const suppliedPlan = WorkflowPlanSchema.parse(
    await readJsonInput({ source, context, label: 'Workflow plan' })
  );
  const document = await readWorkflowFile(context.dir);
  const recomputed = await planWorkflowChangeSet({
    document,
    changeSet: suppliedPlan.changeSet,
    dependencies: createDependencies(context)
  });
  if (recomputed.plan.targetChecksum !== suppliedPlan.targetChecksum) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.targetChecksumMismatch,
        severity: 'error',
        params: {
          expected: suppliedPlan.targetChecksum,
          actual: recomputed.plan.targetChecksum
        }
      }
    ]);
  }
  if (JSON.stringify(recomputed.plan) !== JSON.stringify(suppliedPlan)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.planContentMismatch,
        severity: 'error',
        params: { targetChecksum: recomputed.plan.targetChecksum }
      }
    ]);
  }
  if (recomputed.plan.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new WorkflowValidationError(recomputed.plan.diagnostics);
  }

  const dryRun = input.dryRun === true;
  if (!dryRun) {
    const targetChecksum = recomputed.plan.targetChecksum;
    if (typeof input.confirm === 'string' && input.confirm !== targetChecksum) {
      throw new CliArgumentError(
        '--confirm must equal the recomputed target checksum',
        { expected: targetChecksum, actual: input.confirm },
        WorkflowDiagnosticCodeEnum.cliConfirmChecksumMismatch
      );
    }
    if (input.confirm === undefined) {
      if (!context.isTTY) {
        throw new CliArgumentError(
          'Non-interactive apply requires --confirm with the target checksum',
          { targetChecksum },
          WorkflowDiagnosticCodeEnum.cliConfirmRequired
        );
      }
      if (!(await context.requestConfirmation(targetChecksum))) {
        throw new CliArgumentError(
          'Workflow plan was not confirmed',
          { targetChecksum },
          WorkflowDiagnosticCodeEnum.cliConfirmRejected
        );
      }
    }
    await assertBaseChecksumUnchanged({
      context,
      expectedChecksum: recomputed.plan.baseChecksum
    });
    await writeWorkflowFileAtomic(context.dir, recomputed.document);
  }

  return {
    changed: true,
    checksum: recomputed.plan.targetChecksum,
    result: {
      dryRun,
      baseChecksum: recomputed.plan.baseChecksum,
      targetChecksum: recomputed.plan.targetChecksum,
      diagnostics: recomputed.plan.diagnostics
    },
    changes: recomputed.plan.changes,
    warnings: [
      ...recomputed.warnings,
      ...recomputed.plan.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
    ],
    audit: createAuditEvent({
      command: 'changeset apply',
      document,
      targetDocument: recomputed.document,
      plan: recomputed.plan,
      startedAt
    })
  };
};

/** changeSet 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const changeSetCommands: CliCommandDefinition[] = [
  {
    path: ['changeset', 'plan'],
    introducedIn: 'PR4',
    kind: 'artifact',
    inputSchema: z
      .object({ input: z.string().min(1), output: z.string().min(1).optional() })
      .strict(),
    options: [
      option('--input', 'ChangeSet JSON path or - for stdin', { required: true }),
      option('--output', 'Optional plan output path')
    ],
    supportsDryRun: false,
    confirm: 'none',
    handler: planChangeSet
  },
  {
    path: ['changeset', 'apply'],
    introducedIn: 'PR4',
    kind: 'localMutation',
    inputSchema: z
      .object({
        plan: z.string().min(1),
        dryRun: z.literal(true).optional(),
        confirm: z.string().min(1).optional()
      })
      .strict(),
    options: [
      option('--plan', 'Workflow plan JSON path or - for stdin', { required: true }),
      option('--dry-run', 'Recompute and validate without writing', { value: false }),
      option('--confirm', 'Recomputed target checksum')
    ],
    supportsDryRun: true,
    confirm: 'checksum',
    handler: applyChangeSetPlan
  }
];

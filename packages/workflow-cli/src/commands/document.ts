import {
  builtinTemplateProvider,
  collectWorkflowBindings,
  compileStoreWorkflow,
  createDefaultWorkflowDocument,
  decompileStoreWorkflow,
  ensureSystemConfigNode,
  getWorkflowBindingDiagnostics,
  getWorkflowChecksum,
  validateWorkflow
} from '@fastgpt/workflow-core';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CliArgumentError } from '../error';
import { createTranslator } from '../i18n';
import {
  getWorkflowFilePath,
  readWorkflowFile,
  writeJsonFileAtomic,
  writeWorkflowFileAtomic
} from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
import { assertNoValidationErrors, requireString } from './helpers';

export const initDocument = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const filePath = getWorkflowFilePath(context.dir);
  const exists = await access(filePath).then(
    () => true,
    () => false
  );
  if (exists) throw new CliArgumentError('workflow.json already exists', { filePath });

  const result = await createDefaultWorkflowDocument({
    app: typeof input.name === 'string' ? { name: input.name } : {},
    dependencies: {
      templateProvider: builtinTemplateProvider,
      locale: context.locale,
      translate: createTranslator(context.locale)
    }
  });
  if (input.dryRun !== true) await writeWorkflowFileAtomic(context.dir, result.document);
  return {
    changed: true,
    checksum: await getWorkflowChecksum(result.document),
    changes: result.nodeIds.map((nodeId) => ({ type: 'node.add', nodeId })),
    result: { dryRun: input.dryRun === true },
    warnings: result.warnings
  };
};

export const buildDocument = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const output = requireString(input, 'output');
  const document = await readWorkflowFile(context.dir);
  const diagnostics = validateWorkflow(document);
  assertNoValidationErrors(diagnostics);
  const bindings = collectWorkflowBindings(document);
  const bindingDiagnostics = getWorkflowBindingDiagnostics(bindings);
  const workflow = compileStoreWorkflow(document);
  const outputPath = resolve(context.cwd, output);
  await writeJsonFileAtomic(outputPath, workflow);
  return {
    changed: false,
    result: { output: outputPath, workflow, diagnostics, bindings },
    warnings: bindingDiagnostics
  };
};

export const importDocument = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const inputPath = resolve(context.cwd, requireString(input, 'input'));
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliArgumentError('Import file must contain valid JSON', { inputPath });
    }
    throw error;
  }

  const currentApp = await readWorkflowFile(context.dir).then(
    (document) => document.app,
    () => ({})
  );
  const document = decompileStoreWorkflow({ workflow: raw as never, app: currentApp });
  const systemConfigResult = await ensureSystemConfigNode({
    document,
    dependencies: {
      templateProvider: builtinTemplateProvider,
      locale: context.locale,
      translate: createTranslator(context.locale)
    }
  });
  if (input.dryRun !== true) await writeWorkflowFileAtomic(context.dir, document);
  return {
    changed: true,
    checksum: await getWorkflowChecksum(document),
    changes: systemConfigResult.nodeIds.map((nodeId) => ({ type: 'node.add', nodeId })),
    result: { input: inputPath, dryRun: input.dryRun === true, document },
    warnings: systemConfigResult.warnings
  };
};

export const inspectDocument = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  const diagnostics = validateWorkflow(document);
  const bindings = collectWorkflowBindings(document);
  const bindingDiagnostics = getWorkflowBindingDiagnostics(bindings);
  const allDiagnostics = [...diagnostics, ...bindingDiagnostics];
  const references = document.nodes.flatMap((node) =>
    node.inputs.flatMap((input) =>
      Array.isArray(input.value) &&
      input.value.length === 2 &&
      typeof input.value[0] === 'string' &&
      typeof input.value[1] === 'string'
        ? [{ nodeId: node.nodeId, inputKey: input.key, from: input.value }]
        : []
    )
  );
  return {
    changed: false,
    checksum: await getWorkflowChecksum(document),
    result: {
      app: document.app,
      nodes: document.nodes.map((node) => ({
        nodeId: node.nodeId,
        name: node.name,
        flowNodeType: node.flowNodeType
      })),
      edges: document.executionEdges,
      references,
      bindings,
      chatConfig: document.chatConfig,
      diagnostics: {
        errorCount: allDiagnostics.filter((item) => item.severity === 'error').length,
        warningCount: allDiagnostics.filter((item) => item.severity === 'warning').length,
        items: allDiagnostics
      }
    },
    warnings: bindingDiagnostics
  };
};

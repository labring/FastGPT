import {
  VariableItemTypeSchema,
  type VariableItemType
} from '@fastgpt/global/core/app/variable/type';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum,
  textInputVariableValueTypes,
  variableMap
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { WorkflowExecutionEdge } from '@fastgpt/global/core/workflow/type/edge';
import type { NodeTemplateRef } from '@fastgpt/global/core/workflow/template/type';
import {
  collectWorkflowBindings,
  getWorkflowBindingDiagnostics
} from '@fastgpt/workflow-core/binding/service';
import { applyWorkflowCommand } from '@fastgpt/workflow-core/command/apply';
import { planWorkflowChangeSet } from '@fastgpt/workflow-core/command/applyChangeSet';
import {
  WorkflowChangeSetSchema,
  WorkflowPlanSchema,
  type WorkflowCommand,
  type WorkflowPlan
} from '@fastgpt/workflow-core/command/type';
import {
  getChatConfigDescriptor,
  listChatConfigDescriptors
} from '@fastgpt/workflow-core/config/descriptor';
import { getWorkflowChecksum } from '@fastgpt/workflow-core/domain/checksum';
import {
  createDefaultWorkflowDocument,
  ensureSystemConfigNode
} from '@fastgpt/workflow-core/domain/defaults';
import {
  WorkflowCommandError,
  WorkflowValidationError
} from '@fastgpt/workflow-core/domain/diagnostic';
import {
  parseExecutionSourcePortRef,
  parseExecutionTargetPortRef
} from '@fastgpt/workflow-core/edge/parser';
import { listContainerChildren } from '@fastgpt/workflow-core/nesting/query';
import { getAvailableInputReferences } from '@fastgpt/workflow-core/reference/query';
import { parseVariableRef } from '@fastgpt/workflow-core/reference/type';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import { decompileStoreWorkflow } from '@fastgpt/workflow-core/store/decompile';
import { normalizeNodeTemplateDescriptor } from '@fastgpt/workflow-core/template/descriptor';
import { createTranslator } from '@fastgpt/workflow-core/template/i18n';
import { formatNodeTemplateRef, parseNodeTemplateRef } from '@fastgpt/workflow-core/template/type';
import { validateWorkflow } from '@fastgpt/workflow-core/validation';
import type { FileIoAdapter } from '../../infra/fs/file-io';
import type { Prompter } from '../../infra/ui/prompter';
import type { WorkflowTemplateLoader } from '../../infra/workflow/template-loader';
import { CliArgumentError } from '../../shared/errors';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import { formatWorkflowWarnings, withWorkflowErrorMapping } from './workflow-error';
import {
  WORKFLOW_FILE_NAME,
  readWorkflowDocument,
  writeJsonArtifact,
  writeWorkflowDocument
} from './workflow-workspace';

export type WorkflowValueInput = {
  value?: string;
  valueJson?: string;
  valueFile?: string;
  valueEnv?: string;
};

export type WorkflowLocalServiceDeps = {
  fileIo: FileIoAdapter;
  templateLoader: WorkflowTemplateLoader;
  env: NodeJS.ProcessEnv;
  prompter: Prompter;
  readStdin: () => Promise<string>;
};

export type WorkflowLocalService = {
  init: (params: {
    dir: string;
    locale: string;
    name?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  build: (params: { dir: string; output: string; dryRun?: boolean }) => Promise<CliResult>;
  importWorkflow: (params: {
    dir: string;
    locale: string;
    inputPath: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  inspect: (params: { dir: string }) => Promise<CliResult>;
  validate: (params: { dir: string }) => Promise<CliResult>;
  metaShow: (params: { dir: string }) => Promise<CliResult>;
  metaSet: (params: {
    dir: string;
    locale: string;
    name?: string;
    intro?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  configList: (params: { dir: string; locale: string }) => Promise<CliResult>;
  configGet: (params: { dir: string; locale: string; path: string }) => Promise<CliResult>;
  configSet: (params: {
    dir: string;
    locale: string;
    path: string;
    valueInput: WorkflowValueInput;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  configUnset: (params: {
    dir: string;
    locale: string;
    path: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  variableList: (params: { dir: string }) => Promise<CliResult>;
  variableAdd: (params: {
    dir: string;
    locale: string;
    key: string;
    valueType: WorkflowIOValueTypeEnum;
    type?: string;
    label?: string;
    description?: string;
    required?: boolean;
    valueInput?: WorkflowValueInput;
    configInput?: {
      configJson?: string;
      configFile?: string;
      optionsJson?: string;
      min?: string;
      max?: string;
      maxLength?: string;
      timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  variableUpdate: (params: {
    dir: string;
    locale: string;
    key: string;
    newKey?: string;
    valueType?: WorkflowIOValueTypeEnum;
    type?: string;
    label?: string;
    description?: string;
    required?: boolean;
    optional?: boolean;
    valueInput?: WorkflowValueInput;
    configInput?: {
      configJson?: string;
      configFile?: string;
      optionsJson?: string;
      min?: string;
      max?: string;
      maxLength?: string;
      timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  variableRemove: (params: {
    dir: string;
    locale: string;
    key: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  templateList: (params: {
    locale: string;
    kind?: 'builtin' | 'teamApp' | 'systemTool' | 'tool';
  }) => Promise<CliResult>;
  templateShow: (params: { locale: string; template: string }) => Promise<CliResult>;
  nodeList: (params: { dir: string; type?: string; parent?: string }) => Promise<CliResult>;
  nodeShow: (params: { dir: string; locale: string; nodeId: string }) => Promise<CliResult>;
  nodeAdd: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    template: string;
    name?: string;
    after?: string;
    parent?: string;
    position?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  nodeUpdate: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    name?: string;
    position?: string;
    catchError?: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  nodeMove: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    position?: string;
    parent?: string;
    root?: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  nodeInsert: (params: {
    dir: string;
    locale: string;
    from: string;
    to: string;
    template: string;
    id: string;
    position?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  nodeClone: (params: {
    dir: string;
    locale: string;
    sourceNodeId: string;
    id: string;
    position?: string;
    offset?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  nodeRemove: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  edgeList: (params: { dir: string; nodeId?: string; kind?: string }) => Promise<CliResult>;
  edgeConnect: (params: {
    dir: string;
    locale: string;
    from: string;
    to: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  edgeDisconnect: (params: {
    dir: string;
    locale: string;
    from: string;
    to: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  edgeReconnect: (params: {
    dir: string;
    locale: string;
    from: string;
    oldTo: string;
    to: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  inputList: (params: { dir: string; nodeId: string }) => Promise<CliResult>;
  inputShow: (params: { dir: string; nodeId: string; key: string }) => Promise<CliResult>;
  inputAdd: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    key: string;
    valueType: WorkflowIOValueTypeEnum;
    mode: 'literal' | 'reference' | 'both';
    label?: string;
    description?: string;
    required?: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  inputRemove: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    key: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  inputSet: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    key: string;
    valueInput: WorkflowValueInput;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  inputRef: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    key: string;
    from: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  inputUnset: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    key: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  inputAvailable: (params: { dir: string; nodeId: string; key: string }) => Promise<CliResult>;
  outputList: (params: { dir: string; nodeId: string }) => Promise<CliResult>;
  outputAdd: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    key: string;
    valueType: WorkflowIOValueTypeEnum;
    label?: string;
    description?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  outputRemove: (params: {
    dir: string;
    locale: string;
    nodeId: string;
    key: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  toolList: (params: { dir: string; toolCallNodeId: string }) => Promise<CliResult>;
  toolAttach: (params: {
    dir: string;
    locale: string;
    toolCallNodeId: string;
    template?: string;
    toolNodeId?: string;
    id?: string;
    position?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  toolDetach: (params: {
    dir: string;
    locale: string;
    toolCallNodeId: string;
    toolNodeId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  containerChildren: (params: { dir: string; nodeId: string }) => Promise<CliResult>;
  changesetPlan: (params: {
    dir: string;
    locale: string;
    inputSource: string;
    output?: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  changesetApply: (params: {
    dir: string;
    locale: string;
    planSource: string;
    confirm?: string;
    dryRun?: boolean;
    yes?: boolean;
  }) => Promise<CliResult>;
};

const VariableConfigSchema = VariableItemTypeSchema.partial()
  .omit({
    key: true,
    label: true,
    description: true,
    type: true,
    valueType: true,
    required: true,
    defaultValue: true
  })
  .strict();

const SPECIAL_OPTIONAL_VARIABLE_TYPES = new Set<VariableInputEnum>([
  VariableInputEnum.custom,
  VariableInputEnum.internal,
  VariableInputEnum.switch
]);

function parsePosition(value: string | undefined): { x: number; y: number } | undefined {
  if (value === undefined) {
    return undefined;
  }
  const [xVal, yVal, extra] = value.split(',').map(Number);
  if (extra !== undefined || !Number.isFinite(xVal) || !Number.isFinite(yVal)) {
    throw new CliArgumentError('Position must be formatted as "x,y" (e.g. "200,120").');
  }
  return { x: xVal, y: yVal };
}

function parseJsonText(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CliArgumentError(`${label} must contain valid JSON.`);
  }
}

function parseNumericOption(raw: string | undefined, flagName: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new CliArgumentError(`${flagName} must be a valid number.`);
  }
  return parsed;
}

function normalizeVariableInputType(type: string | undefined): VariableInputEnum | undefined {
  if (type === undefined) {
    return undefined;
  }
  if (type === 'external') {
    return VariableInputEnum.custom;
  }
  return type as VariableInputEnum;
}

function inferVariableInputType(valueType: WorkflowIOValueTypeEnum): VariableInputEnum {
  if (valueType === WorkflowIOValueTypeEnum.number) return VariableInputEnum.numberInput;
  if (valueType === WorkflowIOValueTypeEnum.boolean) return VariableInputEnum.switch;
  if (valueType === WorkflowIOValueTypeEnum.arrayString) return VariableInputEnum.multipleSelect;
  return VariableInputEnum.input;
}

function assertVariableTypeCompatibility({
  type,
  valueType
}: {
  type: VariableInputEnum;
  valueType: WorkflowIOValueTypeEnum;
}): void {
  if (type === VariableInputEnum.custom || type === VariableInputEnum.internal) {
    return;
  }
  if (type === VariableInputEnum.input) {
    if (!textInputVariableValueTypes.includes(valueType)) {
      throw new CliArgumentError('--type input does not support this --value-type', {
        type,
        valueType
      });
    }
    return;
  }
  const config = (variableMap as Partial<typeof variableMap>)[type];
  if (config && config.defaultValueType !== valueType) {
    throw new CliArgumentError('--type and --value-type are incompatible', {
      type,
      valueType,
      expectedValueType: config.defaultValueType
    });
  }
}

function assertNoValidationErrors(diagnostics: ReturnType<typeof validateWorkflow>): void {
  if (diagnostics.some((item) => item.severity === 'error')) {
    throw new WorkflowValidationError(diagnostics);
  }
}

function parseExecutionEdge(from: string, to: string): WorkflowExecutionEdge {
  return {
    source: parseExecutionSourcePortRef(from),
    target: parseExecutionTargetPortRef(to)
  };
}

function getChangedNodeIds(plan: WorkflowPlan): string[] {
  return [...new Set(plan.changes.flatMap((change) => (change.nodeId ? [change.nodeId] : [])))];
}

function getChangedEdgeCount(base: WorkflowDocument, target: WorkflowDocument): number {
  const baseEdges = new Set(base.executionEdges.map((edge) => JSON.stringify(edge)));
  const targetEdges = new Set(target.executionEdges.map((edge) => JSON.stringify(edge)));
  return (
    [...baseEdges].filter((edge) => !targetEdges.has(edge)).length +
    [...targetEdges].filter((edge) => !baseEdges.has(edge)).length
  );
}

/**
 * 本地工作流领域服务：封装全部基于 workflow.json 与 @fastgpt/workflow-core 的离线编排能力。
 */
export function createWorkflowLocalService(deps: WorkflowLocalServiceDeps): WorkflowLocalService {
  const { fileIo, templateLoader, env, prompter, readStdin } = deps;

  async function buildDependencies(locale: string) {
    return {
      templateProvider: await templateLoader.loadProvider({ locale, env }),
      locale,
      translate: createTranslator(locale)
    };
  }

  async function readJsonFromSource({
    source,
    label
  }: {
    source: string;
    label: string;
  }): Promise<unknown> {
    const content = source === '-' ? await readStdin() : await fileIo.readTextFile(source);
    return parseJsonText(content, label);
  }

  async function readValueFromInput({
    valueInput,
    valueType
  }: {
    valueInput: WorkflowValueInput;
    valueType?: string;
  }): Promise<unknown> {
    const activeKeys = (['value', 'valueJson', 'valueFile', 'valueEnv'] as const).filter(
      (key) => valueInput[key] !== undefined
    );
    if (activeKeys.length !== 1) {
      throw new CliArgumentError(
        'Exactly one of --value, --value-json, --value-file, or --value-env is required.',
        { activeKeys }
      );
    }

    if (valueInput.valueJson !== undefined) {
      return parseJsonText(valueInput.valueJson, '--value-json');
    }

    const resolvedRaw = await (async () => {
      if (valueInput.value !== undefined) {
        return valueInput.value;
      }
      if (valueInput.valueEnv !== undefined) {
        const envVal = env[valueInput.valueEnv];
        if (envVal === undefined) {
          throw new CliArgumentError(
            `Environment variable "${valueInput.valueEnv}" is not defined.`,
            { name: valueInput.valueEnv }
          );
        }
        return envVal;
      }
      if (valueInput.valueFile !== undefined) {
        return valueInput.valueFile === '-'
          ? readStdin()
          : fileIo.readTextFile(valueInput.valueFile);
      }
      return undefined;
    })();

    if (valueType === 'number') {
      const num = Number(resolvedRaw);
      if (!Number.isFinite(num)) {
        throw new CliArgumentError('Value must be a finite number.');
      }
      return num;
    }
    if (valueType === 'boolean') {
      if (resolvedRaw === 'true') return true;
      if (resolvedRaw === 'false') return false;
      throw new CliArgumentError('Value must be "true" or "false".');
    }
    if (valueType?.startsWith('array') || valueType === 'object') {
      return parseJsonText(resolvedRaw ?? '', 'Structured input');
    }
    return resolvedRaw;
  }

  async function readVariableConfig(configInput?: {
    configJson?: string;
    configFile?: string;
    optionsJson?: string;
    min?: string;
    max?: string;
    maxLength?: string;
    timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
  }): Promise<Partial<VariableItemType>> {
    if (!configInput) {
      return {};
    }
    const rawConfig = await (async () => {
      if (configInput.configJson !== undefined) {
        return parseJsonText(configInput.configJson, '--config-json');
      }
      if (configInput.configFile !== undefined) {
        const content = await fileIo.readTextFile(configInput.configFile);
        return parseJsonText(content, '--config-file');
      }
      return {};
    })();
    if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      throw new CliArgumentError('Variable config must be a JSON object.');
    }

    const maxLength = parseNumericOption(configInput.maxLength, '--max-length');
    if (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 0)) {
      throw new CliArgumentError('--max-length must be a non-negative integer.');
    }

    const shortcuts = {
      list:
        configInput.optionsJson !== undefined
          ? parseJsonText(configInput.optionsJson, '--options-json')
          : undefined,
      min: parseNumericOption(configInput.min, '--min'),
      max: parseNumericOption(configInput.max, '--max'),
      maxLength,
      timeGranularity: configInput.timeGranularity
    };

    return VariableConfigSchema.parse({
      ...(rawConfig as Record<string, unknown>),
      ...Object.fromEntries(Object.entries(shortcuts).filter(([, val]) => val !== undefined))
    });
  }

  async function runMutation({
    operation,
    dir,
    locale,
    command,
    dryRun
  }: {
    operation: string;
    dir: string;
    locale: string;
    command: WorkflowCommand;
    dryRun?: boolean;
  }): Promise<CliResult> {
    return withWorkflowErrorMapping(async () => {
      const document = await readWorkflowDocument({ fileIo, dir });
      const dependencies = await buildDependencies(locale);
      const result = await applyWorkflowCommand({
        document,
        command,
        dependencies
      });
      const warnings = formatWorkflowWarnings(result.warnings);
      if (dryRun) {
        return createDryRunResult({
          operation,
          risk: 'write',
          preview: {
            checksum: result.checksum,
            changes: result.changes
          },
          warnings
        });
      }
      await writeWorkflowDocument({ fileIo, dir, document: result.document });
      return createChangedResult({
        data: {
          checksum: result.checksum,
          changes: result.changes
        },
        warnings
      });
    });
  }

  async function resolveDescriptor({
    ref,
    locale,
    dependencies
  }: {
    ref: NodeTemplateRef;
    locale: string;
    dependencies?: Awaited<ReturnType<typeof buildDependencies>>;
  }) {
    const resolvedDeps = dependencies ?? (await buildDependencies(locale));
    const resolved = await resolvedDeps.templateProvider.resolve(ref, { locale });
    return normalizeNodeTemplateDescriptor({
      template: resolved.template,
      templateRef: ref,
      automationMeta: resolved.automationMeta,
      validatedInputDefaults: resolved.validatedInputDefaults,
      translate: resolvedDeps.translate
    });
  }

  async function findDescriptorForNode(flowNodeType: string, locale: string) {
    const dependencies = await buildDependencies(locale);
    const refs = await dependencies.templateProvider.list({ locale });
    for (const ref of refs) {
      const descriptor = await resolveDescriptor({ ref, locale, dependencies });
      if (descriptor.flowNodeType === flowNodeType) {
        return descriptor;
      }
    }
    return undefined;
  }

  return {
    init: ({ dir, locale, name, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const exists = await fileIo.exists(WORKFLOW_FILE_NAME, dir);
        if (exists) {
          const filePath = fileIo.resolvePath(WORKFLOW_FILE_NAME, dir);
          throw new CliArgumentError('workflow.json already exists.', { filePath });
        }
        const dependencies = await buildDependencies(locale);
        const result = await createDefaultWorkflowDocument({
          app: name ? { name } : {},
          dependencies
        });
        const checksum = await getWorkflowChecksum(result.document);
        const changes = result.nodeIds.map((nodeId) => ({ type: 'node.add', nodeId }));
        const warnings = formatWorkflowWarnings(result.warnings);
        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow init',
            risk: 'write',
            preview: { checksum, changes },
            warnings
          });
        }
        const filePath = await writeWorkflowDocument({
          fileIo,
          dir,
          document: result.document
        });
        return createChangedResult({
          message: `Initialized ${WORKFLOW_FILE_NAME}`,
          data: { filePath, checksum, changes },
          warnings
        });
      }),

    build: ({ dir, output, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const diagnostics = validateWorkflow(document, { invalidReferencePolicy: 'error' });
        assertNoValidationErrors(diagnostics);
        const bindings = collectWorkflowBindings(document);
        const bindingDiagnostics = getWorkflowBindingDiagnostics(bindings);
        const workflow = compileStoreWorkflow(document);
        const warnings = formatWorkflowWarnings(bindingDiagnostics);
        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow build',
            risk: 'write',
            preview: {
              output: fileIo.resolvePath(output),
              workflow,
              diagnostics,
              bindings
            },
            warnings
          });
        }
        const outputPath = await writeJsonArtifact({ fileIo, filePath: output, value: workflow });
        return createSuccessResult({
          message: `Built StoreWorkflow to ${outputPath}`,
          data: { output: outputPath, workflow, diagnostics, bindings },
          warnings
        });
      }),

    importWorkflow: ({ dir, locale, inputPath, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const raw = await readJsonFromSource({ source: inputPath, label: 'Import file' });
        const resolvedInput = inputPath === '-' ? 'stdin' : fileIo.resolvePath(inputPath);
        const currentApp = await readWorkflowDocument({ fileIo, dir }).then(
          (doc) => doc.app,
          () => ({})
        );
        const document = decompileStoreWorkflow({ workflow: raw as never, app: currentApp });
        const dependencies = await buildDependencies(locale);
        const systemConfigResult = await ensureSystemConfigNode({
          document,
          dependencies
        });
        const checksum = await getWorkflowChecksum(document);
        const changes = systemConfigResult.nodeIds.map((nodeId) => ({
          type: 'node.add',
          nodeId
        }));
        const warnings = formatWorkflowWarnings(systemConfigResult.warnings);
        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow import',
            risk: 'write',
            preview: { input: resolvedInput, checksum, changes, document },
            warnings
          });
        }
        await writeWorkflowDocument({ fileIo, dir, document });
        return createChangedResult({
          message: `Imported workflow into ${WORKFLOW_FILE_NAME}`,
          data: { input: resolvedInput, checksum, changes, document },
          warnings
        });
      }),

    inspect: ({ dir }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const diagnostics = validateWorkflow(document, { invalidReferencePolicy: 'error' });
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
        const checksum = await getWorkflowChecksum(document);
        return createSuccessResult({
          data: {
            checksum,
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
          warnings: formatWorkflowWarnings(bindingDiagnostics)
        });
      }),

    validate: ({ dir }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const diagnostics = validateWorkflow(document, { invalidReferencePolicy: 'error' });
        assertNoValidationErrors(diagnostics);
        const bindings = collectWorkflowBindings(document);
        const bindingDiagnostics = getWorkflowBindingDiagnostics(bindings);
        return createSuccessResult({
          data: {
            valid: true,
            executable: bindings.length === 0,
            diagnostics,
            bindings
          },
          warnings: formatWorkflowWarnings(bindingDiagnostics)
        });
      }),

    metaShow: ({ dir }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        return createSuccessResult({ data: document.app });
      }),

    metaSet: ({ dir, locale, name, intro, dryRun }) =>
      runMutation({
        operation: 'workflow meta set',
        dir,
        locale,
        dryRun,
        command: { type: 'meta.update', name, intro }
      }),

    configList: ({ dir, locale }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        return createSuccessResult({
          data: listChatConfigDescriptors({
            document,
            translate: createTranslator(locale)
          })
        });
      }),

    configGet: ({ dir, locale, path }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        return createSuccessResult({
          data: getChatConfigDescriptor({
            document,
            path,
            translate: createTranslator(locale)
          })
        });
      }),

    configSet: async ({ dir, locale, path, valueInput, dryRun }) => {
      const value = await readValueFromInput({ valueInput });
      return runMutation({
        operation: 'workflow config set',
        dir,
        locale,
        dryRun,
        command: { type: 'config.set', path, value }
      });
    },

    configUnset: ({ dir, locale, path, dryRun }) =>
      runMutation({
        operation: 'workflow config unset',
        dir,
        locale,
        dryRun,
        command: { type: 'config.unset', path }
      }),

    variableList: ({ dir }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        return createSuccessResult({ data: document.chatConfig.variables ?? [] });
      }),

    variableAdd: async ({
      dir,
      locale,
      key,
      valueType,
      type: rawType,
      label,
      description,
      required,
      valueInput,
      configInput,
      dryRun
    }) => {
      const type = normalizeVariableInputType(rawType) ?? inferVariableInputType(valueType);
      assertVariableTypeCompatibility({ type, valueType });
      if (required === true && SPECIAL_OPTIONAL_VARIABLE_TYPES.has(type)) {
        throw new CliArgumentError('--required is not supported for this variable type', { type });
      }
      const hasValue =
        valueInput !== undefined && Object.values(valueInput).some((item) => item !== undefined);
      const defaultValue = hasValue
        ? await readValueFromInput({ valueInput: valueInput!, valueType })
        : undefined;
      const config = await readVariableConfig(configInput);
      const variable: VariableItemType = {
        ...config,
        key,
        label: label ?? key,
        description: description ?? '',
        valueType,
        type,
        required: SPECIAL_OPTIONAL_VARIABLE_TYPES.has(type) ? false : required === true,
        defaultValue
      };
      return runMutation({
        operation: 'workflow variable add',
        dir,
        locale,
        dryRun,
        command: { type: 'variable.add', variable }
      });
    },

    variableUpdate: async ({
      dir,
      locale,
      key,
      newKey,
      valueType,
      type: rawType,
      label,
      description,
      required,
      optional,
      valueInput,
      configInput,
      dryRun
    }) => {
      const document = await readWorkflowDocument({ fileIo, dir });
      const currentVariable = document.chatConfig.variables?.find((item) => item.key === key);
      const explicitType = normalizeVariableInputType(rawType);
      const inferredType = (() => {
        if (!valueType || !currentVariable?.valueType) return undefined;
        if (currentVariable.type !== inferVariableInputType(currentVariable.valueType)) {
          return undefined;
        }
        return inferVariableInputType(valueType);
      })();
      const resolvedType = explicitType ?? inferredType;
      const nextType = resolvedType ?? currentVariable?.type;
      const nextValueType = valueType ?? currentVariable?.valueType;
      if ((explicitType || valueType) && nextType && nextValueType) {
        assertVariableTypeCompatibility({ type: nextType, valueType: nextValueType });
      }
      if (required === true && nextType && SPECIAL_OPTIONAL_VARIABLE_TYPES.has(nextType)) {
        throw new CliArgumentError('--required is not supported for this variable type', {
          type: nextType
        });
      }
      const resolvedRequired = (() => {
        if (resolvedType && nextType && SPECIAL_OPTIONAL_VARIABLE_TYPES.has(nextType)) {
          return false;
        }
        if (required === true) return true;
        if (optional === true) return false;
        return undefined;
      })();
      const config = await readVariableConfig(configInput);
      const hasValue =
        valueInput !== undefined && Object.values(valueInput).some((item) => item !== undefined);
      const defaultValue = hasValue
        ? await readValueFromInput({ valueInput: valueInput!, valueType: nextValueType })
        : undefined;
      const patch: Partial<VariableItemType> = {
        ...config,
        key: newKey,
        label,
        description,
        valueType,
        type: resolvedType,
        required: resolvedRequired,
        defaultValue
      };
      const cleanPatch = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      ) as Partial<VariableItemType>;
      return runMutation({
        operation: 'workflow variable update',
        dir,
        locale,
        dryRun,
        command: { type: 'variable.update', key, patch: cleanPatch }
      });
    },

    variableRemove: ({ dir, locale, key, dryRun }) =>
      runMutation({
        operation: 'workflow variable remove',
        dir,
        locale,
        dryRun,
        command: { type: 'variable.remove', key }
      }),

    templateList: ({ locale, kind }) =>
      withWorkflowErrorMapping(async () => {
        const dependencies = await buildDependencies(locale);
        const refs = (await dependencies.templateProvider.list({ locale })).filter(
          (ref) => kind === undefined || ref.kind === kind
        );
        const counts = { builtin: 0, teamApp: 0, systemTool: 0, tool: 0 };
        refs.forEach((ref) => {
          counts[ref.kind] += 1;
        });
        const items = await Promise.all(
          refs.map(async (ref) => {
            const descriptor = await resolveDescriptor({ ref, locale, dependencies });
            return {
              kind: ref.kind,
              ref: formatNodeTemplateRef(ref),
              template: descriptor.template,
              name: descriptor.name,
              intro: descriptor.intro,
              flowNodeType: descriptor.flowNodeType
            };
          })
        );
        return createSuccessResult({
          data: { total: items.length, counts, items }
        });
      }),

    templateShow: ({ locale, template }) =>
      withWorkflowErrorMapping(async () =>
        createSuccessResult({
          data: await resolveDescriptor({ ref: parseNodeTemplateRef(template), locale })
        })
      ),

    nodeList: ({ dir, type, parent }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        return createSuccessResult({
          data: document.nodes.filter(
            (node) =>
              (type === undefined || node.flowNodeType === type) &&
              (parent === undefined || node.parentNodeId === parent)
          )
        });
      }),

    nodeShow: ({ dir, locale, nodeId }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const node = document.nodes.find((item) => item.nodeId === nodeId);
        if (!node) {
          throw new CliArgumentError(`Node "${nodeId}" not found.`, { nodeId });
        }
        return createSuccessResult({
          data: {
            node,
            descriptor: await findDescriptorForNode(node.flowNodeType, locale),
            executionEdges: document.executionEdges.filter(
              (edge) => edge.source.nodeId === nodeId || edge.target.nodeId === nodeId
            )
          }
        });
      }),

    nodeAdd: async ({ dir, locale, nodeId, template, name, after, parent, position, dryRun }) =>
      withWorkflowErrorMapping(async () =>
        runMutation({
          operation: 'workflow node add',
          dir,
          locale,
          dryRun,
          command: {
            type: 'node.add',
            nodeId,
            template: parseNodeTemplateRef(template),
            name,
            position: parsePosition(position),
            parentNodeId: parent,
            connectFrom: after ? parseExecutionSourcePortRef(after) : undefined
          }
        })
      ),

    nodeUpdate: ({ dir, locale, nodeId, name, position, catchError, dryRun }) =>
      runMutation({
        operation: 'workflow node update',
        dir,
        locale,
        dryRun,
        command: {
          type: 'node.update',
          nodeId,
          name,
          position: parsePosition(position),
          catchError
        }
      }),

    nodeMove: ({ dir, locale, nodeId, position, parent, root, dryRun }) =>
      runMutation({
        operation: 'workflow node move',
        dir,
        locale,
        dryRun,
        command: {
          type: 'node.move',
          nodeId,
          position: parsePosition(position),
          parentNodeId: parent ?? (root === true ? null : undefined)
        }
      }),

    nodeInsert: ({ dir, locale, from, to, template, id, position, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const target = parseExecutionTargetPortRef(to);
        if (target.kind !== 'target') {
          throw new CliArgumentError('node insert only supports a normal target port.');
        }
        return runMutation({
          operation: 'workflow node insert',
          dir,
          locale,
          dryRun,
          command: {
            type: 'node.insert',
            nodeId: id,
            template: parseNodeTemplateRef(template),
            from: parseExecutionSourcePortRef(from),
            to: target,
            position: parsePosition(position)
          }
        });
      }),

    nodeClone: ({ dir, locale, sourceNodeId, id, position, offset, dryRun }) =>
      runMutation({
        operation: 'workflow node clone',
        dir,
        locale,
        dryRun,
        command: {
          type: 'node.clone',
          sourceNodeId,
          nodeId: id,
          position: parsePosition(position),
          offset: parsePosition(offset)
        }
      }),

    nodeRemove: ({ dir, locale, nodeId, dryRun }) =>
      runMutation({
        operation: 'workflow node remove',
        dir,
        locale,
        dryRun,
        command: { type: 'node.remove', nodeId }
      }),

    edgeList: ({ dir, nodeId, kind }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        return createSuccessResult({
          data: document.executionEdges.filter(
            (edge) =>
              (nodeId === undefined ||
                edge.source.nodeId === nodeId ||
                edge.target.nodeId === nodeId) &&
              (kind === undefined || edge.source.kind === kind)
          )
        });
      }),

    edgeConnect: ({ dir, locale, from, to, dryRun }) =>
      withWorkflowErrorMapping(async () =>
        runMutation({
          operation: 'workflow edge connect',
          dir,
          locale,
          dryRun,
          command: {
            type: 'edge.connect',
            edge: parseExecutionEdge(from, to)
          }
        })
      ),

    edgeDisconnect: ({ dir, locale, from, to, dryRun }) =>
      withWorkflowErrorMapping(async () =>
        runMutation({
          operation: 'workflow edge disconnect',
          dir,
          locale,
          dryRun,
          command: {
            type: 'edge.disconnect',
            edge: parseExecutionEdge(from, to)
          }
        })
      ),

    edgeReconnect: ({ dir, locale, from, oldTo, to, dryRun }) =>
      withWorkflowErrorMapping(async () =>
        runMutation({
          operation: 'workflow edge reconnect',
          dir,
          locale,
          dryRun,
          command: {
            type: 'edge.reconnect',
            oldEdge: parseExecutionEdge(from, oldTo),
            newEdge: parseExecutionEdge(from, to)
          }
        })
      ),

    inputList: ({ dir, nodeId }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const node = document.nodes.find((item) => item.nodeId === nodeId);
        if (!node) {
          throw new CliArgumentError(`Node "${nodeId}" not found.`, { nodeId });
        }
        return createSuccessResult({ data: node.inputs });
      }),

    inputShow: ({ dir, nodeId, key }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const nodeInput = document.nodes
          .find((item) => item.nodeId === nodeId)
          ?.inputs.find((item) => item.key === key);
        if (!nodeInput) {
          throw new CliArgumentError(`Input "${key}" not found on node "${nodeId}".`, {
            nodeId,
            inputKey: key
          });
        }
        const isSecret = nodeInput.renderTypeList.includes(FlowNodeInputTypeEnum.password);
        return createSuccessResult({
          data: isSecret
            ? { ...nodeInput, value: undefined, configured: nodeInput.value !== undefined }
            : nodeInput
        });
      }),

    inputAdd: ({
      dir,
      locale,
      nodeId,
      key,
      valueType,
      mode,
      label,
      description,
      required,
      dryRun
    }) => {
      const renderTypeList = (() => {
        if (mode === 'reference') return [FlowNodeInputTypeEnum.reference];
        if (mode === 'both') return [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference];
        return [FlowNodeInputTypeEnum.input];
      })();
      return runMutation({
        operation: 'workflow input add',
        dir,
        locale,
        dryRun,
        command: {
          type: 'input.add',
          nodeId,
          input: {
            key,
            label: label ?? key,
            description,
            valueType,
            renderTypeList,
            required: required === true,
            canEdit: true
          }
        }
      });
    },

    inputRemove: ({ dir, locale, nodeId, key, dryRun }) =>
      runMutation({
        operation: 'workflow input remove',
        dir,
        locale,
        dryRun,
        command: {
          type: 'input.remove',
          nodeId,
          inputKey: key
        }
      }),

    inputSet: async ({ dir, locale, nodeId, key, valueInput, dryRun }) => {
      const document = await readWorkflowDocument({ fileIo, dir });
      const nodeInput = document.nodes
        .find((node) => node.nodeId === nodeId)
        ?.inputs.find((item) => item.key === key);
      const value = await readValueFromInput({ valueInput, valueType: nodeInput?.valueType });
      return runMutation({
        operation: 'workflow input set',
        dir,
        locale,
        dryRun,
        command: { type: 'input.set', nodeId, inputKey: key, value }
      });
    },

    inputRef: ({ dir, locale, nodeId, key, from, dryRun }) =>
      withWorkflowErrorMapping(async () =>
        runMutation({
          operation: 'workflow input ref',
          dir,
          locale,
          dryRun,
          command: {
            type: 'input.ref',
            nodeId,
            inputKey: key,
            ref: parseVariableRef(from)
          }
        })
      ),

    inputUnset: ({ dir, locale, nodeId, key, dryRun }) =>
      runMutation({
        operation: 'workflow input unset',
        dir,
        locale,
        dryRun,
        command: { type: 'input.unset', nodeId, inputKey: key }
      }),

    inputAvailable: ({ dir, nodeId, key }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const nodeInput = document.nodes
          .find((item) => item.nodeId === nodeId)
          ?.inputs.find((item) => item.key === key);
        if (!nodeInput) {
          throw new CliArgumentError(`Input "${key}" not found on node "${nodeId}".`, {
            nodeId,
            inputKey: key
          });
        }
        return createSuccessResult({
          data: getAvailableInputReferences({ document, nodeId, inputKey: key })
        });
      }),

    outputList: ({ dir, nodeId }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const node = document.nodes.find((item) => item.nodeId === nodeId);
        return createSuccessResult({ data: node?.outputs ?? [] });
      }),

    outputAdd: ({ dir, locale, nodeId, key, valueType, label, description, dryRun }) =>
      runMutation({
        operation: 'workflow output add',
        dir,
        locale,
        dryRun,
        command: {
          type: 'output.add',
          nodeId,
          output: {
            id: key,
            key,
            type: FlowNodeOutputTypeEnum.dynamic,
            valueType,
            label: label ?? key,
            description
          }
        }
      }),

    outputRemove: ({ dir, locale, nodeId, key, dryRun }) =>
      runMutation({
        operation: 'workflow output remove',
        dir,
        locale,
        dryRun,
        command: { type: 'output.remove', nodeId, outputKey: key }
      }),

    toolList: ({ dir, toolCallNodeId }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        const tools = document.executionEdges
          .filter(
            (edge) => edge.source.kind === 'selectedTools' && edge.source.nodeId === toolCallNodeId
          )
          .map((edge) => document.nodes.find((node) => node.nodeId === edge.target.nodeId))
          .filter(Boolean);
        return createSuccessResult({ data: tools });
      }),

    toolAttach: ({ dir, locale, toolCallNodeId, template, toolNodeId, id, position, dryRun }) =>
      withWorkflowErrorMapping(async () =>
        runMutation({
          operation: 'workflow tool attach',
          dir,
          locale,
          dryRun,
          command: {
            type: 'tool.attach',
            toolCallNodeId,
            toolNodeId,
            template: template ? parseNodeTemplateRef(template) : undefined,
            newNodeId: id,
            position: parsePosition(position)
          }
        })
      ),

    toolDetach: ({ dir, locale, toolCallNodeId, toolNodeId, dryRun }) =>
      runMutation({
        operation: 'workflow tool detach',
        dir,
        locale,
        dryRun,
        command: {
          type: 'tool.detach',
          toolCallNodeId,
          toolNodeId
        }
      }),

    containerChildren: ({ dir, nodeId }) =>
      withWorkflowErrorMapping(async () => {
        const document = await readWorkflowDocument({ fileIo, dir });
        return createSuccessResult({
          data: listContainerChildren(document, nodeId)
        });
      }),

    changesetPlan: ({ dir, locale, inputSource, output, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const changeSet = WorkflowChangeSetSchema.parse(
          await readJsonFromSource({ source: inputSource, label: 'ChangeSet input' })
        );
        const document = await readWorkflowDocument({ fileIo, dir });
        const dependencies = await buildDependencies(locale);
        const result = await planWorkflowChangeSet({
          document,
          changeSet,
          dependencies
        });
        const warnings = formatWorkflowWarnings(result.warnings);
        const meta = {
          checksum: result.plan.targetChecksum,
          changedNodeIds: getChangedNodeIds(result.plan),
          changedEdgeCount: getChangedEdgeCount(document, result.document)
        };
        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow changeset plan',
            risk: 'write',
            preview: {
              ...(output !== undefined ? { output: fileIo.resolvePath(output) } : {}),
              plan: result.plan,
              ...meta
            },
            warnings
          });
        }
        if (output !== undefined) {
          await writeJsonArtifact({ fileIo, filePath: output, value: result.plan });
        }
        return createSuccessResult({
          data: result.plan,
          warnings,
          meta
        });
      }),

    changesetApply: ({ dir, locale, planSource, confirm, dryRun, yes }) =>
      withWorkflowErrorMapping(async () => {
        const suppliedPlan = WorkflowPlanSchema.parse(
          await readJsonFromSource({ source: planSource, label: 'Workflow plan' })
        );
        const document = await readWorkflowDocument({ fileIo, dir });
        const dependencies = await buildDependencies(locale);
        const recomputed = await planWorkflowChangeSet({
          document,
          changeSet: suppliedPlan.changeSet,
          dependencies
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

        const warnings = formatWorkflowWarnings([
          ...recomputed.warnings,
          ...recomputed.plan.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
        ]);
        const targetChecksum = recomputed.plan.targetChecksum;

        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow changeset apply',
            risk: 'write',
            preview: {
              baseChecksum: recomputed.plan.baseChecksum,
              targetChecksum,
              diagnostics: recomputed.plan.diagnostics,
              changes: recomputed.plan.changes
            },
            warnings
          });
        }

        if (confirm !== undefined && confirm !== targetChecksum) {
          throw new CliArgumentError(
            '--confirm must equal the recomputed target checksum.',
            {
              code: WorkflowDiagnosticCodeEnum.cliConfirmChecksumMismatch,
              expected: targetChecksum,
              actual: confirm
            },
            `Pass --confirm ${targetChecksum}`
          );
        }

        if (confirm === undefined) {
          if (!prompter.isInteractive) {
            throw new CliArgumentError(
              'Non-interactive apply requires --confirm with the target checksum.',
              {
                code: WorkflowDiagnosticCodeEnum.cliConfirmRequired,
                targetChecksum
              },
              `Pass --confirm ${targetChecksum}`
            );
          }
          if (!yes) {
            const confirmed = await prompter.confirm?.({
              message: `Apply workflow plan ${targetChecksum}?`
            });
            if (!confirmed) {
              throw new CliArgumentError('Workflow plan was not confirmed.', {
                code: WorkflowDiagnosticCodeEnum.cliConfirmRejected,
                targetChecksum
              });
            }
          }
        }

        // 写入前再次读取磁盘，防止计划生成后并发修改导致静默覆盖。
        const latestDocument = await readWorkflowDocument({ fileIo, dir });
        const actualChecksum = await getWorkflowChecksum(latestDocument);
        if (actualChecksum !== recomputed.plan.baseChecksum) {
          throw new WorkflowCommandError([
            {
              code: WorkflowDiagnosticCodeEnum.baseChecksumMismatch,
              severity: 'error',
              params: {
                expected: recomputed.plan.baseChecksum,
                actual: actualChecksum
              }
            }
          ]);
        }

        await writeWorkflowDocument({ fileIo, dir, document: recomputed.document });
        return createChangedResult({
          message: `Applied workflow changeset (${targetChecksum})`,
          data: {
            dryRun: false,
            baseChecksum: recomputed.plan.baseChecksum,
            targetChecksum,
            diagnostics: recomputed.plan.diagnostics,
            changes: recomputed.plan.changes
          },
          warnings,
          meta: {
            changedNodeIds: getChangedNodeIds(recomputed.plan),
            changedEdgeCount: getChangedEdgeCount(document, recomputed.document)
          }
        });
      })
  };
}

import z from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import type { ChatCompletionMessageParamSchema } from '@fastgpt/global/core/ai/llm/type';
import { ChatItemMiniSchema, UserChatItemValueItemSchema } from '@fastgpt/global/core/chat/type';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { GetAppDetailResponseType } from '@fastgpt/global/openapi/core/app/common/api';
import type { GetAppVersionDetailResponseType } from '@fastgpt/global/openapi/core/app/version/api';
import {
  OptimizeCodeBodySchema,
  type GetSandboxPackagesResponse,
  type WorkflowDebugResponse
} from '@fastgpt/global/openapi/core/workflow/api';
import { getWorkflowChecksum } from '@fastgpt/workflow-core/domain/checksum';
import { ensureSystemConfigNode } from '@fastgpt/workflow-core/domain/defaults';
import { WorkflowValidationError } from '@fastgpt/workflow-core/domain/diagnostic';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import { decompileStoreWorkflow } from '@fastgpt/workflow-core/store/decompile';
import { createTranslator } from '@fastgpt/workflow-core/template/i18n';
import { validateWorkflow } from '@fastgpt/workflow-core/validation';
import type { FileIoAdapter } from '../../infra/fs/file-io';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import type { WorkflowTemplateLoader } from '../../infra/workflow/template-loader';
import { CliApiError, CliArgumentError, CliAuthError } from '../../shared/errors';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import { formatWorkflowWarnings, withWorkflowErrorMapping } from './workflow-error';
import {
  WORKFLOW_FILE_NAME,
  readWorkflowDocument,
  readWorkflowSyncState,
  writeWorkflowDocument,
  writeWorkflowSyncState
} from './workflow-workspace';

export const WorkflowTestExpectSchema = z.object({
  answerContains: z.array(z.string()).optional(),
  answerNotContains: z.array(z.string()).optional(),
  answerRegex: z.string().min(1).optional(),
  nodeExecuted: z.array(z.string().min(1)).optional(),
  nodeSkipped: z.array(z.string().min(1)).optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
  noNodeError: z.boolean().optional()
});

export const WorkflowTestCaseSchema = z.object({
  name: z.string().min(1),
  query: z.union([z.string(), z.array(UserChatItemValueItemSchema)]),
  variables: z.record(z.string(), z.unknown()).optional(),
  history: z.array(ChatItemMiniSchema).optional(),
  entryNodes: z.array(z.string().min(1)).optional(),
  expect: WorkflowTestExpectSchema.optional()
});

export type WorkflowTestCase = z.infer<typeof WorkflowTestCaseSchema>;

export const WorkflowTestFileSchema = z.union([
  z.array(WorkflowTestCaseSchema).min(1),
  z.object({
    appId: z.string().min(1).optional(),
    cases: z.array(WorkflowTestCaseSchema).min(1)
  })
]);

export type WorkflowSyncServiceDeps = {
  fileIo: FileIoAdapter;
  templateLoader: WorkflowTemplateLoader;
  env: NodeJS.ProcessEnv;
  readStdin: () => Promise<string>;
};

export type WorkflowSyncService = {
  pull: (params: {
    client: FastGptHttpClient;
    dir: string;
    locale: string;
    appId?: string;
    versionId?: string;
    force?: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  diff: (params: { client: FastGptHttpClient; dir: string; appId?: string }) => Promise<CliResult>;
  push: (params: {
    client: FastGptHttpClient;
    dir: string;
    appId?: string;
    force?: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  publish: (params: {
    client: FastGptHttpClient;
    dir: string;
    appId?: string;
    versionName?: string;
    force?: boolean;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  debug: (params: {
    client: FastGptHttpClient;
    dir: string;
    appId?: string;
    remote?: boolean;
    query?: string;
    variables?: Record<string, unknown>;
    history?: z.infer<typeof ChatItemMiniSchema>[];
    entryNodes?: string[];
    chatId?: string;
    usageId?: string;
    timeoutMs?: number;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  sandboxPackages: (params: { client: FastGptHttpClient }) => Promise<CliResult>;
  optimizeCode: (params: {
    client: FastGptHttpClient;
    prompt: string;
    modelId: string;
    conversationHistory?: z.infer<typeof ChatCompletionMessageParamSchema>[];
    dryRun?: boolean;
  }) => Promise<CliResult>;
  test: (params: {
    client: FastGptHttpClient;
    dir: string;
    appId?: string;
    remote?: boolean;
    casesSource?: string;
    query?: string;
    variables?: Record<string, unknown>;
    failFast?: boolean;
    timeoutMs?: number;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

function parseObjectIdOrThrow(value: string, label = 'App ID'): string {
  const parsed = ObjectIdSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new CliArgumentError(`${label} "${value}" must be a valid 24-character ObjectId.`);
  }
  return parsed.data;
}

function normalizeUserQuery(
  query: string | z.infer<typeof UserChatItemValueItemSchema>[] | undefined
): z.infer<typeof UserChatItemValueItemSchema>[] {
  if (query === undefined) {
    return [];
  }
  if (typeof query === 'string') {
    return query.length > 0 ? [{ text: { content: query } }] : [];
  }
  return query;
}

function isDeepEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) {
    return true;
  }
  if (actual === null || expected === null || typeof actual !== typeof expected) {
    return false;
  }
  if (Array.isArray(actual)) {
    if (!Array.isArray(expected) || actual.length !== expected.length) {
      return false;
    }
    return actual.every((item, idx) => isDeepEqual(item, expected[idx]));
  }
  if (typeof actual === 'object') {
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    const actualKeys = Object.keys(actualRecord);
    const expectedKeys = Object.keys(expectedRecord);
    if (actualKeys.length !== expectedKeys.length) {
      return false;
    }
    return expectedKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(actualRecord, key) &&
        isDeepEqual(actualRecord[key], expectedRecord[key])
    );
  }
  return false;
}

function summarizeDebugResponse(response: WorkflowDebugResponse): {
  executedNodes: string[];
  skippedNodes: string[];
  textOutputs: string[];
  answerText: string;
  nodeErrors: Array<{ nodeId: string; error?: unknown; errorText?: string }>;
} {
  const executedNodes: string[] = [];
  const skippedNodes: string[] = [];
  const textOutputs: string[] = [];
  const nodeErrors: Array<{ nodeId: string; error?: unknown; errorText?: string }> = [];

  for (const [nodeId, entry] of Object.entries(response.nodeResponses ?? {})) {
    if (entry.type === 'run') {
      executedNodes.push(nodeId);
    } else if (entry.type === 'skip') {
      skippedNodes.push(nodeId);
    }
    const nodeRes = entry.response as Record<string, unknown> | undefined;
    if (!nodeRes) {
      continue;
    }
    if (typeof nodeRes.textOutput === 'string' && nodeRes.textOutput.length > 0) {
      textOutputs.push(nodeRes.textOutput);
    }
    const errorCaptured = nodeRes.errorCaptured === true;
    if (!errorCaptured && (nodeRes.error !== undefined || typeof nodeRes.errorText === 'string')) {
      nodeErrors.push({
        nodeId,
        ...(nodeRes.error !== undefined ? { error: nodeRes.error } : {}),
        ...(typeof nodeRes.errorText === 'string' ? { errorText: nodeRes.errorText } : {})
      });
    }
  }

  return {
    executedNodes,
    skippedNodes,
    textOutputs,
    answerText: textOutputs.join('\n'),
    nodeErrors
  };
}

function evaluateWorkflowTestCase({
  testCase,
  summary,
  newVariables
}: {
  testCase: WorkflowTestCase;
  summary: ReturnType<typeof summarizeDebugResponse>;
  newVariables: Record<string, unknown>;
}): { passed: boolean; failures: string[] } {
  const expectConfig = testCase.expect;
  const failures: string[] = [];
  const requireNoNodeError = expectConfig?.noNodeError ?? true;

  if (requireNoNodeError && summary.nodeErrors.length > 0) {
    failures.push(
      `Unexpected node error(s): ${summary.nodeErrors
        .map((err) => `${err.nodeId}: ${err.errorText ?? JSON.stringify(err.error)}`)
        .join('; ')}`
    );
  }

  if (expectConfig?.answerContains) {
    for (const needle of expectConfig.answerContains) {
      if (!summary.answerText.includes(needle)) {
        failures.push(`Expected answer to contain "${needle}".`);
      }
    }
  }

  if (expectConfig?.answerNotContains) {
    for (const forbidden of expectConfig.answerNotContains) {
      if (summary.answerText.includes(forbidden)) {
        failures.push(`Expected answer not to contain "${forbidden}".`);
      }
    }
  }

  if (expectConfig?.answerRegex !== undefined) {
    const regex = new RegExp(expectConfig.answerRegex);
    if (!regex.test(summary.answerText)) {
      failures.push(`Expected answer to match regex /${expectConfig.answerRegex}/.`);
    }
  }

  if (expectConfig?.nodeExecuted) {
    const executedSet = new Set(summary.executedNodes);
    for (const nodeId of expectConfig.nodeExecuted) {
      if (!executedSet.has(nodeId)) {
        failures.push(`Expected node "${nodeId}" to be executed.`);
      }
    }
  }

  if (expectConfig?.nodeSkipped) {
    const skippedSet = new Set(summary.skippedNodes);
    for (const nodeId of expectConfig.nodeSkipped) {
      if (!skippedSet.has(nodeId)) {
        failures.push(`Expected node "${nodeId}" to be skipped.`);
      }
    }
  }

  if (expectConfig?.variables) {
    for (const [key, expectedVal] of Object.entries(expectConfig.variables)) {
      const actualVal = newVariables[key];
      if (!isDeepEqual(actualVal, expectedVal)) {
        failures.push(
          `Expected variable "${key}" to equal ${JSON.stringify(expectedVal)}, received ${JSON.stringify(actualVal)}.`
        );
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures
  };
}

function computeDocumentDiff(localDoc: WorkflowDocument, remoteDoc: WorkflowDocument) {
  const localNodeMap = new Map(localDoc.nodes.map((node) => [node.nodeId, node]));
  const remoteNodeMap = new Map(remoteDoc.nodes.map((node) => [node.nodeId, node]));

  const addedNodes = localDoc.nodes
    .filter((node) => !remoteNodeMap.has(node.nodeId))
    .map((node) => ({ nodeId: node.nodeId, name: node.name, flowNodeType: node.flowNodeType }));
  const removedNodes = remoteDoc.nodes
    .filter((node) => !localNodeMap.has(node.nodeId))
    .map((node) => ({ nodeId: node.nodeId, name: node.name, flowNodeType: node.flowNodeType }));
  const modifiedNodes = localDoc.nodes
    .filter((localNode) => {
      const remoteNode = remoteNodeMap.get(localNode.nodeId);
      return remoteNode !== undefined && JSON.stringify(localNode) !== JSON.stringify(remoteNode);
    })
    .map((localNode) => {
      const remoteNode = remoteNodeMap.get(localNode.nodeId)!;
      const changedFields = (
        ['name', 'intro', 'position', 'inputs', 'outputs', 'catchError', 'parentNodeId'] as const
      ).filter((field) => JSON.stringify(localNode[field]) !== JSON.stringify(remoteNode[field]));
      return {
        nodeId: localNode.nodeId,
        name: localNode.name,
        changedFields
      };
    });

  const localEdgeMap = new Map(localDoc.executionEdges.map((edge) => [JSON.stringify(edge), edge]));
  const remoteEdgeMap = new Map(
    remoteDoc.executionEdges.map((edge) => [JSON.stringify(edge), edge])
  );
  const addedEdges = [...localEdgeMap.entries()]
    .filter(([key]) => !remoteEdgeMap.has(key))
    .map(([, edge]) => edge);
  const removedEdges = [...remoteEdgeMap.entries()]
    .filter(([key]) => !localEdgeMap.has(key))
    .map(([, edge]) => edge);

  const appChanged = JSON.stringify(localDoc.app) !== JSON.stringify(remoteDoc.app);
  const chatConfigChanged =
    JSON.stringify(localDoc.chatConfig) !== JSON.stringify(remoteDoc.chatConfig);

  return {
    appChanged,
    chatConfigChanged,
    nodes: {
      added: addedNodes,
      removed: removedNodes,
      modified: modifiedNodes
    },
    edges: {
      added: addedEdges,
      removed: removedEdges
    }
  };
}

/**
 * 云端工作流同步、调试与自动化测试领域服务。
 */
export function createWorkflowSyncService(deps: WorkflowSyncServiceDeps): WorkflowSyncService {
  const { fileIo, templateLoader, env, readStdin } = deps;

  async function fetchAppDetailOrThrow(
    client: FastGptHttpClient,
    appId: string
  ): Promise<GetAppDetailResponseType> {
    const detail = await client.request<GetAppDetailResponseType>({
      method: 'GET',
      path: '/core/app/detail',
      query: { appId }
    });
    // 后端在无写权限时会将 nodes/edges 置空返回，必须显式拦截避免把空画布当真实草稿覆盖本地。
    if (!detail.permission?.hasWritePer) {
      throw new CliAuthError({
        code: 'AUTH_FORBIDDEN',
        message: `Write permission is required on App "${appId}" to read or modify its workflow.`,
        hint: 'Ask an app admin to grant write permission or switch profile/token.'
      });
    }
    return detail;
  }

  async function resolveAppId({
    explicitAppId,
    dir
  }: {
    explicitAppId?: string;
    dir: string;
  }): Promise<string> {
    if (explicitAppId) {
      return parseObjectIdOrThrow(explicitAppId);
    }
    const syncState = await readWorkflowSyncState({ fileIo, dir });
    if (syncState?.appId) {
      return parseObjectIdOrThrow(syncState.appId, 'Synced App ID');
    }
    const hasLocal = await fileIo.exists(WORKFLOW_FILE_NAME, dir);
    if (hasLocal) {
      const doc = await readWorkflowDocument({ fileIo, dir });
      if (doc.app.appId) {
        return parseObjectIdOrThrow(doc.app.appId, 'workflow.json app.appId');
      }
    }
    throw new CliArgumentError(
      'App ID is required.',
      undefined,
      'Pass <appId> / --app-id <id>, or pull a workflow first with: fastgpt workflow pull <appId>'
    );
  }

  async function fetchRemoteWorkflowDocument({
    client,
    appId,
    versionId,
    locale
  }: {
    client: FastGptHttpClient;
    appId: string;
    versionId?: string;
    locale: string;
  }): Promise<{
    detail: GetAppDetailResponseType;
    document: WorkflowDocument;
    warnings: string[];
  }> {
    const detail = await fetchAppDetailOrThrow(client, appId);
    const workflowPayload = await (async () => {
      if (!versionId) {
        return {
          nodes: detail.nodes ?? [],
          edges: detail.edges ?? [],
          chatConfig: detail.chatConfig ?? {}
        };
      }
      const versionDetail = await client.request<GetAppVersionDetailResponseType>({
        method: 'GET',
        path: '/core/app/version/detail',
        query: { appId, versionId: parseObjectIdOrThrow(versionId, 'Version ID') }
      });
      return {
        nodes: versionDetail.nodes ?? [],
        edges: versionDetail.edges ?? [],
        chatConfig: versionDetail.chatConfig ?? {}
      };
    })();

    const document = decompileStoreWorkflow({
      workflow: workflowPayload as never,
      app: {
        appId: detail._id,
        name: detail.name,
        intro: detail.intro ?? ''
      }
    });

    const templateProvider = await templateLoader.loadProvider({ locale, env });
    const systemConfigResult = await ensureSystemConfigNode({
      document,
      dependencies: {
        templateProvider,
        locale,
        translate: createTranslator(locale)
      }
    });

    return {
      detail,
      document,
      warnings: formatWorkflowWarnings(systemConfigResult.warnings)
    };
  }

  async function assertNoRemoteConflict({
    client,
    dir,
    appId,
    localChecksum,
    force
  }: {
    client: FastGptHttpClient;
    dir: string;
    appId: string;
    localChecksum: string;
    force?: boolean;
  }): Promise<void> {
    if (force) {
      return;
    }
    const syncState = await readWorkflowSyncState({ fileIo, dir });
    if (!syncState || syncState.appId !== appId) {
      return;
    }
    const detail = await fetchAppDetailOrThrow(client, appId);
    const remoteDoc = decompileStoreWorkflow({
      workflow: {
        nodes: detail.nodes ?? [],
        edges: detail.edges ?? [],
        chatConfig: detail.chatConfig ?? {}
      } as never,
      app: {
        appId: detail._id,
        name: detail.name,
        intro: detail.intro ?? ''
      }
    });
    const remoteChecksum = await getWorkflowChecksum(remoteDoc);
    if (remoteChecksum !== syncState.lastChecksum && remoteChecksum !== localChecksum) {
      throw new CliArgumentError(
        'Remote workflow has changed since your last sync.',
        {
          appId,
          expectedRemoteChecksum: syncState.lastChecksum,
          actualRemoteChecksum: remoteChecksum,
          localChecksum
        },
        'Inspect changes with: fastgpt workflow diff or pass --force to overwrite remote draft.'
      );
    }
  }

  async function resolveWorkflowForExecution({
    client,
    dir,
    appId,
    remote
  }: {
    client: FastGptHttpClient;
    dir: string;
    appId: string;
    remote?: boolean;
  }) {
    if (remote) {
      const detail = await fetchAppDetailOrThrow(client, appId);
      return {
        nodes: detail.nodes ?? [],
        edges: detail.edges ?? [],
        chatConfig: detail.chatConfig ?? {}
      };
    }
    const document = await readWorkflowDocument({ fileIo, dir });
    const diagnostics = validateWorkflow(document, { invalidReferencePolicy: 'error' });
    if (diagnostics.some((item) => item.severity === 'error')) {
      throw new WorkflowValidationError(diagnostics);
    }
    return compileStoreWorkflow(document);
  }

  return {
    pull: ({ client, dir, locale, appId: explicitAppId, versionId, force, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const appId = await resolveAppId({ explicitAppId, dir });
        const { detail, document, warnings } = await fetchRemoteWorkflowDocument({
          client,
          appId,
          versionId,
          locale
        });
        const pulledChecksum = await getWorkflowChecksum(document);

        if (!force && (await fileIo.exists(WORKFLOW_FILE_NAME, dir))) {
          const localDoc = await readWorkflowDocument({ fileIo, dir });
          const localChecksum = await getWorkflowChecksum(localDoc);
          const syncState = await readWorkflowSyncState({ fileIo, dir });
          const hasLocalUnpushed = syncState
            ? localChecksum !== syncState.lastChecksum
            : localChecksum !== pulledChecksum;
          if (hasLocalUnpushed && localChecksum !== pulledChecksum) {
            throw new CliArgumentError(
              'Local workflow.json has unpushed modifications.',
              { localChecksum, remoteChecksum: pulledChecksum },
              'Run: fastgpt workflow diff or pass --force to overwrite local workflow.json.'
            );
          }
        }

        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow pull',
            risk: 'write',
            preview: {
              appId,
              name: detail.name,
              ...(versionId ? { versionId } : {}),
              checksum: pulledChecksum,
              nodeCount: document.nodes.length,
              edgeCount: document.executionEdges.length
            },
            warnings
          });
        }

        const filePath = await writeWorkflowDocument({ fileIo, dir, document });
        await writeWorkflowSyncState({
          fileIo,
          dir,
          state: {
            appId,
            baseUrl: client.baseUrl,
            lastSyncedAt: new Date().toISOString(),
            lastChecksum: pulledChecksum,
            lastAction: 'pull',
            ...(versionId ? { lastVersionId: versionId } : {})
          }
        });

        return createChangedResult({
          message: `Pulled workflow "${detail.name}" (${appId}) into ${WORKFLOW_FILE_NAME}`,
          data: {
            appId,
            name: detail.name,
            ...(versionId ? { versionId } : {}),
            checksum: pulledChecksum,
            nodeCount: document.nodes.length,
            edgeCount: document.executionEdges.length,
            filePath
          },
          warnings
        });
      }),

    diff: ({ client, dir, appId: explicitAppId }) =>
      withWorkflowErrorMapping(async () => {
        const appId = await resolveAppId({ explicitAppId, dir });
        const localDoc = await readWorkflowDocument({ fileIo, dir });
        const localChecksum = await getWorkflowChecksum(localDoc);
        const detail = await fetchAppDetailOrThrow(client, appId);
        const remoteDoc = decompileStoreWorkflow({
          workflow: {
            nodes: detail.nodes ?? [],
            edges: detail.edges ?? [],
            chatConfig: detail.chatConfig ?? {}
          } as never,
          app: {
            appId: detail._id,
            name: detail.name,
            intro: detail.intro ?? ''
          }
        });
        const remoteChecksum = await getWorkflowChecksum(remoteDoc);
        const diff = computeDocumentDiff(localDoc, remoteDoc);
        const inSync = localChecksum === remoteChecksum;

        return createSuccessResult({
          data: {
            appId,
            inSync,
            localChecksum,
            remoteChecksum,
            summary: {
              addedNodes: diff.nodes.added.length,
              removedNodes: diff.nodes.removed.length,
              modifiedNodes: diff.nodes.modified.length,
              addedEdges: diff.edges.added.length,
              removedEdges: diff.edges.removed.length,
              appChanged: diff.appChanged,
              chatConfigChanged: diff.chatConfigChanged
            },
            diff
          }
        });
      }),

    push: ({ client, dir, appId: explicitAppId, force, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const appId = await resolveAppId({ explicitAppId, dir });
        const document = await readWorkflowDocument({ fileIo, dir });
        const diagnostics = validateWorkflow(document, { invalidReferencePolicy: 'error' });
        if (diagnostics.some((item) => item.severity === 'error')) {
          throw new WorkflowValidationError(diagnostics);
        }

        const localChecksum = await getWorkflowChecksum(document);
        const compiled = compileStoreWorkflow(document);

        await assertNoRemoteConflict({
          client,
          dir,
          appId,
          localChecksum,
          force
        });

        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow push',
            risk: 'write',
            preview: {
              appId,
              checksum: localChecksum,
              isPublish: false,
              autoSave: true,
              nodeCount: compiled.nodes.length,
              edgeCount: compiled.edges.length
            }
          });
        }

        await client.request({
          method: 'POST',
          path: '/core/app/version/publish',
          query: { appId },
          body: {
            nodes: compiled.nodes,
            edges: compiled.edges,
            chatConfig: compiled.chatConfig,
            isPublish: false,
            autoSave: true
          }
        });

        await writeWorkflowSyncState({
          fileIo,
          dir,
          state: {
            appId,
            baseUrl: client.baseUrl,
            lastSyncedAt: new Date().toISOString(),
            lastChecksum: localChecksum,
            lastAction: 'push'
          }
        });

        return createChangedResult({
          message: `Pushed draft workflow to App ${appId}`,
          data: {
            appId,
            checksum: localChecksum,
            isPublish: false,
            autoSave: true,
            nodeCount: compiled.nodes.length,
            edgeCount: compiled.edges.length
          }
        });
      }),

    publish: ({ client, dir, appId: explicitAppId, versionName, force, dryRun }) =>
      withWorkflowErrorMapping(async () => {
        const appId = await resolveAppId({ explicitAppId, dir });
        const document = await readWorkflowDocument({ fileIo, dir });
        const diagnostics = validateWorkflow(document, { invalidReferencePolicy: 'error' });
        if (diagnostics.some((item) => item.severity === 'error')) {
          throw new WorkflowValidationError(diagnostics);
        }

        const localChecksum = await getWorkflowChecksum(document);
        const compiled = compileStoreWorkflow(document);
        const resolvedVersionName = versionName ?? `CLI publish ${new Date().toISOString()}`;

        await assertNoRemoteConflict({
          client,
          dir,
          appId,
          localChecksum,
          force
        });

        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow publish',
            risk: 'write',
            preview: {
              appId,
              checksum: localChecksum,
              isPublish: true,
              versionName: resolvedVersionName,
              nodeCount: compiled.nodes.length,
              edgeCount: compiled.edges.length
            }
          });
        }

        await client.request({
          method: 'POST',
          path: '/core/app/version/publish',
          query: { appId },
          body: {
            nodes: compiled.nodes,
            edges: compiled.edges,
            chatConfig: compiled.chatConfig,
            isPublish: true,
            versionName: resolvedVersionName
          }
        });

        await writeWorkflowSyncState({
          fileIo,
          dir,
          state: {
            appId,
            baseUrl: client.baseUrl,
            lastSyncedAt: new Date().toISOString(),
            lastChecksum: localChecksum,
            lastAction: 'publish',
            lastVersionName: resolvedVersionName
          }
        });

        return createChangedResult({
          message: `Published workflow version "${resolvedVersionName}" for App ${appId}`,
          data: {
            appId,
            checksum: localChecksum,
            isPublish: true,
            versionName: resolvedVersionName,
            nodeCount: compiled.nodes.length,
            edgeCount: compiled.edges.length
          }
        });
      }),

    debug: ({
      client,
      dir,
      appId: explicitAppId,
      remote,
      query,
      variables,
      history,
      entryNodes,
      chatId,
      usageId,
      timeoutMs,
      dryRun
    }) =>
      withWorkflowErrorMapping(async () => {
        const appId = await resolveAppId({ explicitAppId, dir });
        const storeWorkflow = await resolveWorkflowForExecution({
          client,
          dir,
          appId,
          remote
        });
        const resolvedEntryNodes =
          entryNodes && entryNodes.length > 0
            ? entryNodes
            : getWorkflowEntryNodeIds(storeWorkflow.nodes);
        const runtimeNodes = storeNodes2RuntimeNodes(storeWorkflow.nodes, resolvedEntryNodes);
        const runtimeEdges = storeEdges2RuntimeEdges(storeWorkflow.edges);
        const queryItems = normalizeUserQuery(query);

        const body = {
          appId,
          nodes: runtimeNodes,
          edges: runtimeEdges,
          variables: variables ?? {},
          query: queryItems,
          history: history ?? [],
          chatConfig: storeWorkflow.chatConfig,
          ...(chatId ? { chatId } : {}),
          ...(usageId ? { usageId } : {})
        };

        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow debug',
            risk: 'write',
            preview: {
              method: 'POST',
              path: '/core/workflow/debug',
              appId,
              remote: remote === true,
              entryNodeIds: resolvedEntryNodes,
              nodeCount: runtimeNodes.length,
              edgeCount: runtimeEdges.length,
              queryLength: queryItems.length
            }
          });
        }

        const response = await client.request<WorkflowDebugResponse>({
          method: 'POST',
          path: '/core/workflow/debug',
          body,
          timeoutMs: timeoutMs ?? 300_000
        });
        const summary = summarizeDebugResponse(response);

        return createChangedResult({
          message: `Executed workflow debug on App ${appId}`,
          data: {
            appId,
            usageId: response.usageId,
            entryNodeIds: response.entryNodeIds,
            answerText: summary.answerText,
            executedNodes: summary.executedNodes,
            skippedNodes: summary.skippedNodes,
            nodeErrors: summary.nodeErrors,
            newVariables: response.newVariables,
            response
          }
        });
      }),

    sandboxPackages: async ({ client }) => {
      const data = await client.request<GetSandboxPackagesResponse>({
        method: 'GET',
        path: '/core/workflow/getSandboxPackages'
      });
      return createSuccessResult({ data });
    },

    optimizeCode: async ({ client, prompt, modelId, conversationHistory, dryRun }) => {
      const validatedBody = OptimizeCodeBodySchema.parse({
        optimizerInput: prompt,
        modelId,
        ...(conversationHistory ? { conversationHistory } : {})
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'workflow optimize-code',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/workflow/optimizeCode',
            modelId: validatedBody.modelId,
            promptLength: validatedBody.optimizerInput.length,
            historyLength: validatedBody.conversationHistory?.length ?? 0
          }
        });
      }

      let content = '';
      for await (const event of client.streamSse({
        method: 'POST',
        path: '/core/workflow/optimizeCode',
        body: validatedBody
      })) {
        const raw = event.data.trim();
        if (!raw || raw === '[DONE]') {
          continue;
        }
        try {
          const parsed = JSON.parse(raw) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') {
            content += delta;
          }
        } catch {
          // 忽略非标准心跳或未预期片段，保留已累积的流式代码文本
        }
      }

      return createChangedResult({
        message: `Generated optimized code using model ${validatedBody.modelId}`,
        data: {
          modelId: validatedBody.modelId,
          content
        }
      });
    },

    test: ({
      client,
      dir,
      appId: explicitAppId,
      remote,
      casesSource,
      query,
      variables,
      failFast,
      timeoutMs,
      dryRun
    }) =>
      withWorkflowErrorMapping(async () => {
        const { fileAppId, testCases } = await (async () => {
          if (casesSource !== undefined) {
            const rawText =
              casesSource === '-' ? await readStdin() : await fileIo.readTextFile(casesSource);
            let parsedJson: unknown;
            try {
              parsedJson = JSON.parse(rawText);
            } catch {
              throw new CliArgumentError('Test cases file must contain valid JSON.');
            }
            const parsedFile = WorkflowTestFileSchema.parse(parsedJson);
            return Array.isArray(parsedFile)
              ? { fileAppId: undefined, testCases: parsedFile }
              : { fileAppId: parsedFile.appId, testCases: parsedFile.cases };
          }
          if (query !== undefined) {
            return {
              fileAppId: undefined,
              testCases: [
                {
                  name: 'inline-query',
                  query,
                  ...(variables ? { variables } : {}),
                  expect: { noNodeError: true }
                } satisfies WorkflowTestCase
              ]
            };
          }
          throw new CliArgumentError(
            'Either --cases <path> or --query <text> is required for workflow test.',
            undefined,
            'Run: fastgpt workflow test --cases ./cases.json or --query "Hello"'
          );
        })();

        // 提前校验全部正则表达式，防止跑了一半才因配置语法错误失败。
        for (const testCase of testCases) {
          if (testCase.expect?.answerRegex !== undefined) {
            try {
              new RegExp(testCase.expect.answerRegex);
            } catch (error) {
              throw new CliArgumentError(
                `Invalid answerRegex in test case "${testCase.name}": ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }

        const appId = await resolveAppId({
          explicitAppId: explicitAppId ?? fileAppId,
          dir
        });
        const storeWorkflow = await resolveWorkflowForExecution({
          client,
          dir,
          appId,
          remote
        });

        if (dryRun) {
          return createDryRunResult({
            operation: 'workflow test',
            risk: 'write',
            preview: {
              appId,
              remote: remote === true,
              totalCases: testCases.length,
              caseNames: testCases.map((item) => item.name)
            }
          });
        }

        const results: Array<{
          name: string;
          passed: boolean;
          durationMs: number;
          failures: string[];
          answerText: string;
          executedNodes: string[];
          skippedNodes: string[];
          newVariables: Record<string, unknown>;
          usageId: string;
        }> = [];

        for (const testCase of testCases) {
          const caseStartedAt = Date.now();
          const entryNodeIds =
            testCase.entryNodes && testCase.entryNodes.length > 0
              ? testCase.entryNodes
              : getWorkflowEntryNodeIds(storeWorkflow.nodes);
          const runtimeNodes = storeNodes2RuntimeNodes(storeWorkflow.nodes, entryNodeIds);
          const runtimeEdges = storeEdges2RuntimeEdges(storeWorkflow.edges);
          const mergedVariables = {
            ...(variables ?? {}),
            ...(testCase.variables ?? {})
          };

          const response = await client.request<WorkflowDebugResponse>({
            method: 'POST',
            path: '/core/workflow/debug',
            body: {
              appId,
              nodes: runtimeNodes,
              edges: runtimeEdges,
              variables: mergedVariables,
              query: normalizeUserQuery(testCase.query),
              history: testCase.history ?? [],
              chatConfig: storeWorkflow.chatConfig
            },
            timeoutMs: timeoutMs ?? 300_000
          });

          const summary = summarizeDebugResponse(response);
          const evaluation = evaluateWorkflowTestCase({
            testCase,
            summary,
            newVariables: response.newVariables
          });

          results.push({
            name: testCase.name,
            passed: evaluation.passed,
            durationMs: Date.now() - caseStartedAt,
            failures: evaluation.failures,
            answerText: summary.answerText,
            executedNodes: summary.executedNodes,
            skippedNodes: summary.skippedNodes,
            newVariables: response.newVariables,
            usageId: response.usageId
          });

          if (!evaluation.passed && failFast) {
            break;
          }
        }

        const passedCount = results.filter((item) => item.passed).length;
        const failedCount = results.length - passedCount;

        if (failedCount > 0) {
          throw new CliApiError({
            message: `${failedCount} of ${results.length} workflow test case(s) failed.`,
            details: {
              appId,
              total: testCases.length,
              executed: results.length,
              passed: passedCount,
              failed: failedCount,
              results
            },
            hint: 'Inspect failed case assertions in error.details.results.'
          });
        }

        return createSuccessResult({
          message: `All ${results.length} workflow test case(s) passed.`,
          data: {
            appId,
            total: testCases.length,
            executed: results.length,
            passed: passedCount,
            failed: 0,
            results
          }
        });
      })
  };
}

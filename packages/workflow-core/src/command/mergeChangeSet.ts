import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  WorkflowChangeSetChunkSchema,
  WorkflowChangeSetSchema,
  type WorkflowChangeSet,
  type WorkflowChangeSetChunk,
  type WorkflowCommand
} from './type';

export class WorkflowChangeSetMergeError extends Error {
  readonly code: WorkflowDiagnosticCodeEnum;
  readonly params?: Record<string, unknown>;

  constructor(code: WorkflowDiagnosticCodeEnum, message: string, params?: Record<string, unknown>) {
    super(message);
    this.name = 'WorkflowChangeSetMergeError';
    this.code = code;
    this.params = params;
  }
}

const stableJson = (value: unknown) => JSON.stringify(value);

export const getWorkflowCommandTarget = (command: WorkflowCommand): string | undefined => {
  switch (command.type) {
    case 'node.add':
    case 'node.update':
    case 'node.move':
    case 'node.insert':
    case 'node.remove':
      return `node:${command.nodeId}`;
    case 'node.clone':
      return `node:${command.nodeId}`;
    case 'input.set':
    case 'input.ref':
    case 'input.unset':
      return `input:${command.nodeId}:${command.inputKey}`;
    case 'input.add':
      return `input:${command.nodeId}:${command.input.key}`;
    case 'input.remove':
      return `input:${command.nodeId}:${command.inputKey}`;
    case 'output.add':
      return `output:${command.nodeId}:${command.output.key}`;
    case 'output.remove':
      return `output:${command.nodeId}:${command.outputKey}`;
    case 'tool.attach':
      return `tool:${command.toolCallNodeId}:${command.toolNodeId ?? command.newNodeId ?? ''}`;
    case 'tool.detach':
      return `tool:${command.toolCallNodeId}:${command.toolNodeId}`;
    case 'config.set':
    case 'config.unset':
      return `config:${command.path}`;
    case 'variable.add':
      return `variable:${command.variable.key}`;
    case 'variable.update':
    case 'variable.remove':
      return `variable:${command.key}`;
    case 'edge.connect':
    case 'edge.disconnect':
      return `edge:${stableJson(command.edge)}`;
    case 'edge.reconnect':
      return `edge:${stableJson(command.oldEdge)}`;
    case 'meta.update':
      return 'meta';
  }
};

const mergePatchCommand = (
  left: WorkflowCommand,
  right: WorkflowCommand
): WorkflowCommand | undefined => {
  if (left.type !== right.type) return;
  if (left.type === 'node.update' && right.type === 'node.update') {
    const leftFields = Object.keys(left).filter((key) => key !== 'type' && key !== 'nodeId');
    const rightFields = Object.keys(right).filter((key) => key !== 'type' && key !== 'nodeId');
    if (rightFields.some((key) => leftFields.includes(key))) return;
    return { ...left, ...right };
  }
  if (left.type === 'meta.update' && right.type === 'meta.update') {
    const leftFields = Object.keys(left).filter((key) => key !== 'type');
    const rightFields = Object.keys(right).filter((key) => key !== 'type');
    if (rightFields.some((key) => leftFields.includes(key))) return;
    return { ...left, ...right };
  }
  if (left.type === 'variable.update' && right.type === 'variable.update') {
    const leftFields = Object.keys(left.patch);
    const rightFields = Object.keys(right.patch);
    if (rightFields.some((key) => leftFields.includes(key))) return;
    return { ...left, patch: { ...left.patch, ...right.patch } };
  }
  return;
};

const sortChunks = (chunks: WorkflowChangeSetChunk[]) => {
  const byId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const state = new Map<string, 'visiting' | 'visited'>();
  const sorted: WorkflowChangeSetChunk[] = [];
  const visit = (chunk: WorkflowChangeSetChunk) => {
    const currentState = state.get(chunk.chunkId);
    if (currentState === 'visited') return;
    if (currentState === 'visiting') {
      throw new WorkflowChangeSetMergeError(
        WorkflowDiagnosticCodeEnum.changesetChunkDependencyCycle,
        `Chunk dependency cycle includes ${chunk.chunkId}`
      );
    }
    state.set(chunk.chunkId, 'visiting');
    for (const dependencyId of chunk.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw new WorkflowChangeSetMergeError(
          WorkflowDiagnosticCodeEnum.changesetChunkDependencyMissing,
          `Chunk ${chunk.chunkId} depends on missing chunk ${dependencyId}`
        );
      }
      visit(dependency);
    }
    state.set(chunk.chunkId, 'visited');
    sorted.push(chunk);
  };
  chunks.forEach(visit);
  return sorted;
};

/**
 * 按依赖关系合并分片，保留执行顺序，仅折叠相邻的等价命令或不相交补丁。
 * 对同一目标保留全部贡献者用于冲突校验，避免未折叠的补丁掩盖前面的字段冲突。
 * 该函数只产生完整 ChangeSet，不执行任何工作流写入。
 */
export const mergeWorkflowChangeSetChunks = ({
  baseChecksum,
  chunks
}: {
  baseChecksum: string;
  chunks: WorkflowChangeSetChunk[];
}): WorkflowChangeSet => {
  if (chunks.length === 0) {
    throw new WorkflowChangeSetMergeError(
      WorkflowDiagnosticCodeEnum.changesetChunksEmpty,
      'At least one ChangeSet chunk is required'
    );
  }
  const parsedChunks = chunks.map((chunk) => WorkflowChangeSetChunkSchema.parse(chunk));
  const sortedChunks = sortChunks(parsedChunks);
  const commands: WorkflowCommand[] = [];
  const commandStates = new Map<
    string,
    {
      outputIndex: number;
      contributors: {
        command: WorkflowCommand;
        outputIndex: number;
        origin: {
          chunkId: string;
          commandIndex: number;
          commandType: WorkflowCommand['type'];
        };
      }[];
    }
  >();

  for (const chunk of sortedChunks) {
    for (const [commandIndex, command] of chunk.commands.entries()) {
      const target = getWorkflowCommandTarget(command);
      const identity = target ?? stableJson(command);
      const incomingOrigin = {
        chunkId: chunk.chunkId,
        commandIndex,
        commandType: command.type
      };
      const state = commandStates.get(identity);
      if (!state) {
        commandStates.set(identity, {
          outputIndex: commands.length,
          contributors: [{ command, outputIndex: commands.length, origin: incomingOrigin }]
        });
        commands.push(command);
        continue;
      }
      const existing = commands[state.outputIndex];
      const isAdjacent = state.outputIndex === commands.length - 1;
      const isEquivalent = stableJson(existing) === stableJson(command);
      if (
        isAdjacent &&
        (isEquivalent ||
          state.contributors.some(
            (contributor) =>
              contributor.outputIndex === state.outputIndex &&
              stableJson(contributor.command) === stableJson(command)
          ))
      ) {
        continue;
      }
      const conflictingContributor = isEquivalent
        ? undefined
        : state.contributors.find(
            (contributor) =>
              contributor.command.type !== command.type ||
              (stableJson(contributor.command) !== stableJson(command) &&
                mergePatchCommand(contributor.command, command) === undefined)
          );
      if (!conflictingContributor) {
        // 不跨越中间命令折叠补丁，否则会提前改变克隆读取的状态或清理副作用。
        const merged = isAdjacent ? mergePatchCommand(existing, command) : undefined;
        if (merged) {
          commands[state.outputIndex] = merged;
        } else {
          state.outputIndex = commands.length;
          commands.push(command);
        }
        state.contributors.push({
          command,
          outputIndex: state.outputIndex,
          origin: incomingOrigin
        });
        continue;
      }
      throw new WorkflowChangeSetMergeError(
        WorkflowDiagnosticCodeEnum.changesetCommandConflict,
        `Conflicting commands target ${target ?? identity}`,
        {
          target: target ?? identity,
          existing: conflictingContributor.origin,
          incoming: incomingOrigin
        }
      );
    }
  }

  return WorkflowChangeSetSchema.parse({
    schemaVersion: 'fastgpt-workflow-changeset/v1',
    baseChecksum,
    commands
  });
};

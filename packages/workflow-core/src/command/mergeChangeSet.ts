import {
  WorkflowChangeSetChunkSchema,
  WorkflowChangeSetSchema,
  type WorkflowChangeSet,
  type WorkflowChangeSetChunk,
  type WorkflowCommand
} from './type';

export class WorkflowChangeSetMergeError extends Error {
  readonly code: string;
  readonly params?: Record<string, unknown>;

  constructor(code: string, message: string, params?: Record<string, unknown>) {
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
        'WORKFLOW_CHANGESET_CHUNK_DEPENDENCY_CYCLE',
        `Chunk dependency cycle includes ${chunk.chunkId}`
      );
    }
    state.set(chunk.chunkId, 'visiting');
    for (const dependencyId of chunk.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw new WorkflowChangeSetMergeError(
          'WORKFLOW_CHANGESET_CHUNK_DEPENDENCY_MISSING',
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
 * 按依赖关系合并分片，并拒绝会让结果依赖到达顺序的冲突命令。
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
      'WORKFLOW_CHANGESET_CHUNKS_EMPTY',
      'At least one ChangeSet chunk is required'
    );
  }
  const parsedChunks = chunks.map((chunk) => WorkflowChangeSetChunkSchema.parse(chunk));
  const sortedChunks = sortChunks(parsedChunks);
  const commands: WorkflowCommand[] = [];
  const commandIndexes = new Map<string, number>();
  const commandContributors = new Map<
    string,
    {
      command: WorkflowCommand;
      origin: {
        chunkId: string;
        commandIndex: number;
        commandType: WorkflowCommand['type'];
      };
    }[]
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
      const existingIndex = commandIndexes.get(identity);
      if (existingIndex === undefined) {
        commandIndexes.set(identity, commands.length);
        commandContributors.set(identity, [{ command, origin: incomingOrigin }]);
        commands.push(command);
        continue;
      }
      const existing = commands[existingIndex];
      const contributors = commandContributors.get(identity) ?? [];
      if (
        stableJson(existing) === stableJson(command) ||
        contributors.some((contributor) => stableJson(contributor.command) === stableJson(command))
      ) {
        continue;
      }
      const merged = mergePatchCommand(existing, command);
      if (merged) {
        commands[existingIndex] = merged;
        contributors.push({ command, origin: incomingOrigin });
        continue;
      }
      const conflictingContributor =
        contributors.find(
          (contributor) =>
            contributor.command.type !== command.type ||
            mergePatchCommand(contributor.command, command) === undefined
        ) ?? contributors[0];
      throw new WorkflowChangeSetMergeError(
        'WORKFLOW_CHANGESET_COMMAND_CONFLICT',
        `Conflicting commands target ${target ?? identity}`,
        {
          target: target ?? identity,
          existing: conflictingContributor?.origin,
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

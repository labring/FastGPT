import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getNewToolPreviewNode } from '@/web/core/app/api/tool';
import {
  agentForm2AppWorkflow,
  loadGeneratedTools
} from '@/pageComponents/app/detail/Edit/ChatAgent/utils';

vi.mock('@/web/core/app/api/tool', () => ({ getNewToolPreviewNode: vi.fn() }));

const createTool = (
  id: string,
  override: Partial<SelectedToolItemType> = {}
): SelectedToolItemType => ({
  id,
  pluginId: id,
  name: 'Shared tool',
  flowNodeType: FlowNodeTypeEnum.tool,
  inputs: [],
  outputs: [],
  ...override
});

describe('loadGeneratedTools', () => {
  beforeEach(() => {
    vi.mocked(getNewToolPreviewNode).mockReset();
    vi.mocked(getNewToolPreviewNode).mockImplementation(async ({ appId, source }) =>
      createTool(appId, { source })
    );
  });
  const toolId = 'systemTool-shared';
  it('loads team tools from their own source without reusing a same-ID system tool', async () => {
    const systemTool = createTool(toolId, { source: 'system' });
    const teamSource = 'teamId:team-1';
    const result = await loadGeneratedTools({
      newToolIds: [
        { id: toolId, source: 'system' },
        { id: toolId, source: teamSource }
      ],
      existsTools: [systemTool]
    });

    expect(result[0]).toBe(systemTool);
    expect(result[1]).toMatchObject({ id: toolId, source: teamSource });
    expect(getNewToolPreviewNode).toHaveBeenCalledExactlyOnceWith({
      appId: toolId,
      source: teamSource
    });
    const form = getDefaultAppForm();
    form.selectedTools = result;
    const workflow = agentForm2AppWorkflow(form, (key: string) => key);
    const savedTools = workflow.nodes
      .find((node) => node.flowNodeType === FlowNodeTypeEnum.agent)
      ?.inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value;
    expect(savedTools).toEqual([
      expect.objectContaining({ id: toolId, source: 'system' }),
      expect.objectContaining({ id: toolId, source: teamSource })
    ]);
  });

  it('continues loading legacy string tool references', async () => {
    const result = await loadGeneratedTools({ newToolIds: [toolId] });

    expect(result).toEqual([expect.objectContaining({ id: toolId })]);
    expect(getNewToolPreviewNode).toHaveBeenCalledExactlyOnceWith({
      appId: toolId,
      source: undefined
    });
  });

  it('reuses a team tool whose source is only stored in its tool config', async () => {
    const source = 'teamId:team-1';
    const teamTool = {
      ...createTool(toolId),
      toolConfig: { systemTool: { toolId, source } }
    };
    const result = await loadGeneratedTools({
      newToolIds: [{ id: toolId, source }],
      existsTools: [createTool(toolId, { source: 'system' }), teamTool]
    });

    expect(result).toEqual([teamTool]);
    expect(getNewToolPreviewNode).not.toHaveBeenCalled();
  });

  it.each([undefined, 'system'])(
    'preserves existing system configuration when the saved source is %s',
    async (source) => {
      const tool = {
        ...createTool(toolId, { source }),
        version: 'saved-version',
        inputs: [
          {
            key: 'apiKey',
            label: '',
            renderTypeList: [],
            value: 'saved-api-key'
          }
        ]
      };
      const result = await loadGeneratedTools({
        newToolIds: [{ id: toolId, source: 'system' }],
        existsTools: [tool]
      });

      expect(result).toEqual([{ ...tool, source: 'system' }]);
      expect(result[0].inputs).toBe(tool.inputs);
      expect(tool.source).toBe(source);
      expect(getNewToolPreviewNode).not.toHaveBeenCalled();

      const form = getDefaultAppForm();
      form.selectedTools = result;
      const savedTools = agentForm2AppWorkflow(form, (key: string) => key)
        .nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.agent)
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value;
      expect(savedTools).toEqual([
        expect.objectContaining({
          id: toolId,
          source: 'system',
          version: 'saved-version',
          config: { apiKey: 'saved-api-key' }
        })
      ]);
    }
  );

  it('loads V2 plugin and app references and reuses existing tools', async () => {
    const existingTeamTool = createTool('systemTool-metaso', {
      source: 'teamId:67a100000000000000000001'
    });

    const result = await loadGeneratedTools({
      newToolIds: [
        'plugin:system:metaso',
        'plugin:team:67a100000000000000000001:metaso',
        'app:team:66f100000000000000000011',
        'builtin:read_files'
      ],
      existsTools: [existingTeamTool]
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: 'systemTool-metaso', source: 'system' });
    expect(result[1]).toBe(existingTeamTool);
    expect(result[2]).toMatchObject({ id: '66f100000000000000000011', source: undefined });
    expect(getNewToolPreviewNode).toHaveBeenCalledTimes(2);
    expect(getNewToolPreviewNode).toHaveBeenCalledWith({
      appId: 'systemTool-metaso',
      source: 'system'
    });
    expect(getNewToolPreviewNode).toHaveBeenCalledWith({
      appId: '66f100000000000000000011',
      source: undefined
    });
  });

  it.each([
    { type: 'mcp', toolName: 'search' },
    { type: 'http', toolName: '/api/v1/users' }
  ])('returns the canonical $type child ID from preview', async ({ type, toolName }) => {
    const parentId = '66f100000000000000000021';
    const childId = type + '-' + parentId + '/' + toolName;
    vi.mocked(getNewToolPreviewNode).mockResolvedValueOnce(
      createTool('preview-node', { pluginId: childId })
    );

    await expect(
      loadGeneratedTools({ newToolIds: ['app:team:' + parentId + '/' + toolName] })
    ).resolves.toEqual([expect.objectContaining({ id: childId })]);
  });

  it('rejects a stale MCP child and reuses existing config after a confirmed preview', async () => {
    const parentId = '66f100000000000000000031';
    const savedId = 'mcp-' + parentId + '/catalog/search';
    const actualId = 'mcp-' + parentId + '/search';
    const createMcpTool = (id: string, toolId: string) =>
      createTool(id, { toolConfig: { mcpTool: { toolId } } });
    const staleTool = createMcpTool(savedId, savedId);
    const reloadedTool = createMcpTool(savedId, actualId);
    vi.mocked(getNewToolPreviewNode)
      .mockRejectedValueOnce(new Error('unExist'))
      .mockResolvedValueOnce(createMcpTool(actualId, actualId));

    await expect(
      loadGeneratedTools({
        newToolIds: ['app:team:' + parentId + '/catalog/search'],
        existsTools: [staleTool]
      })
    ).rejects.toThrow('unExist');
    expect(getNewToolPreviewNode).toHaveBeenCalledWith({
      appId: parentId + '/catalog/search',
      source: undefined
    });

    await expect(
      loadGeneratedTools({
        newToolIds: ['app:team:' + parentId + '/search'],
        existsTools: [reloadedTool]
      })
    ).resolves.toEqual([reloadedTool]);
  });
});

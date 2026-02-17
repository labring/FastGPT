import { describe, it, expect } from 'vitest';
import {
  skillManifest2AppConfig,
  getSkillRuntimeNodes,
  getSkillDefaultAppName
} from '@fastgpt/global/core/app/skill/utils';
import {
  SkillCategoryEnum,
  type SkillManifestType
} from '@fastgpt/global/core/app/skill/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

describe('Skill Utils', () => {
  const mockSkill: SkillManifestType = {
    id: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill for unit tests',
    avatar: 'core/app/type/agentFill',
    author: 'Test',
    version: '1.0.0',
    tags: ['test'],
    category: SkillCategoryEnum.coding,
    config: {
      systemPrompt: 'You are a coding assistant for {{language}}.',
      tools: ['tool-1', 'tool-2'],
      variables: [
        {
          key: 'language',
          label: 'Programming Language',
          type: 'select',
          required: false,
          defaultValue: 'TypeScript',
          options: ['TypeScript', 'Python']
        }
      ],
      datasetIds: ['dataset-1'],
      model: 'gpt-4',
      temperature: 0.7,
      maxHistories: 8
    }
  };

  describe('getSkillRuntimeNodes', () => {
    it('should create nodes with correct structure', () => {
      const { nodes, edges } = getSkillRuntimeNodes({
        config: mockSkill.config,
        systemPrompt: 'Test prompt',
        selectedToolIds: ['tool-1'],
        selectedDatasetIds: ['dataset-1']
      });

      expect(nodes.length).toBe(3); // systemConfig, workflowStart, agent
      expect(edges.length).toBe(1);

      // Check system config node
      const systemConfig = nodes.find((n) => n.flowNodeType === FlowNodeTypeEnum.systemConfig);
      expect(systemConfig).toBeDefined();

      // Check workflow start node
      const workflowStart = nodes.find((n) => n.flowNodeType === FlowNodeTypeEnum.workflowStart);
      expect(workflowStart).toBeDefined();

      // Check agent node
      const agent = nodes.find((n) => n.flowNodeType === FlowNodeTypeEnum.agent);
      expect(agent).toBeDefined();
      expect(agent?.inputs).toBeDefined();
    });

    it('should include system prompt in agent node', () => {
      const { nodes } = getSkillRuntimeNodes({
        config: mockSkill.config,
        systemPrompt: 'Custom system prompt',
        selectedToolIds: [],
        selectedDatasetIds: []
      });

      const agent = nodes.find((n) => n.flowNodeType === FlowNodeTypeEnum.agent);
      const systemPromptInput = agent?.inputs.find(
        (i) => i.key === NodeInputKeyEnum.aiSystemPrompt
      );

      expect(systemPromptInput).toBeDefined();
      expect(systemPromptInput?.value).toBe('Custom system prompt');
    });

    it('should include tools in agent node', () => {
      const { nodes } = getSkillRuntimeNodes({
        config: mockSkill.config,
        systemPrompt: 'Test',
        selectedToolIds: ['tool-1', 'tool-2'],
        selectedDatasetIds: []
      });

      const agent = nodes.find((n) => n.flowNodeType === FlowNodeTypeEnum.agent);
      const toolsInput = agent?.inputs.find((i) => i.key === NodeInputKeyEnum.selectedTools);

      expect(toolsInput).toBeDefined();
      expect(toolsInput?.value).toHaveLength(2);
      expect(toolsInput?.value[0].id).toBe('tool-1');
      expect(toolsInput?.value[1].id).toBe('tool-2');
    });

    it('should create edge from workflowStart to agent', () => {
      const { edges } = getSkillRuntimeNodes({
        config: mockSkill.config,
        systemPrompt: 'Test',
        selectedToolIds: [],
        selectedDatasetIds: []
      });

      expect(edges.length).toBe(1);
      expect(edges[0].source).toContain('workflowStart');
      expect(edges[0].target).toContain('agent');
    });
  });

  describe('skillManifest2AppConfig', () => {
    it('should convert manifest to app config', () => {
      const config = skillManifest2AppConfig({
        manifest: mockSkill,
        variableValues: {}
      });

      expect(config.name).toBe(mockSkill.name);
      expect(config.avatar).toBe(mockSkill.avatar);
      expect(config.intro).toBe(mockSkill.description);
      expect(config.modules.length).toBe(3);
      expect(config.edges.length).toBe(1);
      expect(config.chatConfig.variables).toBeDefined();
    });

    it('should parse system prompt template with variables', () => {
      const config = skillManifest2AppConfig({
        manifest: mockSkill,
        variableValues: { language: 'Python' }
      });

      const agent = config.modules.find((n) => n.flowNodeType === FlowNodeTypeEnum.agent);
      const systemPromptInput = agent?.inputs.find(
        (i) => i.key === NodeInputKeyEnum.aiSystemPrompt
      );

      expect(systemPromptInput?.value).toContain('Python');
    });

    it('should handle missing variable values gracefully', () => {
      const config = skillManifest2AppConfig({
        manifest: mockSkill,
        variableValues: {}
      });

      const agent = config.modules.find((n) => n.flowNodeType === FlowNodeTypeEnum.agent);
      const systemPromptInput = agent?.inputs.find(
        (i) => i.key === NodeInputKeyEnum.aiSystemPrompt
      );

      // Should replace with empty string when value is missing
      expect(systemPromptInput?.value).not.toContain('{{');
    });

    it('should allow custom name, avatar, intro', () => {
      const config = skillManifest2AppConfig({
        manifest: mockSkill,
        customName: 'Custom Name',
        customAvatar: 'custom/avatar',
        customIntro: 'Custom intro'
      });

      expect(config.name).toBe('Custom Name');
      expect(config.avatar).toBe('custom/avatar');
      expect(config.intro).toBe('Custom intro');
    });

    it('should use skill defaults when custom values not provided', () => {
      const config = skillManifest2AppConfig({
        manifest: mockSkill
      });

      expect(config.name).toBe(mockSkill.name);
      expect(config.avatar).toBe(mockSkill.avatar);
      expect(config.intro).toBe(mockSkill.description);
    });

    it('should override tool ids when provided', () => {
      const config = skillManifest2AppConfig({
        manifest: mockSkill,
        selectedToolIds: ['custom-tool']
      });

      const agent = config.modules.find((n) => n.flowNodeType === FlowNodeTypeEnum.agent);
      const toolsInput = agent?.inputs.find((i) => i.key === NodeInputKeyEnum.selectedTools);

      expect(toolsInput?.value).toHaveLength(1);
      expect(toolsInput?.value[0].id).toBe('custom-tool');
    });

    it('should convert variables to app variables', () => {
      const config = skillManifest2AppConfig({
        manifest: mockSkill
      });

      expect(config.chatConfig.variables).toHaveLength(1);
      expect(config.chatConfig.variables[0].key).toBe('language');
      expect(config.chatConfig.variables[0].label).toBe('Programming Language');
    });
  });

  describe('getSkillDefaultAppName', () => {
    it('should generate unique app name', () => {
      const name = getSkillDefaultAppName(mockSkill);

      expect(name).toContain(mockSkill.name);
      expect(name.length).toBeGreaterThan(mockSkill.name.length);
    });

    it('should generate different names on each call', () => {
      const name1 = getSkillDefaultAppName(mockSkill);
      const name2 = getSkillDefaultAppName(mockSkill);

      expect(name1).not.toBe(name2);
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  checkAppFormBeforePublish,
  checkAppFormResourceIssues,
  checkAppFormSandboxIssues
} from '@/pageComponents/app/detail/Edit/FormComponent/checkAppForm';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import type { TFunction } from 'next-i18next';

const mockT: TFunction = ((key: string) => {
  const map: Record<string, string> = {
    'common:core.workflow.check.resource_no_permission': '无权限访问该资源，请检查权限',
    'common:core.workflow.check.tool_no_permission': '当前账号无权限访问该资源',
    'common:core.workflow.check.tool_offline': '引用工具已下线，请删除',
    'common:core.workflow.check.tool_missing': '该工具不存在，请删除',
    'common:core.workflow.check.tool_load_failed': '工具加载失败，请稍后重试',
    'common:core.workflow.check.resource_missing': '引用的知识库或技能已删除或不可用，请删除',
    'app:app.error.publish_unExist_app': '发布失败，请检查工具配置是否正确',
    'skill:sandbox_skill_unavailable_toast': '包含技能时需配置并开启虚拟机',
    'skill:sandbox_system_not_configured_toast': '系统未配置虚拟机',
    'app:sandbox_free_not_support': '免费版不支持虚拟机',
    'common:core.workflow.Check Failed': '检查未通过'
  };
  return map[key] || key;
}) as any;

const createMockTool = (overrides: Partial<SelectedToolItemType> = {}): SelectedToolItemType =>
  ({
    id: 'tool-1',
    pluginId: 'tool-1',
    name: 'Tool 1',
    avatar: '',
    intro: '',
    flowNodeType: FlowNodeTypeEnum.tool,
    showStatus: false,
    inputs: [],
    outputs: [],
    templateType: 'personalTool' as any,
    configStatus: 'configured',
    ...overrides
  }) as unknown as SelectedToolItemType;

describe('checkAppFormResourceIssues', () => {
  it('should return undefined when all resources are valid', () => {
    const appForm = getDefaultAppForm();
    appForm.selectedTools = [createMockTool()];
    appForm.selectedAgentSkills = [
      {
        skillId: 'skill-1',
        name: 'Skill 1',
        description: '',
        isDeleted: false,
        permissionDenied: false
      }
    ];
    appForm.dataset.datasets = [
      {
        datasetId: 'dataset-1',
        name: 'Dataset 1',
        avatar: '',
        vectorModel: { model: 'text-embedding-3-small' },
        isDeleted: false,
        permissionDenied: false
      }
    ];

    const result = checkAppFormResourceIssues({ appForm, t: mockT });
    expect(result).toBeUndefined();
  });

  describe('tool checks', () => {
    it('should return resource_no_permission when tool has permissionDenied', () => {
      const appForm = getDefaultAppForm();
      appForm.selectedTools = [
        createMockTool({
          pluginData: { permissionDenied: true }
        })
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('无权限访问该资源，请检查权限');
    });

    it('should return tool_no_permission when tool has permission error code', () => {
      const appForm = getDefaultAppForm();
      appForm.selectedTools = [
        createMockTool({
          pluginData: { error: AppErrEnum.unAuthApp }
        })
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('当前账号无权限访问该资源');
    });

    it('should return tool_missing when tool has unExist error', () => {
      const appForm = getDefaultAppForm();
      appForm.selectedTools = [
        createMockTool({
          pluginData: { error: AppErrEnum.unExist }
        })
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('该工具不存在，请删除');
    });

    it('should return tool_missing when tool is offline', () => {
      const appForm = getDefaultAppForm();
      appForm.selectedTools = [
        createMockTool({
          status: PluginStatusEnum.Offline
        })
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('该工具不存在，请删除');
    });

    it('should return publish_unExist_app when tool config is invalid', () => {
      const appForm = getDefaultAppForm();
      appForm.selectedTools = [
        createMockTool({
          configStatus: 'invalid'
        })
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('发布失败，请检查工具配置是否正确');
    });
  });

  describe('skill checks', () => {
    it('should return resource_no_permission when skill has permissionDenied', () => {
      const appForm = getDefaultAppForm();
      appForm.selectedAgentSkills = [
        {
          skillId: 'skill-1',
          name: 'Skill 1',
          description: '',
          isDeleted: false,
          permissionDenied: true
        }
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('无权限访问该资源，请检查权限');
    });

    it('should return resource_missing when skill isDeleted', () => {
      const appForm = getDefaultAppForm();
      appForm.selectedAgentSkills = [
        {
          skillId: 'skill-1',
          name: 'Skill 1',
          description: '',
          isDeleted: true,
          permissionDenied: false
        }
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('引用的知识库或技能已删除或不可用，请删除');
    });
  });

  describe('dataset checks', () => {
    it('should return resource_no_permission when dataset has permissionDenied', () => {
      const appForm = getDefaultAppForm();
      appForm.dataset.datasets = [
        {
          datasetId: 'dataset-1',
          name: 'Dataset 1',
          avatar: '',
          vectorModel: { model: 'text-embedding-3-small' },
          isDeleted: false,
          permissionDenied: true
        }
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('无权限访问该资源，请检查权限');
    });

    it('should return resource_missing when dataset isDeleted', () => {
      const appForm = getDefaultAppForm();
      appForm.dataset.datasets = [
        {
          datasetId: 'dataset-1',
          name: 'Dataset 1',
          avatar: '',
          vectorModel: { model: 'text-embedding-3-small' },
          isDeleted: true,
          permissionDenied: false
        }
      ];

      const result = checkAppFormResourceIssues({ appForm, t: mockT });
      expect(result).toBe('引用的知识库或技能已删除或不可用，请删除');
    });
  });

  describe('sandbox checks', () => {
    it('should return error when useAgentSandbox is on but sandbox is not configured', () => {
      const appForm = getDefaultAppForm();
      appForm.aiSettings.useAgentSandbox = true;

      const result = checkAppFormSandboxIssues({
        appForm,
        showSandbox: false,
        enableSandbox: true,
        t: mockT
      });
      expect(result).toBe('系统未配置虚拟机');
    });

    it('should return error when useAgentSandbox is on but free plan does not support sandbox', () => {
      const appForm = getDefaultAppForm();
      appForm.aiSettings.useAgentSandbox = true;

      const result = checkAppFormSandboxIssues({
        appForm,
        showSandbox: true,
        enableSandbox: false,
        t: mockT
      });
      expect(result).toBe('免费版不支持虚拟机');
    });
  });

  describe('checkAppFormBeforePublish integrated checks', () => {
    it('should prioritize sandbox error if sandbox is unavailable', async () => {
      const appForm = getDefaultAppForm();
      appForm.aiSettings.useAgentSandbox = true;

      const result = await checkAppFormBeforePublish({
        appForm,
        form2WorkflowFn: () => ({ nodes: [], edges: [] }),
        showSandbox: false,
        enableSandbox: true,
        t: mockT
      });
      expect(result).toBe('系统未配置虚拟机');
    });

    it('should prioritize resource error when tool has permissionDenied', async () => {
      const appForm = getDefaultAppForm();
      appForm.selectedTools = [
        createMockTool({
          pluginData: { permissionDenied: true }
        })
      ];

      const result = await checkAppFormBeforePublish({
        appForm,
        form2WorkflowFn: () => ({ nodes: [], edges: [] }),
        showSandbox: true,
        enableSandbox: true,
        t: mockT
      });
      expect(result).toBe('无权限访问该资源，请检查权限');
    });

    it('should return undefined when all validations pass', async () => {
      const appForm = getDefaultAppForm();
      const result = await checkAppFormBeforePublish({
        appForm,
        form2WorkflowFn: () => ({ nodes: [], edges: [] }),
        showSandbox: true,
        enableSandbox: true,
        t: mockT
      });
      expect(result).toBeUndefined();
    });
  });
});

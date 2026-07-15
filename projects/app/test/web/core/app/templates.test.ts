import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getEmptyAppsTemplate } from '@/web/core/app/templates';

describe('getEmptyAppsTemplate', () => {
  it('创建空应用时按当前语言初始化节点标题和描述', () => {
    const templates = getEmptyAppsTemplate(((key: string) => `translated:${key}`) as any);
    const nodes = [
      ...templates[AppTypeEnum.simple].nodes,
      ...templates[AppTypeEnum.workflow].nodes,
      ...templates[AppTypeEnum.workflowTool].nodes
    ];

    expect(nodes.every((node) => node.name.startsWith('translated:'))).toBe(true);
    expect(nodes.filter((node) => node.intro).map((node) => node.intro)).toEqual([
      'translated:common:core.module.template.config_params',
      'translated:common:core.module.template.ai_chat_intro',
      'translated:common:core.module.template.system_config_info'
    ]);
  });
});

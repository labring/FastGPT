import { describe, it, expect } from 'vitest';
import {
  form2AppWorkflow,
  filterSensitiveFormData,
  getAppQGuideCustomURL
} from '@/web/core/app/utils';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { AppSchema } from '@fastgpt/global/core/app/type';

describe('web/core/app/utils', () => {
  const mockT = (text: string) => text;

  describe('form2AppWorkflow', () => {
    it('should generate simple chat workflow', () => {
      const form = getDefaultAppForm();
      const result = form2AppWorkflow(form, mockT);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(1);
      expect(result.chatConfig).toBeDefined();
    });

    it('should generate dataset workflow', () => {
      const form = getDefaultAppForm();
      form.dataset.datasets = ['dataset1'];
      const result = form2AppWorkflow(form, mockT);

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(2);
    });

    it('should generate tools workflow', () => {
      const form = getDefaultAppForm();
      form.selectedTools = [
        {
          id: 'tool1',
          name: 'Tool 1',
          flowNodeType: FlowNodeTypeEnum.tools,
          inputs: [],
          outputs: []
        }
      ];
      const result = form2AppWorkflow(form, mockT);

      expect(result.nodes.length).toBeGreaterThan(3);
      expect(result.edges.length).toBeGreaterThan(1);
    });
  });

  describe('filterSensitiveFormData', () => {
    it('should filter sensitive data', () => {
      const form = getDefaultAppForm();
      form.dataset.datasets = ['sensitive'];

      const result = filterSensitiveFormData(form);

      expect(result.dataset).toEqual(getDefaultAppForm().dataset);
      expect(result).not.toEqual(form);
    });
  });

  describe('getAppQGuideCustomURL', () => {
    it('should get custom URL from app detail', () => {
      const appDetail = {
        modules: [
          {
            flowNodeType: FlowNodeTypeEnum.systemConfig,
            inputs: [
              {
                key: NodeInputKeyEnum.chatInputGuide,
                value: {
                  customUrl: 'https://example.com'
                }
              }
            ]
          }
        ]
      } as AppSchema;

      const result = getAppQGuideCustomURL(appDetail);
      expect(result).toBe('https://example.com');
    });

    it('should return empty string if no custom URL', () => {
      const appDetail = {
        modules: [
          {
            flowNodeType: FlowNodeTypeEnum.systemConfig,
            inputs: [
              {
                key: NodeInputKeyEnum.chatInputGuide,
                value: {}
              }
            ]
          }
        ]
      } as AppSchema;

      const result = getAppQGuideCustomURL(appDetail);
      expect(result).toBe('');
    });
  });
});

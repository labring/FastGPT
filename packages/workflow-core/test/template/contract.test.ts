import { describe, expect, it } from 'vitest';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { getNodeContainerCheckError } from '@fastgpt/global/core/workflow/template/context';
import { getNodeRuntimeContract } from '../../src/template/contract';

describe('getNodeRuntimeContract', () => {
  const templates = [...moduleTemplatesFlat, CommentNode];

  it.each([true, false, undefined])(
    'derives new-node IO capabilities from fields with deprecated=%s',
    (deprecated) => {
      const contract = getNodeRuntimeContract({
        ...HttpNode468,
        flowNodeType: FlowNodeTypeEnum.customFeedback,
        inputs: [{ ...HttpNode468.inputs[0], deprecated }],
        outputs: [
          {
            id: 'branch',
            key: 'branch',
            type: FlowNodeOutputTypeEnum.source,
            deprecated
          },
          {
            id: NodeOutputKeyEnum.addOutputParam,
            key: NodeOutputKeyEnum.addOutputParam,
            type: FlowNodeOutputTypeEnum.dynamic,
            deprecated
          }
        ]
      });

      expect(contract.dynamicIO.inputs.manual).toBe(deprecated !== true);
      expect(contract.dynamicIO.outputs.manual).toBe(deprecated !== true);
      expect(contract.execution.sourceKinds.includes('sourceOutput')).toBe(deprecated !== true);
    }
  );

  it('keeps ordinary ports and tool targets aligned with every existing template', () => {
    for (const template of templates) {
      const { execution } = getNodeRuntimeContract(template);
      expect(execution.sourceKinds.includes('next'), `${template.flowNodeType} source`).toBe(
        template.showSourceHandle === true
      );
      expect(execution.targetKinds.includes('target'), `${template.flowNodeType} target`).toBe(
        template.showTargetHandle === true
      );
      expect(
        execution.targetKinds.includes('selectedTools'),
        `${template.flowNodeType} tool target`
      ).toBe(template.isTool === true);
    }
  });

  it('uses injected app capabilities without inventing ports omitted by the provider', () => {
    const template = moduleTemplatesFlat.find(
      (template) => template.flowNodeType === FlowNodeTypeEnum.appModule
    )!;
    expect(getNodeRuntimeContract(template).execution.targetKinds).toEqual([
      'target',
      'selectedTools'
    ]);
    expect(getNodeRuntimeContract({ ...template, isTool: false }).execution.targetKinds).toEqual([
      'target'
    ]);
    expect(
      getNodeRuntimeContract({
        ...template,
        isTool: false,
        showSourceHandle: undefined,
        showTargetHandle: undefined
      }).execution
    ).toMatchObject({ sourceKinds: [], targetKinds: [], terminal: true });
  });

  it('keeps container placement aligned with the existing Web rules', () => {
    for (const template of templates) {
      const { container } = getNodeRuntimeContract(template);
      for (const parentType of [
        FlowNodeTypeEnum.loop,
        FlowNodeTypeEnum.loopRun,
        FlowNodeTypeEnum.parallelRun
      ]) {
        const error = getNodeContainerCheckError({
          node: template,
          context: {
            isSidebar: true,
            sourceNodeId: null,
            sourceType: null,
            sourceIsTool: false,
            isConnectedTool: false,
            handleId: null,
            parentType,
            hasToolNode: true,
            hasLoopRunNode: true
          }
        });
        expect(
          container.allowedParentTypes.includes(parentType),
          `${template.flowNodeType} inside ${parentType}`
        ).toBe(error === undefined);
      }
    }
  });
});

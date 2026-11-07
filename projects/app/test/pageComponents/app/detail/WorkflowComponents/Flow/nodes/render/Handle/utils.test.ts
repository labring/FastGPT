import { describe, expect, it } from 'vitest';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getFoldedSourceHandleIds } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/utils';

const node: FlowNodeItemType = {
  id: 'node',
  nodeId: 'node',
  flowNodeType: FlowNodeTypeEnum.ifElseNode,
  name: 'Node',
  avatar: '',
  intro: '',
  inputs: [],
  outputs: []
};
const ids = (...keys: string[]) => keys.map((key) => getHandleId(node.nodeId, 'source', key));

describe('getFoldedSourceHandleIds', () => {
  it('retains every if/else branch, including legacy branch IDs and the else branch', () => {
    expect(
      getFoldedSourceHandleIds({
        ...node,
        inputs: [
          {
            key: NodeInputKeyEnum.ifElseList,
            label: '',
            renderTypeList: [],
            value: [{ branchId: 'a' }, { branchId: 'b' }, {}]
          }
        ]
      })
    ).toEqual(ids('a', 'b', 'ELSE IF 2', IfElseResultEnum.ELSE));
    expect(getFoldedSourceHandleIds(node)).toEqual(ids(IfElseResultEnum.ELSE));
  });

  it('retains option handles for classification, static selection and referenced selection', () => {
    for (const [flowNodeType, key] of [
      [FlowNodeTypeEnum.classifyQuestion, NodeInputKeyEnum.agents],
      [FlowNodeTypeEnum.userSelect, NodeInputKeyEnum.userSelectOptions]
    ] as const) {
      expect(
        getFoldedSourceHandleIds({
          ...node,
          flowNodeType,
          inputs: [{ key, label: '', renderTypeList: [], value: [{ key: 'a' }, { key: 'b' }] }]
        })
      ).toEqual(ids('a', 'b'));
      expect(getFoldedSourceHandleIds({ ...node, flowNodeType })).toEqual([]);
    }
    expect(
      getFoldedSourceHandleIds({
        ...node,
        flowNodeType: FlowNodeTypeEnum.userSelect,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            value: ['upstream', 'options']
          }
        ]
      })
    ).toEqual(ids(USER_SELECT_REFERENCE_HANDLE_KEY));
  });

  it('retains normal and catch handles and deduplicates visible output handles', () => {
    const output = {
      id: 'branch',
      key: 'branch',
      label: 'Branch',
      type: FlowNodeOutputTypeEnum.source
    };
    expect(
      getFoldedSourceHandleIds({
        ...node,
        flowNodeType: FlowNodeTypeEnum.toolCall,
        showSourceHandle: true,
        catchError: true,
        outputs: [
          output,
          output,
          { ...output, key: 'invalid', invalid: true },
          { ...output, key: 'unlabelled', label: '' },
          { ...output, key: 'value', type: FlowNodeOutputTypeEnum.static }
        ]
      })
    ).toEqual([...ids('right', 'branch'), getHandleId('node', 'source_catch', 'right')]);
  });
});

import { getHandleId, nodeInputIsReference } from '@fastgpt/global/common/workflow/reference';
import { getIfElseBranchHandleKey } from '@fastgpt/global/common/workflow/condition';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { Position } from 'reactflow';

/** 折叠只合并端口位置，保留所有业务端口 ID，避免折叠时已有分支或异常连线找不到端点。 */
export const getFoldedSourceHandleIds = (node: FlowNodeItemType) => {
  const { nodeId, inputs, outputs } = node;
  const keys: string[] = [];

  if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    const branches = inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList)?.value as
      | IfElseListItemType[]
      | undefined;
    keys.push(...(branches ?? []).map(getIfElseBranchHandleKey), IfElseResultEnum.ELSE);
  } else if (node.flowNodeType === FlowNodeTypeEnum.userSelect) {
    const input = inputs.find((input) => input.key === NodeInputKeyEnum.userSelectOptions);
    if (input && nodeInputIsReference(input)) {
      keys.push(USER_SELECT_REFERENCE_HANDLE_KEY);
    } else {
      keys.push(...(input?.value ?? []).map((option: { key: string }) => option.key));
    }
  } else if (node.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    const options = inputs.find((input) => input.key === NodeInputKeyEnum.agents)?.value;
    keys.push(...(options ?? []).map((option: { key: string }) => option.key));
  }

  if (node.showSourceHandle) keys.push(Position.Right);
  keys.push(
    ...outputs
      .filter(
        (output) =>
          output.type === FlowNodeOutputTypeEnum.source && output.label && output.invalid !== true
      )
      .map((output) => output.key)
  );

  const ids = keys.map((key) => getHandleId(nodeId, 'source', key));
  if (node.catchError) ids.push(getHandleId(nodeId, 'source_catch', Position.Right));
  return [...new Set(ids)];
};

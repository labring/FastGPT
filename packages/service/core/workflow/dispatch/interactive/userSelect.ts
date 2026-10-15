import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getHandleId, getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import type { UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ReferenceArrayValueType } from '@fastgpt/global/core/workflow/type/io';
import { resolveInteractiveDynamicOptions } from './dynamicOptions';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userSelectOptions]: UserSelectOptionItemType[] | ReferenceArrayValueType;
}>;
type UserSelectResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.selectResult]?: string;
}>;

export const dispatchUserSelect = async (props: Props): Promise<UserSelectResponse> => {
  const {
    histories,
    node,
    params: { description, userSelectOptions: rawOptions },
    query,
    lastInteractive,
    runtimeNodesMap,
    variableState,
    chatConfig
  } = props;
  const { nodeId, isEntry } = node;
  const optionInput = node.inputs.find((input) => input.key === NodeInputKeyEnum.userSelectOptions);
  const isReferenceMode =
    optionInput && getSelectedInputRenderType(optionInput) === FlowNodeInputTypeEnum.reference;
  const userSelectOptions = isReferenceMode
    ? resolveInteractiveDynamicOptions({
        references: rawOptions as ReferenceArrayValueType,
        runtimeNodesMap,
        variableState,
        variablesConfig: chatConfig?.variables
      }).map((value, index) => ({ key: `reference_${index}`, value }))
    : (rawOptions as UserSelectOptionItemType[]);

  // Interactive node is not the entry node, return interactive result
  if (!isEntry || lastInteractive?.type !== 'userSelect') {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userSelect',
        params: {
          description,
          userSelectOptions
        }
      }
    };
  }

  const { text: userSelectedVal } = chatValue2RuntimePrompt(query);

  // Error status
  if (userSelectedVal === undefined) {
    node.isEntry = false;
    return {
      [DispatchNodeResponseKeyEnum.skipHandleId]: isReferenceMode
        ? [getHandleId(nodeId, 'source', 'ref_default')]
        : userSelectOptions.map((item) => getHandleId(nodeId, 'source', item.key))
    };
  }

  const selectedOption = userSelectOptions.find((item) => item.value === userSelectedVal);
  if (!selectedOption) {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userSelect',
        params: {
          description,
          userSelectOptions
        }
      }
    };
  }

  node.isEntry = false;

  return {
    data: {
      [NodeOutputKeyEnum.selectResult]: selectedOption.value
    },
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2), // Removes the current session record as the history of subsequent nodes
    [DispatchNodeResponseKeyEnum.skipHandleId]: isReferenceMode
      ? []
      : userSelectOptions
          .filter((item) => item.value !== selectedOption.value)
          .map((item) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      userSelectResult: selectedOption.value
    },
    [DispatchNodeResponseKeyEnum.toolResponse]: selectedOption.value
  };
};

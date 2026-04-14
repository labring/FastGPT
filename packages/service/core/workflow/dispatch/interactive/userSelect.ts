import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type { UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userSelectOptions]: UserSelectOptionItemType[] | unknown[] | unknown;
}>;
type UserSelectResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.selectResult]?: string;
}>;

const referenceSourceHandleKey = 'ref_default';

const formatReferenceOptions = (options: unknown): UserSelectOptionItemType[] => {
  if (!Array.isArray(options)) return [];

  return options
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          key: `ref_${index}`,
          value: item
        };
      }

      if (typeof item === 'number' || typeof item === 'boolean') {
        return {
          key: `ref_${index}`,
          value: String(item)
        };
      }

      if (typeof item === 'object' && item !== null) {
        const record = item as Record<string, unknown>;
        const key = record.key ?? record.id ?? `ref_${index}`;
        const value = record.value ?? record.label ?? record.name;

        if (value !== undefined) {
          return {
            key: String(key),
            value: String(value)
          };
        }
      }

      return undefined;
    })
    .filter((item): item is UserSelectOptionItemType => !!item && !!item.value);
};

export const dispatchUserSelect = async (props: Props): Promise<UserSelectResponse> => {
  const {
    histories,
    node,
    params: { description, userSelectOptions: rawOptions },
    query,
    lastInteractive
  } = props;
  const { nodeId, isEntry, inputs } = node;

  const optionInput = inputs.find((input) => input.key === 'userSelectOptions');
  const isReferenceMode =
    optionInput?.renderTypeList?.[optionInput.selectedTypeIndex || 0] ===
    FlowNodeInputTypeEnum.reference;

  const userSelectOptions = isReferenceMode
    ? formatReferenceOptions(rawOptions)
    : Array.isArray(rawOptions)
      ? (rawOptions as UserSelectOptionItemType[])
      : [];

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

  node.isEntry = false;

  const { text: userSelectedVal } = chatValue2RuntimePrompt(query);

  // Error status
  if (userSelectedVal === undefined) {
    return {
      [DispatchNodeResponseKeyEnum.skipHandleId]: isReferenceMode
        ? [getHandleId(nodeId, 'source', referenceSourceHandleKey)]
        : userSelectOptions.map((item) => getHandleId(nodeId, 'source', item.key))
    };
  }

  return {
    data: {
      [NodeOutputKeyEnum.selectResult]: userSelectedVal
    },
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2),
    [DispatchNodeResponseKeyEnum.skipHandleId]: isReferenceMode
      ? []
      : userSelectOptions
          .filter((item) => item.value !== userSelectedVal)
          .map((item) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      userSelectResult: userSelectedVal
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: userSelectedVal
  };
};

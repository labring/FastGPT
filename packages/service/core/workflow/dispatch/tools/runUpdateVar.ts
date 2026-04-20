import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  getReferenceVariableValue,
  replaceEditorVariable
} from '@fastgpt/global/core/workflow/runtime/utils';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { type ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { runtimeSystemVar2StoreType } from '../utils';
import { isValidReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { getLogger, LogCategories } from '../../../../common/logger';

const addLog = getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH);

const isArrayValueType = (valueType?: WorkflowIOValueTypeEnum) =>
  typeof valueType === 'string' && valueType.startsWith('array');

const arrayElementType = (valueType?: WorkflowIOValueTypeEnum): WorkflowIOValueTypeEnum => {
  switch (valueType) {
    case WorkflowIOValueTypeEnum.arrayString:
      return WorkflowIOValueTypeEnum.string;
    case WorkflowIOValueTypeEnum.arrayNumber:
      return WorkflowIOValueTypeEnum.number;
    case WorkflowIOValueTypeEnum.arrayBoolean:
      return WorkflowIOValueTypeEnum.boolean;
    case WorkflowIOValueTypeEnum.arrayObject:
      return WorkflowIOValueTypeEnum.object;
    default:
      return WorkflowIOValueTypeEnum.any;
  }
};

const applyNumberOp = (
  oldValue: unknown,
  operator: Exclude<NonNullable<TUpdateListItem['numberOperator']>, '='>,
  input: unknown
) => {
  const a = Number(oldValue) || 0;
  const b = Number(input) || 0;
  switch (operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) {
        addLog.warn('[VariableUpdate] Divide by zero, keep old value', { oldValue });
        return oldValue;
      }
      return a / b;
  }
};

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.updateList]: TUpdateListItem[];
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchUpdateVariable = async (props: Props): Promise<Response> => {
  const {
    chatConfig,
    params,
    variables,
    runtimeNodesMap,
    workflowStreamResponse,
    externalProvider,
    runningAppInfo
  } = props;

  const { updateList } = params;
  const nodeIds = Array.from(runtimeNodesMap.keys());

  // 顺序执行：同一节点多条 update 依次写入，后一条读到前一条的新值
  const result = updateList.map((item) => {
    const variable = item.variable;

    if (!isValidReferenceValue(variable, nodeIds)) {
      return null;
    }

    const varNodeId = variable[0];
    const varKey = variable[1];

    if (!varKey) {
      return null;
    }

    const isInput = item.renderType === FlowNodeInputTypeEnum.input;
    const isArrayVar = isArrayValueType(item.valueType);
    const isArrayClear = isArrayVar && item.arrayMode === 'clear';
    const isArrayAppend = isArrayVar && item.arrayMode === 'append';

    // 读 oldValue（Number 公式 / Boolean negate / Array append 需要）
    const oldValue =
      varNodeId === VARIABLE_NODE_ID
        ? variables[varKey]
        : runtimeNodesMap.get(varNodeId)?.outputs?.find((o) => o.id === varKey)?.value;

    // 计算原始输入值（clear 分支无输入）
    const rawValue = (() => {
      if (isArrayClear) return undefined;

      if (isInput) {
        const val =
          typeof item.value?.[1] === 'string'
            ? replaceEditorVariable({
                text: item.value?.[1],
                nodesMap: runtimeNodesMap,
                variables
              })
            : item.value?.[1];

        // append 分支：用元素类型格式化单个输入值，避免被当成整个数组
        const formatType = isArrayAppend ? arrayElementType(item.valueType) : item.valueType;
        return valueTypeFormat(val, formatType);
      }

      // reference
      return getReferenceVariableValue({
        value: item.value!,
        variables,
        nodesMap: runtimeNodesMap
      });
    })();

    // 类型分派：新字段仅在 renderType === input 时生效（reference 残留字段一律忽略）
    let value: any = rawValue;

    if (
      isInput &&
      item.valueType === WorkflowIOValueTypeEnum.number &&
      item.numberOperator &&
      item.numberOperator !== '='
    ) {
      value = applyNumberOp(oldValue, item.numberOperator, rawValue);
    }

    if (isInput && item.valueType === WorkflowIOValueTypeEnum.boolean && item.booleanMode) {
      if (item.booleanMode === 'true') value = true;
      else if (item.booleanMode === 'false') value = false;
      else if (item.booleanMode === 'negate') value = !Boolean(oldValue);
    }

    // arrayMode 仅在 input 模式下生效：reference 模式下 rawValue 已是 referenced 整数组，直接替换
    if (isInput && isArrayVar) {
      const oldArr = Array.isArray(oldValue) ? oldValue : [];
      if (item.arrayMode === 'clear') {
        value = [];
      } else if (item.arrayMode === 'append') {
        value = [...oldArr, rawValue];
      }
      // equal / undefined: rawValue 已是整数组，直接替换
    }

    // 写回
    if (varNodeId === VARIABLE_NODE_ID) {
      variables[varKey] = value;
    } else {
      const node = runtimeNodesMap.get(varNodeId);
      node?.outputs?.find((output) => {
        if (output.id === varKey) {
          output.value = value;
          return true;
        }
      });
    }

    return value;
  });

  if (!runningAppInfo.isChildApp) {
    workflowStreamResponse?.({
      event: SseResponseEventEnum.updateVariables,
      data: runtimeSystemVar2StoreType({
        variables,
        removeObj: externalProvider.externalWorkflowVariables,
        userVariablesConfigs: chatConfig?.variables
      })
    });
  }

  return {
    [DispatchNodeResponseKeyEnum.newVariables]: variables,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      updateVarResult: result
    }
  };
};

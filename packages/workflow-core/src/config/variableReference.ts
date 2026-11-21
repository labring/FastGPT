import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { DatasetTagFilterValueModeEnum } from '@fastgpt/global/core/dataset/constants';
import { isDatasetTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { isReferenceOptionFormItem } from '@fastgpt/global/core/workflow/template/system/interactive/constants';
import { getSecretReferenceValue } from '@fastgpt/global/common/secret/utils';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import {
  getWorkflowReferenceValues,
  isWorkflowReferenceValue,
  type WorkflowReferenceValue
} from '../reference/service';

export type GlobalVariableReferenceMatch = {
  expectedValueType?: string;
};

export type GlobalVariableReferenceLocation = {
  node: WorkflowDocument['nodes'][number];
  inputKey: string;
  matches: GlobalVariableReferenceMatch[];
};

const FLOW_NODE_INPUT_TYPE_SET = new Set<string>(Object.values(FlowNodeInputTypeEnum));

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFlowNodeInputType = (value: unknown): value is FlowNodeInputTypeEnum =>
  typeof value === 'string' && FLOW_NODE_INPUT_TYPE_SET.has(value);

const isReferenceOptionListInputType = (
  value: unknown
): value is FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference =>
  value === FlowNodeInputTypeEnum.input || value === FlowNodeInputTypeEnum.reference;

const collectTupleMatches = ({
  references,
  key,
  expectedValueType
}: {
  references: WorkflowReferenceValue[] | undefined;
  key: string;
  expectedValueType?: string;
}): GlobalVariableReferenceMatch[] =>
  (references ?? []).flatMap((reference) =>
    reference[0] === VARIABLE_NODE_ID && reference[1] === key ? [{ expectedValueType }] : []
  );

/** 仅匹配显式全局变量命名空间 `{{$VARIABLE_NODE_ID.key$}}`，避免误伤普通模板或节点自有动态参数 `{{key}}`。 */
const collectTemplateMatches = ({
  text,
  key
}: {
  text: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  const placeholder = `{{$${VARIABLE_NODE_ID}.${key}$}}`;
  if (typeof text !== 'string' || !text.includes(placeholder)) return [];

  return [{}];
};

/** 知识库标签过滤同时支持整项引用元组、表单条件行内引用元组以及字符串插值。 */
const collectCollectionFilterMatches = ({
  value,
  key,
  expectedWholeValueType
}: {
  value: unknown;
  key: string;
  expectedWholeValueType?: string;
}): GlobalVariableReferenceMatch[] => {
  if (isWorkflowReferenceValue(value)) {
    return collectTupleMatches({
      references: [value],
      key,
      expectedValueType: expectedWholeValueType
    });
  }
  if (isDatasetTagFilterValue(value)) {
    return value.conditions.flatMap((condition) =>
      condition.valueMode === DatasetTagFilterValueModeEnum.reference &&
      isWorkflowReferenceValue(condition.value)
        ? collectTupleMatches({
            references: [condition.value],
            key
          })
        : []
    );
  }
  return collectTemplateMatches({
    text: value,
    key
  });
};

/** 凭据项可能以 `{ ref }` 对象或历史 JSON 字符串保存，复用共享凭据解析器提取引用。 */
const collectSecretValueMatches = ({
  value,
  key,
  expectedValueType
}: {
  value: unknown;
  key: string;
  expectedValueType?: string;
}): GlobalVariableReferenceMatch[] => {
  const parsedReference = getSecretReferenceValue(value);
  if (!parsedReference) return [];

  return collectTupleMatches({
    references: getWorkflowReferenceValues(parsedReference),
    key,
    expectedValueType
  });
};

const collectSecretRecordMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!isPlainRecord(value)) return [];
  return Object.values(value).flatMap((entryValue) =>
    collectSecretValueMatches({
      value: entryValue,
      key
    })
  );
};

/** 仅 manual 模式的系统工具密钥配置会在运行时解析 value 映射表中的凭据引用。 */
const collectSystemInputConfigMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!isPlainRecord(value) || value.type !== SystemToolSecretInputTypeEnum.manual) {
    return [];
  }
  return collectSecretRecordMatches({ value: value.value, key });
};

const collectSelectedToolSecretMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((toolItem) => {
    if (!isPlainRecord(toolItem) || !isPlainRecord(toolItem.config)) return [];
    return collectSystemInputConfigMatches({
      value: toolItem.config[NodeInputKeyEnum.systemInputConfig],
      key
    });
  });
};

const collectIfElseMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((branch) => {
    if (!isPlainRecord(branch) || !Array.isArray(branch.list)) return [];
    return branch.list.flatMap((condition) => {
      if (!isPlainRecord(condition)) return [];
      const leftMatches = isWorkflowReferenceValue(condition.variable)
        ? collectTupleMatches({ references: [condition.variable], key })
        : [];
      const rightMatches =
        condition.valueType === 'reference' && isWorkflowReferenceValue(condition.value)
          ? collectTupleMatches({ references: [condition.value], key })
          : [];
      return [...leftMatches, ...rightMatches];
    });
  });
};

const collectUpdateListMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];
    const itemValueType = typeof item.valueType === 'string' ? item.valueType : undefined;
    const targetMatches = isWorkflowReferenceValue(item.variable)
      ? collectTupleMatches({
          references: [item.variable],
          key,
          expectedValueType: itemValueType
        })
      : [];
    const sourceMatches = (() => {
      if (item.renderType === FlowNodeInputTypeEnum.reference) {
        return collectTupleMatches({
          references: getWorkflowReferenceValues(item.value),
          key,
          expectedValueType: itemValueType
        });
      } else if (
        item.renderType === FlowNodeInputTypeEnum.input &&
        Array.isArray(item.value) &&
        typeof item.value[1] === 'string'
      ) {
        return collectTemplateMatches({
          text: item.value[1],
          key
        });
      } else {
        return [];
      }
    })();
    return [...targetMatches, ...sourceMatches];
  });
};

const collectUserInputFormMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isPlainRecord(item) || !isFlowNodeInputType(item.type)) return [];
    const listInputType = isReferenceOptionListInputType(item.listInputType)
      ? item.listInputType
      : undefined;
    if (!isReferenceOptionFormItem({ type: item.type, listInputType })) return [];
    return collectTupleMatches({
      references: getWorkflowReferenceValues(item.listReference),
      key
    });
  });
};

const collectHttpPropsTemplateMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];
    return [
      ...collectTemplateMatches({
        text: item.key,
        key
      }),
      ...collectTemplateMatches({
        text: item.value,
        key
      })
    ];
  });
};

const collectToolConfigSecretLocations = ({
  node,
  key
}: {
  node: WorkflowDocument['nodes'][number];
  key: string;
}): GlobalVariableReferenceLocation[] => {
  const toolConfigEntries: ReadonlyArray<{ configKey: string; config: unknown }> = [
    { configKey: 'mcpToolSet', config: node.toolConfig?.mcpToolSet },
    { configKey: 'httpToolSet', config: node.toolConfig?.httpToolSet },
    { configKey: 'mcpTool', config: node.toolConfig?.mcpTool },
    { configKey: 'httpTool', config: node.toolConfig?.httpTool }
  ];

  return toolConfigEntries.flatMap(({ configKey, config }) => {
    if (!isPlainRecord(config)) return [];
    const locations: GlobalVariableReferenceLocation[] = [];
    const appendHeaderSecretLocation = (target: Record<string, unknown>, inputKey: string) => {
      if (!('headerSecret' in target)) return;
      const matches = collectSecretRecordMatches({ value: target.headerSecret, key });
      if (matches.length > 0) {
        locations.push({ node, inputKey, matches });
      }
    };

    // 1. 工具集或单工具顶层的 headerSecret
    appendHeaderSecretLocation(config, `toolConfig.${configKey}.headerSecret`);

    // 2. 工具集子项 toolList[*].headerSecret（与运行时及保存归一化规则对齐）
    if (Array.isArray(config.toolList)) {
      for (const [toolIndex, toolItem] of config.toolList.entries()) {
        if (!isPlainRecord(toolItem)) continue;
        appendHeaderSecretLocation(
          toolItem,
          `toolConfig.${configKey}.toolList[${toolIndex}].headerSecret`
        );
      }
    }

    return locations;
  });
};

/** 收集引用指定全局变量的节点输入与工具配置，与运行时各输入类型的引用解析规则对齐。 */
export const getGlobalVariableReferences = ({
  document,
  key
}: {
  document: WorkflowDocument;
  key: string;
}): GlobalVariableReferenceLocation[] =>
  document.nodes.flatMap((node) => {
    const inputLocations: GlobalVariableReferenceLocation[] = node.inputs.flatMap((input) => {
      const selectedRenderType = getSelectedInputRenderType(input);
      const matches = (() => {
        // 1. 普通引用模式（reference / settingDatasetQuotePrompt）：支持单引用元组或一层引用数组
        if (nodeInputIsReference(input)) {
          return collectTupleMatches({
            references: getWorkflowReferenceValues(input.value),
            key,
            expectedValueType: input.valueType
          });
        }
        // 2. 知识库标签过滤（collectionFilterMatch / datasetTagFilter）：支持顶层整项引用、条件行内引用及文本插值
        else if (
          input.key === NodeInputKeyEnum.collectionFilterMatch ||
          selectedRenderType === FlowNodeInputTypeEnum.datasetTagFilter
        ) {
          return collectCollectionFilterMatches({
            value: input.value,
            key,
            expectedWholeValueType: input.valueType
          });
        }
        // 3. 知识库聚合参数（datasetParams）：嵌套的 collectionFilterMatch 同样走标签过滤归一化器
        else if (input.key === NodeInputKeyEnum.datasetParams) {
          if (!isPlainRecord(input.value)) return [];
          return collectCollectionFilterMatches({
            value: input.value.collectionFilterMatch,
            key,
            expectedWholeValueType: WorkflowIOValueTypeEnum.string
          });
        }
        // 4. 条件判断节点（ifElseList）：分支条件左值 variable 及引用模式右值 value
        else if (input.key === NodeInputKeyEnum.ifElseList) {
          return collectIfElseMatches({ value: input.value, key });
        }
        // 5. 变量更新节点（updateList）：赋值目标 variable、引用模式来源 value 及输入模式文本插值
        else if (input.key === NodeInputKeyEnum.updateList) {
          return collectUpdateListMatches({ value: input.value, key });
        }
        // 6. 表单输入节点（userInputForms）：单选/多选字段在引用模式下的动态选项 listReference
        else if (input.key === NodeInputKeyEnum.userInputForms) {
          return collectUserInputFormMatches({ value: input.value, key });
        }
        // 7. 密码输入（password）：凭据包装对象 { ref }
        else if (selectedRenderType === FlowNodeInputTypeEnum.password) {
          return collectSecretValueMatches({
            value: input.value,
            key,
            expectedValueType: input.valueType
          });
        }
        // 8. HTTP 请求头密钥（headerSecret）：键值映射表中的各项凭据 { [header]: { ref } }
        else if (input.key === NodeInputKeyEnum.headerSecret) {
          return collectSecretRecordMatches({ value: input.value, key });
        }
        // 9. 系统工具密钥配置（systemInputConfig）：仅 manual 模式的 value 映射表会解析凭据引用
        else if (input.key === NodeInputKeyEnum.systemInputConfig) {
          return collectSystemInputConfigMatches({ value: input.value, key });
        }
        // 10. Agent 已选工具（selectedTools）：工具配置项内嵌套的 system_input_config 凭据引用
        else if (input.key === NodeInputKeyEnum.selectedTools) {
          return collectSelectedToolSecretMatches({ value: input.value, key });
        }
        // 11. HTTP 键值对数组输入（httpHeaders / httpParams / httpFormBody）：项内 key/value 的全局变量插值
        else if (
          input.key === NodeInputKeyEnum.httpHeaders ||
          input.key === NodeInputKeyEnum.httpParams ||
          input.key === NodeInputKeyEnum.httpFormBody
        ) {
          return collectHttpPropsTemplateMatches({ value: input.value, key });
        }
        // 12. 其他非引用模式输入：忽略与引用元组同形的普通字面量数组，仅识别字符串中的全局变量插值
        else {
          return collectTemplateMatches({
            text: input.value,
            key
          });
        }
      })();

      return matches.length > 0 ? [{ node, inputKey: input.key, matches }] : [];
    });

    const toolConfigLocations = collectToolConfigSecretLocations({ node, key });

    return [...inputLocations, ...toolConfigLocations];
  });

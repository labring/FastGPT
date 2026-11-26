import isEqual from 'lodash-es/isEqual';
import {
  ArrayTypeMap,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import type { extractCodeFromMarkdown } from './parser';

/** 保留请求期间新增、修改或删除的字段，避免异步生成结果覆盖用户编辑。 */
export const getConcurrentWorkflowFieldKeys = <T extends { key: string }>({
  requested,
  current
}: {
  requested: ReadonlyMap<string, T>;
  current: readonly T[];
}) => {
  const currentByKey = new Map(current.map((item) => [item.key, item]));
  const changedKeys = new Set(
    current.filter((item) => !isEqual(requested.get(item.key), item)).map((item) => item.key)
  );
  requested.forEach((_item, key) => {
    if (!currentByKey.has(key)) changedKeys.add(key);
  });
  return changedKeys;
};

/** 保留同名输入的已有绑定；有端口注解时才更新输入列表。 */
export const getCopilotUpdatedInputs = ({
  current,
  requested,
  result
}: {
  current: readonly DeepReadonly<FlowNodeInputItemType>[];
  requested: ReadonlyMap<string, DeepReadonly<FlowNodeInputItemType>>;
  result: Pick<ReturnType<typeof extractCodeFromMarkdown>, 'code' | 'inputs'>;
}) => {
  const { code, inputs } = result;
  const concurrentKeys = getConcurrentWorkflowFieldKeys({ requested, current });
  const generated = new Map(inputs.map((input) => [input.key, input]));
  const getReferenceValue = (reference?: string) => {
    const [nodeId, outputKey] = reference?.split('.') ?? [];
    if (nodeId && outputKey) return [nodeId, outputKey];
  };

  const retained = current.flatMap((input) => {
    if (input.key === NodeInputKeyEnum.code) return [{ ...input, value: code }];
    if (!requested.has(input.key) || concurrentKeys.has(input.key)) return [input];
    const next = generated.get(input.key);
    if (!next) return inputs.length > 0 ? [] : [input];
    const binding = getReferenceValue(next.reference);
    const valueType = next.type !== WorkflowIOValueTypeEnum.any ? next.type : input.valueType;
    return binding || valueType !== input.valueType
      ? [{ ...input, value: binding ?? input.value, valueType }]
      : [input];
  });
  const retainedKeys = new Set(retained.map((input) => input.key));

  for (const input of generated.values()) {
    if (retainedKeys.has(input.key) || concurrentKeys.has(input.key)) continue;
    retained.push({
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: input.type,
      canEdit: true,
      key: input.key,
      label: input.key,
      value: getReferenceValue(input.reference) ?? [],
      customInputConfig: {
        selectValueTypeList: Object.values(ArrayTypeMap),
        showDescription: false,
        showDefaultValue: true
      },
      required: true
    });
  }
  return retained;
};

/** 字段未变但请求期间连线有变，也要保留输出，避免异步结果断开新连线。 */
export const getConcurrentWorkflowOutputKeys = <T extends { key: string }>({
  requested,
  current,
  requestedConnections,
  currentConnections
}: {
  requested: ReadonlyMap<string, T>;
  current: readonly T[];
  requestedConnections: ReadonlyMap<string, string>;
  currentConnections: ReadonlyMap<string, string>;
}) => {
  const concurrentKeys = getConcurrentWorkflowFieldKeys({ requested, current });
  requestedConnections.forEach((connections, key) => {
    if (connections !== currentConnections.get(key)) concurrentKeys.add(key);
  });
  return concurrentKeys;
};

/** 只断开请求期间未变化且生成结果删除的出参连线。 */
export const getCopilotRemovedOutputKeys = <T extends { key: string }>({
  requested,
  current,
  generatedKeys,
  concurrentKeys = getConcurrentWorkflowFieldKeys({ requested, current })
}: {
  requested: ReadonlyMap<string, T>;
  current: readonly T[];
  generatedKeys: ReadonlySet<string>;
  concurrentKeys?: ReadonlySet<string>;
}) => {
  return current
    .filter(
      (output) =>
        requested.has(output.key) &&
        !concurrentKeys.has(output.key) &&
        !generatedKeys.has(output.key)
    )
    .map((output) => output.key);
};

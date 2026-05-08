import type { VariableItemType } from '@fastgpt/global/core/app/type';
import type { ChatFileStoreValue } from '@fastgpt/global/core/chat/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ChatDispatchProps,
  WorkflowVariableStateLike
} from '@fastgpt/global/core/workflow/runtime/type';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { encryptSecret } from '../../../../common/secret/aes256gcm';
import { anyValueDecrypt } from '../../../../common/secret/utils';
import { createChatFilePreviewUrlGetter } from '../../../../common/s3/sources/chat';
import {
  type ChatFileRuntimeValue,
  type ChatFileRuntimeValueItem,
  assertChatFileRuntimeValue,
  normalizeChatFileStoreValue
} from '../../../chat/fileStoreValue';

/**
 * 工作流全局变量状态管理器。
 *
 * 这里统一维护同一份变量的两种形态：
 * - storeValue：可持久化到数据库、可返回给前端继续编辑的值。
 * - runtimeValue：节点运行时直接消费的值，例如 file 变量会被转换成 string[] URL。
 *
 * 变量读取统一走 `get()`，变量更新统一走 `set()`，最终保存统一走 `toStoreRecord()`。
 *
 * 特殊变量处理也集中在这里：
 * - file：store 里保存 `{ key, name, type } | { url, name, type }`，runtime 里使用 URL 数组。
 * - password：store 里保存加密结构，runtime 里使用明文。
 * - runtimeOnly：系统变量、外部注入变量等只参与运行，不进入最终存储。
 *
 * child workflow 如果收到 parent 传下来的 file runtime URL，可以通过 `sourceVariableState`
 * 找回 parent 中的原始 file store metadata，避免把临时预览 URL 错写成外链。
 */
export type WorkflowVariableStateItem = {
  key: string;
  config?: VariableItemType;
  storeValue: unknown;
  runtimeValue: unknown;
  runtimeOnly?: boolean;
};

export type WorkflowVariableStateCreateProps = {
  // 系统级别变量，不需要额外加工
  timezone: string;
  runningAppInfo: ChatDispatchProps['runningAppInfo'];
  uid: ChatDispatchProps['uid'];
  chatId: ChatDispatchProps['chatId'];
  responseChatItemId?: ChatDispatchProps['responseChatItemId'];
  histories?: ChatDispatchProps['histories'];
  externalVariables?: Record<string, unknown>;
  // 运行时级别变量，不需要额外加工
  runtimeOnlyVariables?: Record<string, unknown>;

  // 全局变量配置
  variablesConfig?: ChatDispatchProps['chatConfig']['variables'];
  // 外部传入的变量，需要基于 variablesConfig 加工
  inputVariables?: Record<string, unknown>;
  // 源变量状态，用于复制变量状态
  sourceVariableState?: WorkflowVariableStateLike;
};

/** 根据变量配置从入参中取值，兼容 API label 入参与前端 key 入参。 */
const getVariableInputValue = ({
  variables,
  item
}: {
  variables: Record<string, unknown>;
  item: VariableItemType;
}) => {
  if (item.label && variables[item.label] !== undefined) return variables[item.label];
  if (variables[item.key] !== undefined) return variables[item.key];
  return item.defaultValue;
};

/** 将文件存储值转换为运行时 URL，并记录 URL 到 store metadata 的映射。 */
const fileStoreValuesToRuntimeUrls = async ({
  files,
  fileMetaMap,
  getPreviewUrl = createChatFilePreviewUrlGetter()
}: {
  files: ChatFileStoreValue[];
  fileMetaMap: Map<string, ChatFileStoreValue>;
  getPreviewUrl?: (key: string) => Promise<string>;
}) => {
  const urls = await Promise.all(
    files.map(async (file) => {
      if ('key' in file) {
        const url = await getPreviewUrl(file.key);
        fileMetaMap.set(url, file);
        return url;
      }

      fileMetaMap.set(file.url, file);
      return file.url;
    })
  );

  return urls.filter((url): url is string => typeof url === 'string' && !!url);
};

export class WorkflowVariableState implements WorkflowVariableStateLike {
  /**
   * 构造函数保持私有，外部必须通过 create 初始化。
   * 这样可以保证 file 预签名、password 解密、系统变量注入都在创建阶段完成。
   */
  private constructor(
    private readonly state: Map<string, WorkflowVariableStateItem>,
    private readonly fileMetaMap: Map<string, ChatFileStoreValue>,
    private readonly sourceVariableState?: WorkflowVariableStateLike
  ) {}

  /** 创建完整变量状态，包含用户全局变量、系统变量和运行时临时变量。 */
  static async create({
    timezone,
    runningAppInfo,
    uid,
    chatId,
    responseChatItemId,
    histories = [],
    variablesConfig = [],
    inputVariables = {},
    externalVariables = {},
    runtimeOnlyVariables = {},
    sourceVariableState
  }: WorkflowVariableStateCreateProps) {
    const state = new WorkflowVariableState(new Map(), new Map(), sourceVariableState);

    for (const item of variablesConfig) {
      const value = getVariableInputValue({ variables: inputVariables, item });
      await state.initConfiguredVariable(item, value);
    }

    state.setRuntimeOnlyVariables(externalVariables);
    state.setRuntimeOnlyVariables({
      userId: uid,
      appId: String(runningAppInfo.id),
      chatId,
      responseChatItemId,
      histories,
      cTime: getSystemTime(timezone)
    });
    state.setRuntimeOnlyVariables(runtimeOnlyVariables);

    return state;
  }

  /** 读取运行时值，节点执行、引用变量替换都应该读这个值。 */
  get(key: string) {
    return this.state.get(key)?.runtimeValue;
  }

  /** 读取可存储值，主要用于少量需要查看原始 store value 的内部逻辑。 */
  getStoreValue(key: string) {
    return this.state.get(key)?.storeValue;
  }

  /** 根据运行时 URL 找回文件 store metadata，child workflow 会向 parent state 递归查询。 */
  getFileStoreValueByRuntimeUrl(url: string) {
    return (
      this.fileMetaMap.get(url) || this.sourceVariableState?.getFileStoreValueByRuntimeUrl(url)
    );
  }

  /** 更新变量值，并按变量类型同步刷新 storeValue 与 runtimeValue。 */
  async set(key: string, value: unknown) {
    const item = this.state.get(key);
    const config = item?.config;

    if (item?.runtimeOnly) {
      this.state.set(key, {
        ...item,
        runtimeValue: value
      });
      return value;
    }

    if (config?.type === VariableInputEnum.file) {
      const val = value as ChatFileRuntimeValue;
      const storeValue = this.runtimeFileValueToStoreValue(assertChatFileRuntimeValue(val));
      const runtimeValue = await fileStoreValuesToRuntimeUrls({
        files: storeValue,
        fileMetaMap: this.fileMetaMap
      });
      this.state.set(key, {
        key,
        config,
        storeValue,
        runtimeValue
      });
      return runtimeValue;
    }

    if (config?.type === VariableInputEnum.password && typeof value === 'string') {
      const storeValue = {
        value: '',
        secret: encryptSecret(value)
      };
      this.state.set(key, {
        key,
        config,
        storeValue,
        runtimeValue: value
      });
      return value;
    }

    const runtimeValue = valueTypeFormat(value, config?.valueType);
    this.state.set(key, {
      key,
      config,
      storeValue: runtimeValue,
      runtimeValue
    });
    return runtimeValue;
  }

  /** 输出节点运行可直接消费的变量记录，包含 runtimeOnly 变量。 */
  toRuntimeRecord() {
    return Array.from(this.state.values()).reduce<Record<string, unknown>>((acc, item) => {
      acc[item.key] = item.runtimeValue;
      return acc;
    }, {});
  }

  /** 输出最终可持久化变量记录，不包含 runtimeOnly 变量。 */
  toStoreRecord() {
    return Array.from(this.state.values()).reduce<Record<string, unknown>>((acc, item) => {
      if (!item.runtimeOnly) {
        acc[item.key] = item.storeValue;
      }
      return acc;
    }, {});
  }

  /** 克隆当前状态，主要用于子运行/分支运行时隔离运行态修改。 */
  clone() {
    return new WorkflowVariableState(
      new Map(
        Array.from(this.state.entries()).map(([key, item]) => [
          key,
          {
            ...item
          }
        ])
      ),
      new Map(this.fileMetaMap),
      this.sourceVariableState
    );
  }

  /** 根据变量配置初始化单个用户变量，并完成特殊类型的 store/runtime 转换。 */
  private async initConfiguredVariable(config: VariableItemType, value: unknown) {
    if (config.type === VariableInputEnum.file) {
      const storeValue = Array.isArray(value)
        ? this.runtimeFileValueToStoreValue(
            assertChatFileRuntimeValue(value as ChatFileRuntimeValueItem[])
          )
        : [];
      const runtimeValue = await fileStoreValuesToRuntimeUrls({
        files: storeValue,
        fileMetaMap: this.fileMetaMap
      });
      this.state.set(config.key, {
        key: config.key,
        config,
        storeValue,
        runtimeValue
      });
      return;
    }

    if (config.type === VariableInputEnum.password) {
      const runtimeValue = anyValueDecrypt(value);
      const storeValue =
        typeof runtimeValue === 'string'
          ? {
              value: '',
              secret: encryptSecret(runtimeValue)
            }
          : value;

      this.state.set(config.key, {
        key: config.key,
        config,
        storeValue,
        runtimeValue
      });
      return;
    }

    const runtimeValue = valueTypeFormat(value, config.valueType);
    this.state.set(config.key, {
      key: config.key,
      config,
      storeValue: runtimeValue,
      runtimeValue
    });
  }

  /** 注入只参与运行、不进入存储的变量。 */
  private setRuntimeOnlyVariables(variables: Record<string, unknown>) {
    Object.entries(variables).forEach(([key, value]) => {
      if (value === undefined) return;
      this.state.set(key, {
        key,
        storeValue: undefined,
        runtimeValue: value,
        runtimeOnly: true
      });
    });
  }

  /** 将 file runtime 值转回 store 值，优先复用已知 URL 对应的原始 metadata。 */
  private runtimeFileValueToStoreValue(value: ChatFileRuntimeValue): ChatFileStoreValue[] {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          if (!item || item.startsWith('data:')) return;
          const knownFile = this.getFileStoreValueByRuntimeUrl(item);
          if (knownFile) return knownFile;
          return normalizeChatFileStoreValue({ url: item });
        }

        return normalizeChatFileStoreValue(item);
      })
      .filter((file): file is ChatFileStoreValue => Boolean(file));
  }
}

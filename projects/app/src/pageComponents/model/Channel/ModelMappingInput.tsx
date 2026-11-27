import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { MyDeleteIconButton } from '@fastgpt/web/components/common/Icon/button';
import MySelect, { type SelectProps } from '@fastgpt/web/components/common/MySelect';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

export type ModelMappingRow = {
  id: string;
  key: string;
  value: string;
};

export type ModelMappingValidationState = {
  hasDuplicateKey: boolean;
  duplicateKeys: string[];
};

export type ModelMappingInputProps = {
  value?: Record<string, string>;
  modelOptions: SelectProps<string>['list'];
  getModelAvatar?: (modelName: string) => string;
  inputHeight?: string;
  onChange?: (value: Record<string, string>) => void;
  /** 重复键校验状态变化回调，供提交时二次兜底拦截 */
  onValidationChange?: (state: ModelMappingValidationState) => void;
};

/** 将模型映射对象转换为带稳定行 ID 的可编辑列表。 */
export const recordToMappingRows = (
  record?: Record<string, string>,
  createId: () => string = getNanoid
): ModelMappingRow[] => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return [];
  }

  return Object.entries(record).map(([key, value]) => ({
    id: createId(),
    key,
    value: typeof value === 'string' ? value : String(value ?? '')
  }));
};

/** 统计去除首尾空白后的非空模型名出现次数。 */
export const getMappingKeyCounts = (rows: Pick<ModelMappingRow, 'key'>[]): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const trimmedKey = row.key.trim();
    if (!trimmedKey) continue;
    counts.set(trimmedKey, (counts.get(trimmedKey) ?? 0) + 1);
  }

  return counts;
};

/** 找出去除首尾空白后重复出现的非空模型名集合。 */
export const getDuplicateMappingKeys = (rows: Pick<ModelMappingRow, 'key'>[]): Set<string> => {
  const duplicates = new Set<string>();
  for (const [key, count] of getMappingKeyCounts(rows).entries()) {
    if (count > 1) {
      duplicates.add(key);
    }
  }
  return duplicates;
};

/** 将映射行序列化为普通对象，忽略空键行并对键值去首尾空白。 */
export const mappingRowsToRecord = (
  rows: Pick<ModelMappingRow, 'key' | 'value'>[]
): Record<string, string> => {
  const entries: [string, string][] = [];

  for (const row of rows) {
    const trimmedKey = row.key.trim();
    if (!trimmedKey) continue;
    entries.push([trimmedKey, row.value.trim()]);
  }

  return Object.fromEntries(entries);
};

/** 浅比较两个字符串键值对象是否等价，未定义按空对象处理。 */
export const areMappingRecordsEqual = (
  left?: Record<string, string>,
  right?: Record<string, string>
): boolean => {
  const a = left ?? {};
  const b = right ?? {};
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
};

/**
 * 渠道模型映射输入组件：左侧为当前渠道已选模型的单列下拉选择（自动排除其他行已选模型，
 * 保留不在候选中的历史键展示），右侧为上游目标模型 ID 输入框。
 */
const ModelMappingInput = ({
  value,
  modelOptions,
  getModelAvatar,
  inputHeight,
  onChange,
  onValidationChange
}: ModelMappingInputProps) => {
  const { t } = useSafeTranslation();
  const normalizedValue = useMemo(() => value ?? {}, [value]);

  const [rows, setRows] = useState<ModelMappingRow[]>(() => recordToMappingRows(normalizedValue));
  const lastEmittedRef = useRef<Record<string, string>>(normalizedValue);
  const onValidationChangeRef = useRef(onValidationChange);

  useEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  }, [onValidationChange]);

  // 仅当外部 value 与最近一次本地输出不一致时重同步，避免编辑空行草稿被清空。
  useEffect(() => {
    if (areMappingRecordsEqual(normalizedValue, lastEmittedRef.current)) {
      return;
    }
    lastEmittedRef.current = normalizedValue;
    setRows(recordToMappingRows(normalizedValue));
    onValidationChangeRef.current?.({
      hasDuplicateKey: false,
      duplicateKeys: []
    });
  }, [normalizedValue]);

  const keyCounts = useMemo(() => getMappingKeyCounts(rows), [rows]);
  const optionValueSet = useMemo(
    () => new Set(modelOptions.map((item) => item.value)),
    [modelOptions]
  );

  const commitRows = (nextRows: ModelMappingRow[]) => {
    setRows(nextRows);

    const nextDuplicateKeys = getDuplicateMappingKeys(nextRows);
    const hasDuplicateKey = nextDuplicateKeys.size > 0;
    onValidationChange?.({
      hasDuplicateKey,
      duplicateKeys: Array.from(nextDuplicateKeys)
    });

    // 存在重复键时不向外部写入覆盖后的对象，等待提交拦截或用户修正。
    if (hasDuplicateKey) return;

    const nextRecord = mappingRowsToRecord(nextRows);
    if (!areMappingRecordsEqual(nextRecord, lastEmittedRef.current)) {
      lastEmittedRef.current = nextRecord;
      onChange?.(nextRecord);
    }
  };

  const handleAddRow = () => {
    commitRows([...rows, { id: getNanoid(), key: '', value: '' }]);
  };

  const handleUpdateRow = (id: string, field: 'key' | 'value', nextVal: string) => {
    commitRows(rows.map((row) => (row.id === id ? { ...row, [field]: nextVal } : row)));
  };

  const handleDeleteRow = (id: string) => {
    commitRows(rows.filter((row) => row.id !== id));
  };

  return (
    <Box>
      {rows.length > 0 && (
        <Flex direction="column" gap={2}>
          {rows.map((row) => {
            const trimmedKey = row.key.trim();
            const hasUnlistedKey = row.key !== '' && !optionValueSet.has(row.key);
            // 过滤已被其他行占用的模型，当前行自身已选值保持可见。
            const rowOptions = modelOptions.filter((option) => {
              const optionKey = option.value.trim();
              return optionKey === trimmedKey || (keyCounts.get(optionKey) ?? 0) === 0;
            });

            return (
              <Flex key={row.id} alignItems="center" gap={2}>
                <Box flex="1 1 0" minW={0}>
                  <MySelect<string>
                    w="100%"
                    h={inputHeight}
                    value={row.key || undefined}
                    valueLabel={
                      hasUnlistedKey ? (
                        <Flex alignItems="center" minW={0}>
                          <MyAvatar
                            mr={2}
                            src={getModelAvatar?.(row.key) || HUGGING_FACE_ICON}
                            w="1rem"
                            flexShrink={0}
                          />
                          <Box noOfLines={1}>{row.key}</Box>
                        </Flex>
                      ) : undefined
                    }
                    list={rowOptions}
                    placeholder={t('config_model:mapping_key_placeholder')}
                    onChange={(val) => handleUpdateRow(row.id, 'key', val)}
                  />
                </Box>
                <Input
                  flex="1 1 0"
                  minW={0}
                  h={inputHeight}
                  value={row.value}
                  placeholder={t('config_model:mapping_value_placeholder')}
                  onChange={(e) => handleUpdateRow(row.id, 'value', e.target.value)}
                />
                <MyDeleteIconButton
                  tip={t('common:Delete')}
                  aria-label={t('common:Delete')}
                  size="16px"
                  flexShrink={0}
                  onClick={() => handleDeleteRow(row.id)}
                />
              </Flex>
            );
          })}
        </Flex>
      )}

      <Button
        mt={rows.length > 0 ? 2 : 0}
        w="full"
        variant="whiteBase"
        size="sm"
        leftIcon={<MyIcon name="common/addLight" w="14px" />}
        onClick={handleAddRow}
      >
        {t('config_model:mapping_add_row')}
      </Button>
    </Box>
  );
};

export default React.memo(ModelMappingInput);

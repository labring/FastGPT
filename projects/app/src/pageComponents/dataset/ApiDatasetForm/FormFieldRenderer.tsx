import React, { useMemo, useCallback } from 'react';
import { Flex, Input, Button, Box, Select } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { PluginFormFieldConfig } from '@fastgpt/global/core/dataset/apiDataset/type';

type FormFieldRendererProps = {
  field: PluginFormFieldConfig;
  value: any;
  onChange: (value: any) => void;

  onOpenTreeSelect?: () => void;
  treeSelectLoading?: boolean;
  treeSelectDisplayValue?: string;
  canOpenTreeSelect?: boolean;
};

const FormFieldRenderer = ({
  field,
  value,
  onChange,
  onOpenTreeSelect,
  treeSelectLoading,
  treeSelectDisplayValue,
  canOpenTreeSelect = true
}: FormFieldRendererProps) => {
  const { i18n, t } = useTranslation();
  const lang = i18n.language;

  // 解析 i18n 字符串
  const label = useMemo(() => parseI18nString(field.label, lang), [field.label, lang]);
  const placeholder = useMemo(
    () => parseI18nString(field.placeholder, lang),
    [field.placeholder, lang]
  );
  const description = useMemo(
    () => parseI18nString(field.description, lang),
    [field.description, lang]
  );

  // 渲染 input 类型
  const renderInput = useCallback(() => {
    return (
      <Input
        bg={'myWhite.600'}
        placeholder={placeholder || label}
        maxLength={200}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }, [value, placeholder, label, onChange]);

  // 渲染 password 类型
  const renderPassword = useCallback(() => {
    return (
      <Input
        bg={'myWhite.600'}
        type="password"
        placeholder={placeholder || label}
        maxLength={200}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }, [value, placeholder, label, onChange]);

  // 渲染 select 类型
  const renderSelect = useCallback(() => {
    const options = field.options || [];
    return (
      <Select
        bg={'myWhite.600'}
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {parseI18nString(option.label, lang)}
          </option>
        ))}
      </Select>
    );
  }, [field.options, value, placeholder, lang, t, onChange]);

  // 渲染 tree-select 类型
  const renderTreeSelect = useCallback(() => {
    return (
      <Flex flex={1} alignItems="center">
        <MyBox py={1} fontSize={'sm'} flex={'1 0 0'} overflow="auto" isLoading={treeSelectLoading}>
          {treeSelectDisplayValue || t('dataset:rootdirectory')}
        </MyBox>
        <Button
          ml={2}
          variant={'whiteBase'}
          onClick={onOpenTreeSelect}
          isDisabled={!canOpenTreeSelect}
        >
          {t('dataset:selectDirectory')}
        </Button>
      </Flex>
    );
  }, [treeSelectLoading, treeSelectDisplayValue, canOpenTreeSelect, onOpenTreeSelect, t]);

  // 根据类型渲染字段
  const renderField = useCallback(() => {
    const renderers = {
      input: renderInput,
      password: renderPassword,
      select: renderSelect,
      'tree-select': renderTreeSelect
    };

    return (renderers[field.type] ?? renderInput)();
  }, [field.type, renderInput, renderPassword, renderSelect, renderTreeSelect]);

  return (
    <Flex mt={6} alignItems={'center'}>
      <FormLabel flex={['', '0 0 110px']} fontSize={'sm'} required={field.required}>
        {label}
      </FormLabel>
      <Box flex={1}>{renderField()}</Box>
      {description && field.type !== 'tree-select' && (
        <Box ml={2} fontSize="xs" color="myGray.500">
          {description}
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(FormFieldRenderer);

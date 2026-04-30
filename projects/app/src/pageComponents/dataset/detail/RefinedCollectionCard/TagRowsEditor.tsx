import React from 'react';
import {
  Box,
  Button,
  HStack,
  Input,
  NumberInput,
  NumberInputField,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MySelect from '@fastgpt/web/components/common/MySelect';
import DateTimePicker from '@fastgpt/web/components/common/DateTimePicker';
import { utcTsToDisplayDate, displayDateToUtcTs } from '@fastgpt/global/common/string/time';

export type TagEditorRow = {
  tagId: string;
  value: string;
};

export type TagRowsEditorProps = {
  rows: TagEditorRow[];
  allTagOptions: { label: string; value: string; tagType?: string; isDisabled?: boolean }[];
  onAddRow: () => void;
  onUpdateRow: (index: number, field: 'tagId' | 'value', val: string) => void;
  onRemoveRow: (index: number) => void;
  selectFooter?: (closeMenu: () => void) => React.ReactNode;
};

const ValueInput = ({
  tagType,
  value,
  onChange
}: {
  tagType: string;
  value: string;
  onChange: (v: string) => void;
}) => {
  const { t } = useTranslation();
  if (tagType === 'number') {
    return (
      <NumberInput flex={1} value={value} onChange={(v) => onChange(v)} min={undefined}>
        <NumberInputField h="34px" bg="white" placeholder={t('dataset:tag.tag_value_number')} />
      </NumberInput>
    );
  }
  if (tagType === 'datetime') {
    const ts = Number(value);
    const dateValue = !isNaN(ts) && ts > 0 ? utcTsToDisplayDate(ts) : null;
    return (
      <Box flex={1}>
        <DateTimePicker
          h="34px"
          value={dateValue}
          onChange={(date) => onChange(date ? String(displayDateToUtcTs(date)) : '')}
        />
      </Box>
    );
  }
  return (
    <Input
      flex={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('dataset:tag.tag_value')}
    />
  );
};

const TagRowsEditor = ({
  rows,
  allTagOptions,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  selectFooter
}: TagRowsEditorProps) => {
  const { t } = useTranslation();

  return (
    <Box>
      {rows.length > 0 && (
        <VStack spacing={1} mb={1} alignItems="stretch">
          {rows.map((row, index) => {
            const selectedTagIds = new Set(
              rows
                .filter((_, i) => i !== index)
                .map((r) => r.tagId)
                .filter(Boolean)
            );
            const rowOptions = allTagOptions.map((opt) => ({
              ...opt,
              isDisabled: opt.isDisabled || selectedTagIds.has(opt.value)
            }));
            const selectedOption = allTagOptions.find((opt) => opt.value === row.tagId);
            const tagType = selectedOption?.tagType || 'string';
            return (
              <HStack key={index} spacing={1} h="34px">
                <MySelect
                  flex={1}
                  minW="140px"
                  h="34px"
                  value={row.tagId}
                  list={rowOptions}
                  onChange={(val) => {
                    onUpdateRow(index, 'tagId', val);
                    onUpdateRow(index, 'value', '');
                  }}
                  footer={selectFooter}
                />
                <ValueInput
                  tagType={tagType}
                  value={row.value}
                  onChange={(v) => onUpdateRow(index, 'value', v)}
                />
                <MyIconButton
                  icon="delete"
                  hoverColor="red.500"
                  hoverBg="red.50"
                  onClick={() => onRemoveRow(index)}
                />
              </HStack>
            );
          })}
        </VStack>
      )}
      <Button
        variant="link"
        py={2}
        onClick={onAddRow}
        leftIcon={<MyIcon name="common/addLight" w="16px" color="#1770E6" mt="2px" />}
        iconSpacing="4px"
        fontSize="12px"
        color="#156AD9"
        fontWeight="normal"
        alignSelf="flex-start"
      >
        {t('dataset:tag.add_tag')}
      </Button>
    </Box>
  );
};

export default TagRowsEditor;

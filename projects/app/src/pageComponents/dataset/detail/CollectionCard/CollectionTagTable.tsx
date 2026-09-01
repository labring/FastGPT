import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { type DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { TagActionButton, TagTableContainer, TagTableHeader } from './TagCommon';
import { TagNameSelect, TagValueField } from './TagValueInputs';
import { SET_TAG_TABLE_COLUMNS, unusedTagSelectOptions, type CollectionTagRow } from './tagForm';

type CollectionTagTableProps<T extends CollectionTagRow> = {
  rows: T[];
  tags: DatasetTagType[];
  onTagChange: (rowId: string, tagId: string) => void;
  onValueChange: (rowId: string, value: string | number | string[]) => void;
  onDeleteRow: (rowId: string) => void;
  onManage: () => void;
  onCreateOption?: (tagId: string, option: string) => void;
  /** 批量场景在标签值下方预留固定 16px，避免选类型时行高抖动。 */
  renderValueExtra?: (row: T, tag?: DatasetTagType) => React.ReactNode;
  valueFieldProps?: {
    disabledPlaceholder?: string;
    numberShowStepper?: boolean;
    numberPlaceholder?: string;
    arrayPlaceholder?: string;
  };
};

/** 设置标签 / 批量添加共用的标签表，行高只由是否预留 extra 槽决定，不随当前类型变化。 */
export const CollectionTagTable = <T extends CollectionTagRow>({
  rows,
  tags,
  onTagChange,
  onValueChange,
  onDeleteRow,
  onManage,
  onCreateOption,
  renderValueExtra,
  valueFieldProps
}: CollectionTagTableProps<T>) => {
  const { t } = useTranslation();
  const hasExtraSlot = Boolean(renderValueExtra);
  const rowH = hasExtraSlot ? '96px' : '80px';

  return (
    <TagTableContainer>
      <TagTableHeader columns={SET_TAG_TABLE_COLUMNS}>
        <Box px={6}>{t('dataset:tag.name')}</Box>
        <Box px={6}>{t('dataset:tag.value')}</Box>
        <Box px={6}>{t('common:Operation')}</Box>
      </TagTableHeader>

      <Box
        flex={'1 1 auto'}
        minH={0}
        overflowY={'auto'}
        display={'flex'}
        flexDirection={'column'}
        fontSize={'sm'}
        lineHeight={'20px'}
        color={'myGray.600'}
      >
        {rows.length === 0 ? (
          <EmptyTip text={t('dataset:dataset.no_tags')} />
        ) : (
          rows.map((row) => {
            const selectedTag = tags.find((tag) => String(tag._id) === row.tagId);

            return (
              <Box
                key={row.id}
                display={'grid'}
                gridTemplateColumns={SET_TAG_TABLE_COLUMNS}
                alignItems={hasExtraSlot ? 'flex-start' : 'center'}
                h={rowH}
                flexShrink={0}
                pt={hasExtraSlot ? '16px' : 0}
                borderBottom={'1px solid'}
                borderColor={'myGray.150'}
              >
                <Box px={6} minW={0}>
                  <TagNameSelect
                    value={row.tagId}
                    options={unusedTagSelectOptions(tags, rows, row.id)}
                    onChange={(newTagId) => onTagChange(row.id, newTagId)}
                    onManage={onManage}
                  />
                </Box>

                <Flex px={6} minW={0} direction={'column'} gap={'10px'} alignItems={'flex-end'}>
                  <Box w={'100%'}>
                    <TagValueField
                      tag={selectedTag}
                      value={row.value}
                      onChange={(val) => onValueChange(row.id, val)}
                      onCreateOption={(option) => {
                        if (!selectedTag) return;
                        onCreateOption?.(String(selectedTag._id), option);
                      }}
                      {...valueFieldProps}
                    />
                  </Box>
                  {hasExtraSlot && (
                    <Flex
                      h={'16px'}
                      alignItems={'center'}
                      justifyContent={'flex-end'}
                      flexShrink={0}
                    >
                      {renderValueExtra?.(row, selectedTag)}
                    </Flex>
                  )}
                </Flex>

                <Flex px={6} alignItems={hasExtraSlot ? 'flex-start' : 'center'}>
                  <TagActionButton
                    label={t('common:Delete')}
                    icon={<MyIcon name={'delete'} w={'16px'} h={'16px'} />}
                    hoverColor={'red.600'}
                    onClick={() => onDeleteRow(row.id)}
                  />
                </Flex>
              </Box>
            );
          })
        )}
      </Box>
    </TagTableContainer>
  );
};

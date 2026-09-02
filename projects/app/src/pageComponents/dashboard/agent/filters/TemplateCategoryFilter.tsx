import React, { useEffect, useMemo } from 'react';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  FilterButton,
  FILTER_LIST_H,
  filterListScrollSx,
  filterPopoverProps,
  stopFilterListWheel,
  useFilterTriggerWidth
} from '@fastgpt/web/components/common/TagFilter';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import {
  defaultTemplateMarketFilter,
  getCreatorFilterSummary,
  sanitizeCreatorTmbIds,
  type TemplateMarketFilterType
} from './utils';

type Props = {
  tags: TemplateTypeSchemaType[];
  value: TemplateMarketFilterType;
  onChange: (next: TemplateMarketFilterType) => void;
};

/**
 * 模板市场分类筛选：交互跟创建者一样，下拉里没有搜索，选项一列。
 * 「全部」是独立项，不会把所有分类勾上。
 */
const TemplateCategoryFilter = ({ tags, value, onChange }: Props) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  useEffect(() => {
    if (value.mode !== 'selected' || value.tagIds.length === 0) return;
    if (tags.length === 0) return;
    const nextIds = sanitizeCreatorTmbIds(
      value.tagIds,
      tags.map((item) => item.typeId)
    );
    if (nextIds.length === value.tagIds.length) return;
    onChange(
      nextIds.length === 0 ? { ...defaultTemplateMarketFilter } : { ...value, tagIds: nextIds }
    );
  }, [onChange, tags, value]);

  const members = useMemo(
    () =>
      tags.map((tag) => ({
        tmbId: tag.typeId,
        memberName: t(tag.typeName as any)
      })),
    [t, tags]
  );
  const labels = useMemo(
    () => ({
      all: t('app:type.All'),
      createdByMe: '',
      unselected: t('app:list_filter.unselected')
    }),
    [t]
  );
  const summary = getCreatorFilterSummary({
    mode: value.mode,
    tmbIds: value.tagIds,
    members,
    labels
  });
  const selectedSet = useMemo(() => new Set(value.tagIds), [value.tagIds]);
  const { triggerRef, triggerWidth } = useFilterTriggerWidth(summary.text);

  const triggerValue = (
    <Flex alignItems={'center'} gap={1} minW={0} maxW={'100%'}>
      <Box
        minW={0}
        overflow={'hidden'}
        textOverflow={'ellipsis'}
        whiteSpace={'nowrap'}
        {...(summary.chip ? { px: 1, py: '2px', bg: 'myGray.100', borderRadius: 'xs' } : {})}
      >
        {summary.text}
      </Box>
      {summary.extraCount > 0 && (
        <Box
          flexShrink={0}
          px={1}
          py={'2px'}
          bg={'myGray.100'}
          borderRadius={'full'}
          whiteSpace={'nowrap'}
        >
          +{summary.extraCount}
        </Box>
      )}
    </Flex>
  );

  return (
    <MyPopover
      {...filterPopoverProps}
      w={triggerWidth ? `${triggerWidth}px` : 'max-content'}
      minW={'160px'}
      maxW={'200px'}
      Trigger={
        <FilterButton
          ref={triggerRef}
          title={t('app:list_filter.category')}
          value={triggerValue}
          maxW={'200px'}
        />
      }
    >
      {() => (
        <Box p={'6px'} w={'100%'} onClick={(e) => e.stopPropagation()}>
          <Flex direction={'column'} gap={'4px'}>
            <Flex
              alignItems={'center'}
              px={1}
              py={'6px'}
              cursor={'pointer'}
              borderRadius={'xs'}
              bg={value.mode === 'all' ? 'myGray.05' : 'transparent'}
              color={value.mode === 'all' ? 'primary.700' : 'myGray.600'}
              fontSize={'xs'}
              fontWeight={'medium'}
              _hover={{ bg: 'myGray.05' }}
              onClick={() => onChange({ ...defaultTemplateMarketFilter })}
            >
              {labels.all}
            </Flex>
            <Box h={'1px'} bg={'myGray.200'} />
            <Box
              h={'auto'}
              maxH={FILTER_LIST_H}
              overflowY={'auto'}
              sx={filterListScrollSx}
              onWheel={stopFilterListWheel}
            >
              {tags.map((tag) => {
                const checked = value.mode === 'selected' && selectedSet.has(tag.typeId);
                return (
                  <Flex
                    key={tag.typeId}
                    alignItems={'center'}
                    gap={2}
                    w={'100%'}
                    px={1}
                    py={'6px'}
                    cursor={'pointer'}
                    borderRadius={'xs'}
                    fontSize={'xs'}
                    _hover={{ bg: 'myGray.05' }}
                    onClick={() => {
                      const nextIds = checked
                        ? value.tagIds.filter((id) => id !== tag.typeId)
                        : [...value.tagIds, tag.typeId];
                      onChange({
                        mode: 'selected',
                        tagIds: nextIds
                      });
                    }}
                  >
                    <Checkbox
                      isChecked={checked}
                      pointerEvents={'none'}
                      size={'sm'}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                    />
                    <Box
                      minW={0}
                      overflow={'hidden'}
                      textOverflow={'ellipsis'}
                      whiteSpace={'nowrap'}
                      fontWeight={'medium'}
                      color={'myGray.600'}
                    >
                      {t(tag.typeName as any)}
                    </Box>
                  </Flex>
                );
              })}
            </Box>
            {!!feConfigs.appTemplateCourse && (
              <>
                <Box h={'1px'} bg={'myGray.200'} />
                <Flex
                  alignItems={'center'}
                  px={1}
                  py={'6px'}
                  cursor={'pointer'}
                  borderRadius={'xs'}
                  color={'myGray.600'}
                  fontSize={'xs'}
                  fontWeight={'medium'}
                  _hover={{ bg: 'myGray.05' }}
                  onClick={() => window.open(feConfigs.appTemplateCourse)}
                >
                  {t('common:contribute_app_template')}
                </Flex>
              </>
            )}
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
};

export default React.memo(TemplateCategoryFilter);

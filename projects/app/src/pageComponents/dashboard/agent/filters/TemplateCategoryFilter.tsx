import React, { useEffect, useMemo } from 'react';
import { Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  MultiSelectFilter,
  syncSelectedFilterValues,
  useCommonFilterLabels
} from '@fastgpt/web/components/common/TagFilter';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { defaultTemplateMarketFilter, type TemplateMarketFilterType } from './utils';

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
  const labels = useCommonFilterLabels();

  useEffect(() => {
    if (tags.length === 0) return;
    const next = syncSelectedFilterValues(
      { mode: value.mode, values: value.tagIds },
      tags.map((item) => item.typeId)
    );
    if (!next) return;
    onChange({ mode: next.mode, tagIds: next.values });
  }, [onChange, tags, value]);

  const options = useMemo(
    () =>
      tags.map((tag) => ({
        value: tag.typeId,
        label: t(tag.typeName as any)
      })),
    [t, tags]
  );

  return (
    <MultiSelectFilter
      title={t('app:list_filter.category')}
      value={{ mode: value.mode, values: value.tagIds }}
      onChange={(next) => onChange({ mode: next.mode, tagIds: next.values })}
      options={options}
      labels={labels}
      footer={
        feConfigs.appTemplateCourse ? (
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
        ) : undefined
      }
    />
  );
};

export default React.memo(TemplateCategoryFilter);

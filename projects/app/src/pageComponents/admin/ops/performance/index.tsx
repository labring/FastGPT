'use client';
import React, { useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import DatasetSearchPerf from './DatasetSearchPerf';

export type OpsPerformanceTab = 'datasetSearch';

/**
 * 管理员「运维看板 → 性能分析」页内 Tab 壳层。
 * 遵循管理员后台两级侧栏 + 页内 Tab 规范，当前提供「知识库搜索性能」，
 * 后续新增工作流、模型推理、沙箱等性能域只需扩展 Tab 项即可。
 */
export default function OpsPerformancePage(): JSX.Element {
  const { t } = useSafeTranslation();
  const [currentTab, setCurrentTab] = useState<OpsPerformanceTab>('datasetSearch');

  return (
    <BoxPageRoot
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      minH={0}
      overflow={'hidden'}
      p={0}
    >
      <Flex
        flexShrink={0}
        px={[4, 6]}
        pt={[4, 5]}
        pb={3}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
        alignItems={'center'}
        justifyContent={'space-between'}
        gap={4}
        flexWrap={'wrap'}
      >
        <FillRowTabs<OpsPerformanceTab>
          list={[
            {
              label: t('admin:ops_perf_tab_dataset_search'),
              value: 'datasetSearch'
            }
          ]}
          py={1.5}
          value={currentTab}
          onChange={setCurrentTab}
        />
      </Flex>

      <Box
        flex={'1 1 0'}
        minH={0}
        overflowY={'auto'}
        overflowX={'hidden'}
        px={[4, 6]}
        py={[4, 5]}
        bg={'myGray.25'}
      >
        {currentTab === 'datasetSearch' && <DatasetSearchPerf />}
      </Box>
    </BoxPageRoot>
  );
}

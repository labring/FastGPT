import React from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import FolderPath from '@/components/common/folder/Path';

const EvaluationTaskDetail = () => {
  const { t } = useTranslation();
  const router = useRouter();

  // 路径导航
  const paths = [{ parentId: 'current', parentName: 'taskName' }];

  return (
    <Box h={'100%'} bg={'myGray.05'} flexDirection={'column'} overflow={'hidden'}>
      {/* 顶部导航栏 */}
      <Flex
        alignItems={'center'}
        bg={'white'}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
        px={6}
        py={3}
      >
        {/* 路径导航 */}
        <Flex py={'0.38rem'} px={2} h={10}>
          <FolderPath
            rootName={t('dashboard_evaluation:evaluation_tasks')}
            paths={paths}
            onClick={() => {
              router.push(`/dashboard/evaluation?evaluationTab=tasks`);
            }}
          />
        </Flex>
      </Flex>
    </Box>
  );
};

export default EvaluationTaskDetail;

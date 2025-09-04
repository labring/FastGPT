import React from 'react';
import { useTranslation } from 'next-i18next';
import { Flex, useTheme } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetDetailPageContext } from '@/web/core/evaluation/context/datasetDetailPageContext';
import FolderPath from '@/components/common/folder/Path';

const NavBar = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { paths } = useContextSelector(DatasetDetailPageContext, (v) => v);

  return (
    <Flex
      pb={2}
      pt={3}
      px={4}
      justify={'space-between'}
      borderBottom={theme.borders.base}
      borderColor={'myGray.200'}
      position={'relative'}
    >
      <FolderPath
        paths={paths}
        rootName={t('dashboard_evaluation:evaluation_dataset')}
        onClick={() => {
          router.push(`/dashboard/evaluation?evaluationTab=datasets`);
        }}
      />
    </Flex>
  );
};

export default NavBar;

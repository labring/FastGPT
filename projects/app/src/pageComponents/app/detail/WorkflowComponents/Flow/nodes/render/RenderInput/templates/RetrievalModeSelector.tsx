import React from 'react';
import { Box } from '@chakra-ui/react';
import SfRadio from '@/components/SF/SfRadio';
import { useTranslation } from 'next-i18next';
import { DatasetRetrievalModeEnum } from '@fastgpt/global/core/dataset/constants';

type RetrievalModeSelectorProps = {
  value: `${DatasetRetrievalModeEnum}`;
  onChange: (value: `${DatasetRetrievalModeEnum}`) => void;
};

const RetrievalModeSelector = ({ value, onChange }: RetrievalModeSelectorProps) => {
  const { t } = useTranslation();
  const modeList = [
    {
      value: DatasetRetrievalModeEnum.standard,
      title: t('app:retrieval_mode_single')
    },
    {
      value: DatasetRetrievalModeEnum.agentic,
      title: t('app:retrieval_mode_multiple')
    }
  ];

  return (
    <Box>
      <SfRadio
        list={modeList}
        value={value}
        onChange={(v: any) => onChange(v as `${DatasetRetrievalModeEnum}`)}
      />
    </Box>
  );
};

export default RetrievalModeSelector;

import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import SfRadio from '@/components/SF/SfRadio';
import { useTranslation } from 'next-i18next';
import { DatasetRetrievalModeEnum } from '@fastgpt/global/core/dataset/constants';

type RetrievalModeSelectorProps = {
  value: `${DatasetRetrievalModeEnum}`;
  onChange: (value: `${DatasetRetrievalModeEnum}`) => void;
  onConfigClick: (mode: `${DatasetRetrievalModeEnum}`) => void;
};

const RetrievalModeSelector = ({ value, onChange, onConfigClick }: RetrievalModeSelectorProps) => {
  const { t } = useTranslation();
  const modeList = [
    {
      value: DatasetRetrievalModeEnum.standard,
      title: (
        <Flex alignItems="center" justifyContent="space-between" w="100%">
          <Box>{t('app:retrieval_mode_single')}</Box>
          <MyIcon
            name="common/settingLight"
            w="16px"
            cursor="pointer"
            onClick={(e) => {
              e.stopPropagation();
              onChange(DatasetRetrievalModeEnum.standard);
              onConfigClick(DatasetRetrievalModeEnum.standard);
            }}
          />
        </Flex>
      )
    },
    {
      value: DatasetRetrievalModeEnum.agentic,
      title: (
        <Flex alignItems="center" justifyContent="space-between" w="100%">
          <Box>{t('app:retrieval_mode_multiple')}</Box>
          <MyIcon
            name="common/settingLight"
            w="16px"
            cursor="pointer"
            onClick={(e) => {
              e.stopPropagation();
              onChange(DatasetRetrievalModeEnum.agentic);
              onConfigClick(DatasetRetrievalModeEnum.agentic);
            }}
          />
        </Flex>
      )
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

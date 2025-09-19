import React, { useState } from 'react';
import { Box, Flex, Text, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyIcon from '@fastgpt/web/components/common/Icon';
import GradientBorderBox from './GradientBorderBox';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { getBuiltinDimensionInfo } from '@/web/core/evaluation/utils';

interface EvaluationSummaryData {
  metricName: string;
  metricScore: number;
  threshold: number;
  summaryStatus: string;
  customSummary?: string;
  errorReason?: string;
}

interface EvaluationSummaryCardProps {
  data: EvaluationSummaryData[];
}

const EvaluationSummaryCard: React.FC<EvaluationSummaryCardProps> = ({ data }) => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const renderSummaryContent = (item: EvaluationSummaryData) => {
    switch (item.summaryStatus) {
      case SummaryStatusEnum.completed:
        return (
          <Text fontSize="12px" color="myGray.600" lineHeight="1.5">
            {item.customSummary}
          </Text>
        );
      case SummaryStatusEnum.failed:
        return (
          <Box>
            <Text fontSize="12px" color="red.500" mb={1}>
              {t('总结内容生成异常，点击重试')}
            </Text>
            <Text fontSize="12px" color="red.500">
              {t('报错信息：')}
              {item.errorReason}
            </Text>
          </Box>
        );
      case SummaryStatusEnum.pending:
        return (
          <Flex align="center" justify="center" gap="4px">
            <MyIcon name="gradientLoading" w="16px" h="16px" />
            <Text fontSize="12px" bgGradient="linear(to-b, #a1D580FF, #6b40E0D0)" bgClip="text">
              {t('总结内容待生成')}
            </Text>
          </Flex>
        );
      case SummaryStatusEnum.generating:
        return (
          <Flex align="center" justify="center" gap="4px">
            <MyIcon name="gradientLoading" w="16px" h="16px" />
            <Text fontSize="12px" bgGradient="linear(to-b, #a1D580FF, #6b40E0D0)" bgClip="text">
              {t('总结内容生成中')}
            </Text>
          </Flex>
        );
      default:
        return null;
    }
  };

  const renderSingleDimension = (item: EvaluationSummaryData, index: number) => {
    const dimensionInfo = getBuiltinDimensionInfo(item.metricName);
    const dimensionName = t(dimensionInfo?.name) || item.metricName;
    const isExpected = item.metricScore >= item.threshold;
    const title = `${dimensionName}${isExpected ? t('符合预期！') : t('低于预期分数！')}`;

    return (
      <Box key={index}>
        <Flex align="center" mb={1}>
          <MyImage src="/imgs/avatar/summaryAvatar.svg" alt="summary avatar" w="40px" h="40px" />
          <Text fontSize="14px" fontWeight="medium" color="myGray.900">
            {title}
          </Text>
        </Flex>
        {renderSummaryContent(item)}
      </Box>
    );
  };

  if (data.length === 0) {
    return null;
  }

  // 单个维度场景
  if (data.length === 1) {
    return <GradientBorderBox>{renderSingleDimension(data[0], 0)}</GradientBorderBox>;
  }

  // 两个维度场景
  if (data.length === 2) {
    return (
      <GradientBorderBox>
        {renderSingleDimension(data[0], 0)}
        <Box
          my={3}
          height="1px"
          background="linear-gradient(270deg, #A0D8FF 5%, rgba(213, 128, 255, 0.6322) 56%, rgba(64, 224, 208, 0.4178) 97%)"
        />
        {renderSingleDimension(data[1], 1)}
      </GradientBorderBox>
    );
  }

  // 三个及以上维度场景 - 轮播模式
  return (
    <GradientBorderBox>
      {renderSingleDimension(data[currentIndex], currentIndex)}

      <Flex justify="center" align="center" mt={6} gap={4}>
        <IconButton
          aria-label="Previous"
          icon={<ChevronLeftIcon />}
          size="sm"
          variant="ghost"
          isDisabled={currentIndex === 0}
          onClick={handlePrevious}
          color={currentIndex === 0 ? 'myGray.300' : 'myGray.600'}
        />

        <Text fontSize="14px" color="myGray.600">
          {currentIndex + 1}/{data.length}
        </Text>

        <IconButton
          aria-label="Next"
          icon={<ChevronRightIcon />}
          size="sm"
          variant="ghost"
          isDisabled={currentIndex === data.length - 1}
          onClick={handleNext}
          color={currentIndex === data.length - 1 ? 'myGray.300' : 'myGray.600'}
        />
      </Flex>
    </GradientBorderBox>
  );
};

export default EvaluationSummaryCard;

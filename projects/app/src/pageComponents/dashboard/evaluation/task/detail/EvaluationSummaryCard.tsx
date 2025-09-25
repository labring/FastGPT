import React, { useState, useCallback } from 'react';
import { Box, Flex, Text, IconButton, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyIcon from '@fastgpt/web/components/common/Icon';
import GradientBorderBox from './GradientBorderBox';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { getBuiltinDimensionInfo } from '@/web/core/evaluation/utils';
import type { EvaluationSummaryResponse } from '@fastgpt/global/core/evaluation/summary/api';

interface EvaluationSummaryCardProps {
  data: EvaluationSummaryResponse['data'];
  onRetryGeneration?: (metricIds: string[]) => Promise<void>;
}

const EvaluationSummaryCard: React.FC<EvaluationSummaryCardProps> = ({
  data,
  onRetryGeneration
}) => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(data.length - 1, prev + 1));
  }, [data.length]);

  const handleRetryGeneration = useCallback(
    async (item: EvaluationSummaryResponse['data'][0]) => {
      if (!item.metricId || !onRetryGeneration) return;

      await onRetryGeneration([item.metricId]);
    },
    [onRetryGeneration]
  );

  const renderSummaryContent = useCallback(
    (item: EvaluationSummaryResponse['data'][0]) => {
      const { summaryStatus, customSummary, errorReason } = item;

      if (summaryStatus === SummaryStatusEnum.completed) {
        return (
          <Text fontSize="12px" color="myGray.600" lineHeight="1.5">
            {customSummary}
          </Text>
        );
      }

      if (summaryStatus === SummaryStatusEnum.failed) {
        return (
          <Box>
            <Text fontSize="12px" color="red.500" mb={1}>
              {t('dashboard_evaluation:summary_generation_error')}
              <Link
                color="red.500"
                textDecoration="underline"
                _hover={{ color: 'red.600' }}
                onClick={() => handleRetryGeneration(item)}
                ml={1}
              >
                {t('dashboard_evaluation:click_to_retry')}
              </Link>
            </Text>
            <Text fontSize="12px" color="red.500">
              {t('dashboard_evaluation:error_message_prefix')}
              {errorReason}
            </Text>
          </Box>
        );
      }

      if (
        summaryStatus === SummaryStatusEnum.pending ||
        summaryStatus === SummaryStatusEnum.generating
      ) {
        const statusText =
          summaryStatus === SummaryStatusEnum.pending
            ? t('dashboard_evaluation:summary_pending_generation')
            : t('dashboard_evaluation:summary_generating_content');

        return (
          <Flex align="center" justify="center" gap="4px">
            <MyIcon name="gradientLoading" w="16px" h="16px" />
            <Text fontSize="12px" bgGradient="linear(to-b, #a1D580FF, #6b40E0D0)" bgClip="text">
              {statusText}
            </Text>
          </Flex>
        );
      }

      return null;
    },
    [t, handleRetryGeneration]
  );

  const renderSingleDimension = useCallback(
    (item: EvaluationSummaryResponse['data'][0], index: number) => {
      const dimensionInfo = getBuiltinDimensionInfo(item.metricName);
      const dimensionName = t(dimensionInfo?.name) || item.metricName;
      const isExpected = item.metricScore >= item.threshold;
      const expectationText = isExpected
        ? t('dashboard_evaluation:meets_expectation')
        : t('dashboard_evaluation:below_expectation');
      const title = `${dimensionName}${expectationText}`;

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
    },
    [t, renderSummaryContent]
  );

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
          icon={<MyIcon name="common/leftArrowLight" w={3} h={3} />}
          size="sm"
          variant="ghost"
          isDisabled={currentIndex === 0}
          onClick={handlePrevious}
          color={currentIndex === 0 ? 'myGray.300' : 'myGray.500'}
        />

        <Text fontSize="14px">
          <Text as="span" color="blue.600">
            {currentIndex + 1}
          </Text>
          <Text as="span" color="myGray.600">
            /{data.length}
          </Text>
        </Text>

        <IconButton
          aria-label="Next"
          icon={<MyIcon name="common/rightArrow" w={3} h={3} />}
          size="sm"
          variant="ghost"
          isDisabled={currentIndex === data.length - 1}
          onClick={handleNext}
          color={currentIndex === data.length - 1 ? 'myGray.300' : 'myGray.500'}
        />
      </Flex>
    </GradientBorderBox>
  );
};

export default EvaluationSummaryCard;

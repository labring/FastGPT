import React, { useState, useMemo, useCallback } from 'react';
import { Box, Flex, Collapse, HStack, IconButton, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import UserBox from '@fastgpt/web/components/common/UserBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import format from 'date-fns/format';
import type { EvaluationDisplayType } from '@fastgpt/global/core/evaluation/type';
import type { AppDetailType } from '@fastgpt/global/core/app/type.d';

interface BasicInfoProps {
  evaluationDetail: EvaluationDisplayType | null;
  appDetail: AppDetailType | null;
}

const BasicInfo: React.FC<BasicInfoProps> = ({ evaluationDetail, appDetail }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // 跳转到应用详情页的处理函数
  const handleAppDetailClick = useCallback(() => {
    if (evaluationDetail?.target?.config?.appId) {
      window.open(`/app/detail?appId=${evaluationDetail.target.config.appId}`, '_blank');
    }
  }, [evaluationDetail?.target?.config?.appId]);

  // 格式化时间的辅助函数
  const formatTime = useMemo(() => {
    return (time: Date | string | undefined) => {
      if (!time) return '-';
      try {
        if (typeof time === 'string' && time.includes('-') && !time.includes('T')) {
          return time;
        }
        return format(new Date(time), 'yyyy-MM-dd HH:mm:ss');
      } catch (error) {
        return '-';
      }
    };
  }, []);

  // 安全获取值的辅助函数
  const safeValue = (value: string | undefined | null) => {
    return value && value.trim() ? value : '-';
  };

  return (
    <Box>
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        mb={4}
        cursor={'pointer'}
        onClick={toggleExpanded}
      >
        <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.900'}>
          {t('dashboard_evaluation:basic_info')}
        </Box>
        <IconButton
          aria-label="toggle"
          size={'sm'}
          variant={'ghost'}
          icon={
            <MyIcon
              name={isExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
              w={4}
              color={'myGray.600'}
            />
          }
        />
      </Flex>

      {/* 可折叠的内容区域 */}
      <Collapse in={isExpanded} animateOpacity>
        <Box fontSize={'12px'} color={'myGray.600'} lineHeight={'16px'}>
          <Flex alignItems={'center'} mb={4}>
            <Box minW={'80px'} mr={4} color={'myGray.500'}>
              {t('dashboard_evaluation:application')}
            </Box>
            <HStack spacing={2}>
              <Avatar
                src={evaluationDetail?.target?.config?.avatar}
                borderRadius={'sm'}
                w={'1.5rem'}
              />
              {appDetail?.permission?.hasWritePer ? (
                <Link
                  onClick={handleAppDetailClick}
                  color={'blue.600'}
                  textDecoration={'underline'}
                  _hover={{ color: 'blue.700' }}
                  cursor={'pointer'}
                >
                  {safeValue(evaluationDetail?.target?.config?.appName)}
                </Link>
              ) : (
                <Box color={'myGray.600'}>
                  {safeValue(evaluationDetail?.target?.config?.appName)}
                </Box>
              )}
            </HStack>
          </Flex>

          <Flex alignItems={'center'} mb={4}>
            <Box minW={'80px'} mr={4} color={'myGray.500'}>
              {t('dashboard_evaluation:version')}
            </Box>
            <Box color={'myGray.600'}>
              {safeValue(evaluationDetail?.target?.config?.versionName)}
            </Box>
          </Flex>

          <Flex alignItems={'center'} mb={4}>
            <Box minW={'80px'} mr={4} color={'myGray.500'}>
              {t('dashboard_evaluation:evaluation_dataset_name')}
            </Box>
            <Box color={'myGray.600'}>{safeValue(evaluationDetail?.evalDatasetCollectionName)}</Box>
          </Flex>

          <Flex alignItems={'center'} mb={4}>
            <Box minW={'80px'} mr={4} color={'myGray.500'}>
              {t('dashboard_evaluation:start_time')}
            </Box>
            <Box color={'myGray.600'}>{formatTime(evaluationDetail?.createTime)}</Box>
          </Flex>

          {evaluationDetail?.finishTime && (
            <Flex alignItems={'center'} mb={4}>
              <Box minW={'80px'} mr={4} color={'myGray.500'}>
                {t('dashboard_evaluation:end_time')}
              </Box>
              <Box color={'myGray.600'}>{formatTime(evaluationDetail.finishTime)}</Box>
            </Flex>
          )}

          <Flex alignItems={'center'}>
            <Box minW={'80px'} mr={4} color={'myGray.500'}>
              {t('dashboard_evaluation:executor_name')}
            </Box>
            {evaluationDetail?.sourceMember ? (
              <UserBox
                sourceMember={{
                  avatar: evaluationDetail.sourceMember.avatar,
                  name: evaluationDetail.sourceMember.name,
                  status: 'active'
                }}
                fontSize="12px"
                spacing={1}
              />
            ) : (
              <Box color={'myGray.600'}>-</Box>
            )}
          </Flex>
        </Box>
      </Collapse>
    </Box>
  );
};

export default BasicInfo;

import React, { useMemo, useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Button, Flex, HStack, Text, Textarea } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postAdminCheckModeration } from '@/web/core/plugin/admin/moderation/api';
import type { RawModerationCheckResponseType } from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';
import { formatModerationLabel } from '@fastgpt/global/core/plugin/moderation/constants';
import {
  extractContentSnippet,
  renderHighlightedModerationContent
} from '@/web/core/plugin/admin/moderation/highlight';

type ModerationTestCardProps = {
  activePlugin?: AdminModerationPluginItemType;
};

const ModerationTestCard: React.FC<ModerationTestCardProps> = ({ activePlugin }) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [testResult, setTestResult] = useState<RawModerationCheckResponseType | null>(null);
  const [isDetailCardClosed, setIsDetailCardClosed] = useState(false);

  const { runAsync: handleRunTest, loading: runningTest } = useRequest(
    async () => {
      if (!activePlugin) {
        toast({
          status: 'warning',
          title: t('admin:moderation.select_active_service_first')
        });
        return;
      }
      if (!content.trim()) {
        toast({
          status: 'warning',
          title: t('admin:moderation.enter_test_content')
        });
        return;
      }

      const res = await postAdminCheckModeration({
        pluginId: activePlugin.pluginId,
        input: { content: content.trim() }
      });

      setTestResult(res);
      setIsDetailCardClosed(false);
    },
    {
      manual: true,
      errorToast: t('admin:moderation.test_failed')
    }
  );

  const handleClear = () => {
    setContent('');
    setTestResult(null);
    setIsDetailCardClosed(false);
  };

  // 平铺提取命中标签、关键词与异常信息
  const flatDetail = useMemo(() => {
    if (!testResult || testResult.verdict === 'pass') return null;

    const hitLabels = Array.from(
      new Set(
        (testResult.hits ?? [])
          .map((hit) => {
            const labelName = formatModerationLabel(hit.label, t);
            if (hit.score !== undefined && !Number.isNaN(hit.score)) {
              return `${labelName}（${Number(hit.score.toFixed(2))}）`;
            }
            return labelName;
          })
          .filter(Boolean)
      )
    );

    const allKeywords = Array.from(
      new Set([
        ...(testResult.keywords ?? []),
        ...(testResult.hits ?? []).flatMap((h) => h.keywords ?? [])
      ])
    ).filter(Boolean);

    // 没有任何标签、关键词、送审内容或异常时，不渲染详情卡片
    if (
      hitLabels.length === 0 &&
      allKeywords.length === 0 &&
      !content.trim() &&
      !testResult.errorMessage
    ) {
      return null;
    }

    return {
      hitLabels,
      allKeywords,
      errorMessage: testResult.errorMessage
    };
  }, [testResult, content, t]);

  const renderVerdictTag = (verdict?: string) => {
    if (verdict === 'pass') {
      return (
        <Flex
          alignItems={'center'}
          px={3}
          h={'36px'}
          borderRadius={'md'}
          bg={'green.50'}
          border={'1px solid'}
          borderColor={'green.200'}
          color={'green.600'}
          fontSize={'xs'}
          fontWeight={'medium'}
          gap={1.5}
        >
          <MyIcon name="checkCircle" w={'14px'} color={'green.600'} />
          <Text>{t('admin:moderation.verdict_pass')}</Text>
        </Flex>
      );
    }
    if (verdict === 'block') {
      return (
        <Flex
          alignItems={'center'}
          px={3}
          h={'36px'}
          borderRadius={'md'}
          bg={'red.50'}
          border={'1px solid'}
          borderColor={'red.200'}
          color={'red.600'}
          fontSize={'xs'}
          fontWeight={'medium'}
          gap={1.5}
        >
          <MyIcon name="common/errorFill" w={'14px'} color={'red.600'} />
          <Text>{t('admin:moderation.verdict_block')}</Text>
        </Flex>
      );
    }
    if (verdict === 'suspected') {
      return (
        <Flex
          alignItems={'center'}
          px={3}
          h={'36px'}
          borderRadius={'md'}
          bg={'yellow.50'}
          border={'1px solid'}
          borderColor={'yellow.200'}
          color={'yellow.700'}
          fontSize={'xs'}
          fontWeight={'medium'}
          gap={1.5}
        >
          <MyIcon name="common/errorFill" w={'14px'} color={'yellow.600'} />
          <Text>{t('admin:moderation.verdict_suspected')}</Text>
        </Flex>
      );
    }
    if (verdict === 'error') {
      return (
        <Flex
          alignItems={'center'}
          px={3}
          h={'36px'}
          borderRadius={'md'}
          bg={'myGray.100'}
          border={'1px solid'}
          borderColor={'myGray.300'}
          color={'myGray.700'}
          fontSize={'xs'}
          fontWeight={'medium'}
          gap={1.5}
        >
          <MyIcon name="common/errorFill" w={'14px'} color={'myGray.600'} />
          <Text>{t('admin:moderation.verdict_error')}</Text>
        </Flex>
      );
    }
    return null;
  };

  return (
    <Box>
      <Flex flexDirection={'column'}>
        <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'} mb={2}>
          {t('admin:moderation.test_input_label')}
        </Text>

        <Textarea
          h={'172px'}
          placeholder={t('admin:moderation.test_input_placeholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          bg={'white'}
          borderRadius={'md'}
          borderColor={'myGray.200'}
          _focus={{ borderColor: 'primary.500', bg: 'white' }}
          fontSize={'sm'}
          resize={'none'}
        />

        {/* 底部操作与结果标签行 */}
        <Flex alignItems={'center'} justifyContent={'space-between'} mt={2}>
          {/* 左侧：审核结果标签 */}
          <Box minH={'36px'}>{testResult && renderVerdictTag(testResult.verdict)}</Box>

          {/* 右侧：操作按钮 */}
          <HStack spacing={2}>
            <Button
              size={'md'}
              h={'36px'}
              minW={'57px'}
              px={3}
              variant={'whiteBase'}
              onClick={handleClear}
              isDisabled={runningTest || (!content && !testResult)}
            >
              {t('admin:moderation.clear')}
            </Button>
            <Button
              size={'md'}
              h={'36px'}
              minW={'85px'}
              px={3}
              onClick={handleRunTest}
              isLoading={runningTest}
              isDisabled={!activePlugin || !content.trim()}
            >
              {t('admin:moderation.start_test')}
            </Button>
          </HStack>
        </Flex>

        {/* 违规详情卡片：平铺展示命中标签、关键词与内容详情 */}
        {testResult && testResult.verdict !== 'pass' && !isDetailCardClosed && flatDetail && (
          <Box
            w={'100%'}
            p={3.5}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            bg={'myGray.50'}
            position={'relative'}
            mt={3}
          >
            {/* 右上角关闭按钮 */}
            <Box
              position={'absolute'}
              top={3}
              right={3}
              cursor={'pointer'}
              color={'myGray.500'}
              _hover={{ color: 'myGray.800' }}
              onClick={() => setIsDetailCardClosed(true)}
              title={t('admin:moderation.close_detail')}
            >
              <MyIcon name="common/closeLight" w={'14px'} />
            </Box>

            <Flex flexDirection={'column'} gap={2.5} pr={6}>
              {/* 命中标签 */}
              {flatDetail.hitLabels.length > 0 && (
                <Flex fontSize={'xs'} lineHeight={'1.5'}>
                  <Text w={'80px'} color={'myGray.600'} flexShrink={0} fontWeight={'medium'}>
                    {t('admin:moderation.hit_labels')}
                  </Text>
                  <Text color={'myGray.900'}>{flatDetail.hitLabels.join('、')}</Text>
                </Flex>
              )}

              {/* 关键词 */}
              {flatDetail.allKeywords.length > 0 && (
                <Flex fontSize={'xs'} lineHeight={'1.5'}>
                  <Text w={'80px'} color={'myGray.600'} flexShrink={0} fontWeight={'medium'}>
                    {t('admin:moderation.keywords')}
                  </Text>
                  <Text color={'myGray.900'}>{flatDetail.allKeywords.join('、')}</Text>
                </Flex>
              )}

              {/* 内容详情 */}
              {content && (
                <Flex fontSize={'xs'} lineHeight={'1.6'}>
                  <Text w={'80px'} color={'myGray.600'} flexShrink={0} fontWeight={'medium'}>
                    {t('admin:moderation.content_detail')}
                  </Text>
                  <Box
                    color={'myGray.900'}
                    flex={1}
                    whiteSpace={'pre-wrap'}
                    wordBreak={'break-word'}
                  >
                    {renderHighlightedModerationContent(
                      extractContentSnippet(content, flatDetail.allKeywords),
                      flatDetail.allKeywords
                    )}
                  </Box>
                </Flex>
              )}

              {/* 异常信息 */}
              {flatDetail.errorMessage && (
                <Flex fontSize={'xs'} lineHeight={'1.5'}>
                  <Text w={'80px'} color={'red.600'} flexShrink={0} fontWeight={'medium'}>
                    {t('admin:moderation.error_message')}
                  </Text>
                  <Text color={'red.600'}>{flatDetail.errorMessage}</Text>
                </Flex>
              )}
            </Flex>
          </Box>
        )}
      </Flex>
    </Box>
  );
};

export default ModerationTestCard;

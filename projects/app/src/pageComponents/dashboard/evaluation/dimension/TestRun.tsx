import React, { useCallback, useState } from 'react';
import { Box, Button, Flex, Grid, Text, VStack, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import AnswerTextarea from './AnswerTextarea';
import styles from './styles.module.scss';

/**
 * 测试运行结果接口
 */
interface TestResult {
  score: number;
  status: 'success' | 'running' | 'error';
  feedback: string;
}

/**
 * 测试运行弹窗组件属性接口
 */
interface TestRunProps {
  isOpen: boolean;
  onClose: () => void;
  q?: string;
  referenceAnswer?: string;
  actualAnswer?: string;
  onRun?: (answers: { referenceAnswer: string; actualAnswer: string }) => Promise<TestResult>;
}

/**
 * 测试运行弹窗组件
 * 用于测试评估维度的运行效果
 */
const TestRun = ({
  isOpen,
  onClose,
  q = '',
  referenceAnswer: defaultReferenceAnswer = '',
  actualAnswer: defaultActualAnswer = '',
  onRun
}: TestRunProps) => {
  const { t } = useTranslation();

  const [referenceAnswer, setReferenceAnswer] = useState(defaultReferenceAnswer);
  const [actualAnswer, setActualAnswer] = useState(defaultActualAnswer);
  const [question, setQuestion] = useState(q);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // 处理开始运行
  const handleStartRun = useCallback(async () => {
    // Mock 数据
    const mockSuccessResults = [
      {
        score: 85,
        feedback: '回答质量良好，主要观点清晰，但缺少一些细节说明。建议补充更多具体例子来支持观点。'
      },
      {
        score: 92,
        feedback: '回答非常全面，逻辑清晰，涵盖了问题的所有关键点。表达准确，语言流畅。'
      },
      {
        score: 78,
        feedback:
          '回答基本正确，但结构不够清晰，部分内容需要进一步展开。建议重新组织语言，使逻辑更加连贯。'
      }
    ];

    const mockErrorResults = [
      {
        feedback: '网络连接超时，请检查网络连接后重试。'
      },
      {
        feedback: '服务暂时不可用，系统正在维护中，请稍后再试。'
      },
      {
        feedback: '参数验证失败，请确保输入的问题和答案格式正确。'
      },
      {
        feedback: '处理请求时发生内部错误，请联系技术支持。'
      }
    ];

    setIsRunning(true);
    setTestResult({ score: 0, status: 'running', feedback: '' });

    try {
      // 模拟异步处理延迟
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 如果有外部传入的 onRun 函数，优先使用
      if (onRun) {
        const result = await onRun({
          referenceAnswer,
          actualAnswer
        });
        setTestResult(result);
      } else {
        // 否则使用 mock 数据
        const isSuccess = Math.random() > 0.5; // 50% 概率成功或失败

        if (isSuccess) {
          const randomSuccess =
            mockSuccessResults[Math.floor(Math.random() * mockSuccessResults.length)];
          setTestResult({
            score: randomSuccess.score,
            status: 'success',
            feedback: randomSuccess.feedback
          });
        } else {
          const randomError = mockErrorResults[Math.floor(Math.random() * mockErrorResults.length)];
          setTestResult({
            score: 0,
            status: 'error',
            feedback: randomError.feedback
          });
        }
      }
    } catch (error) {
      setTestResult({
        score: 0,
        status: 'error',
        feedback: t('运行失败，请重试')
      });
    } finally {
      setIsRunning(false);
    }
  }, [referenceAnswer, actualAnswer, onRun, t]);

  // 获取状态显示信息
  const getStatusInfo = useCallback(
    (status: TestResult['status']) => {
      switch (status) {
        case 'success':
          return {
            colorSchema: 'green',
            text: t('dashboard_evaluation:run_success')
          };
        case 'error':
          return {
            colorSchema: 'red',
            text: t('dashboard_evaluation:run_failed')
          };
        default:
          return {
            colorSchema: 'gray',
            text: t('dashboard_evaluation:not_run')
          };
      }
    },
    [t]
  );

  const statusInfo = testResult ? getStatusInfo(testResult.status) : null;

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="common/paused"
      title={t('dashboard_evaluation:test_run_title')}
      w={'100%'}
      maxW={['95vw', '1080px']}
      h={['90vh', '80vh']}
      isCentered
    >
      <Grid templateColumns="3fr 2fr" h="100%" gap={0} overflow="hidden">
        {/* 左侧 - 输入区域 */}
        <Box
          borderRight="1px solid"
          borderColor="myGray.200"
          display="flex"
          flexDirection="column"
          h="100%"
          overflow="hidden"
        >
          <Box flex="1" overflowY="auto" p={6} className={styles.scrollbar}>
            <VStack spacing={4} align="stretch">
              {/* 问题 */}
              <Box>
                <Text fontSize="md" fontWeight="medium" mb={3}>
                  {t('dashboard_evaluation:question_label')}
                </Text>
                <Textarea
                  resize={'none'}
                  className={styles.scrollbar}
                  flex={'1 0 0'}
                  _focus={{
                    borderColor: 'primary.500',
                    boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                    bg: 'white'
                  }}
                  borderRadius={'md'}
                  borderColor={'myGray.200'}
                  value={question || ''}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t('dashboard_evaluation:question_placeholder')}
                  minH="100px"
                />
              </Box>

              {/* 答案 */}
              <Text fontSize="md" fontWeight="medium">
                {t('dashboard_evaluation:answer_label')}
              </Text>

              {/* 参考答案 */}
              <AnswerTextarea
                label={t('dashboard_evaluation:reference_answer_label')}
                value={referenceAnswer}
                onChange={setReferenceAnswer}
                placeholder={t('dashboard_evaluation:reference_answer_placeholder')}
              />

              {/* 实际回答 */}
              <AnswerTextarea
                label={t('dashboard_evaluation:actual_answer_label')}
                value={actualAnswer}
                onChange={setActualAnswer}
                placeholder={t('dashboard_evaluation:actual_answer_placeholder')}
              />
            </VStack>
          </Box>
        </Box>

        {/* 右侧 - 运行结果区域 */}
        <Box display="flex" flexDirection="column" h="100%" overflow="hidden">
          {/* 运行结果标题和按钮 */}
          <Flex justify="space-between" align="center" p={6} pb={2}>
            <Text fontSize="md" fontWeight="medium">
              {t('dashboard_evaluation:run_result_label')}
            </Text>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={handleStartRun}
              isLoading={isRunning}
              loadingText={t('dashboard_evaluation:running_text')}
              isDisabled={!question.trim() || !referenceAnswer.trim() || !actualAnswer.trim()}
            >
              {t('dashboard_evaluation:start_run_button')}
            </Button>
          </Flex>

          {/* 运行结果内容 */}
          <Box flex="1" px={6} pb={6}>
            {testResult && testResult.status !== 'running' && (
              <Box
                h="100%"
                p={4}
                bg="myGray.50"
                borderRadius="md"
                border="1px solid"
                borderColor="myGray.200"
                display="flex"
                flexDirection="column"
              >
                {/* 状态标识 */}
                <Flex align="center" gap={2} mb={4}>
                  <MyTag
                    showDot
                    colorSchema={statusInfo?.colorSchema as any}
                    type={'borderFill'}
                    h={'26px'}
                    p={'4px 12px'}
                  >
                    <Flex fontWeight={'medium'} alignItems={'center'}>
                      {statusInfo?.text}
                    </Flex>
                  </MyTag>
                </Flex>

                {/* 分数显示 */}
                {testResult.status === 'success' && (
                  <Box mb={4}>
                    <Text fontSize="lg" fontWeight="bold" color="myGray.800">
                      {testResult.score} {t('dashboard_evaluation:score_unit')}
                    </Text>
                  </Box>
                )}

                {/* 报错信息标题 */}
                {testResult.status === 'error' && (
                  <Box mb={4}>
                    <Text fontSize="sm" fontWeight="medium" color="red.500">
                      {t('dashboard_evaluation:error_info_label')}
                    </Text>
                  </Box>
                )}

                {/* 反馈内容 */}
                <Box
                  flex="1"
                  fontSize="sm"
                  color={testResult.status === 'error' ? 'red.500' : 'myGray.700'}
                  whiteSpace="pre-wrap"
                  overflowY="auto"
                  className={styles.scrollbar}
                >
                  {testResult.feedback || t('dashboard_evaluation:no_feedback_text')}
                </Box>
              </Box>
            )}
            {testResult && testResult.status === 'running' && (
              <Box
                h="100%"
                p={4}
                bg="myGray.50"
                borderRadius="md"
                border="1px solid"
                borderColor="myGray.200"
              />
            )}
          </Box>
        </Box>
      </Grid>
    </MyModal>
  );
};

export default React.memo(TestRun);

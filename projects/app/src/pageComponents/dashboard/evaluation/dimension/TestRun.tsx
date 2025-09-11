import React, { useCallback, useState, useMemo } from 'react';
import { Box, Button, Flex, Grid, Text, VStack, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import AnswerTextarea from './AnswerTextarea';
import styles from './styles.module.scss';
import { postDebugMetric } from '@/web/core/evaluation/dimension';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import type {
  EvalModelConfigType,
  MetricConfig
} from '@fastgpt/global/core/evaluation/metric/type';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';

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
  formData?: {
    name: string;
    description?: string;
    prompt: string;
  };
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
  formData
}: TestRunProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [referenceAnswer, setReferenceAnswer] = useState(defaultReferenceAnswer);
  const [actualAnswer, setActualAnswer] = useState(defaultActualAnswer);
  const [question, setQuestion] = useState(q);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const { llmModelList } = useSystemStore();

  // 初始化默认模型
  React.useEffect(() => {
    if (llmModelList.length > 0 && !selectedModel) {
      setSelectedModel(llmModelList[0].model);
    }
  }, [llmModelList, selectedModel]);

  // 构建 LLM 配置
  const llmConfig: EvalModelConfigType | null = useMemo(() => {
    if (!selectedModel) return null;

    return {
      name: selectedModel
    };
  }, [selectedModel]);

  // 处理开始运行
  const handleStartRun = useCallback(async () => {
    if (!formData?.prompt) {
      toast({
        title: t('dashboard_evaluation:prompt_cannot_be_empty'),
        status: 'warning'
      });
      return;
    }

    if (!llmConfig || !selectedModel) {
      toast({
        title: t('dashboard_evaluation:please_select_model'),
        status: 'warning'
      });
      return;
    }

    setIsRunning(true);
    setTestResult({ score: 0, status: 'running', feedback: '' });

    try {
      // 构建评估用例
      const evalCase = {
        [EvalDatasetDataKeyEnum.UserInput]: question,
        [EvalDatasetDataKeyEnum.ExpectedOutput]: referenceAnswer,
        [EvalDatasetDataKeyEnum.ActualOutput]: actualAnswer
      };

      // 构建评估维度配置
      const metricConfig: MetricConfig = {
        metricName: formData.name,
        metricType: EvalMetricTypeEnum.Custom,
        prompt: formData.prompt
      };

      // 调用调试接口
      const result = await postDebugMetric({
        evalCase,
        llmConfig,
        metricConfig
      });

      setTestResult({
        score: result.score,
        status: 'success',
        feedback: result.reason || t('dashboard_evaluation:no_feedback_text')
      });
    } catch (error) {
      console.error('debug metric error:', error);
      setTestResult({
        score: 0,
        status: 'error',
        feedback: getErrText(error) || t('dashboard_evaluation:run_failed_please_retry')
      });
    } finally {
      setIsRunning(false);
    }
  }, [question, referenceAnswer, actualAnswer, formData, llmConfig, selectedModel, t, toast]);

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
            <Flex align="center" gap={2}>
              <AIModelSelector
                w={'180px'}
                h={'32px'}
                bg={'white'}
                value={selectedModel}
                list={llmModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(model) => {
                  setSelectedModel(model);
                }}
              />
              <Button
                size="sm"
                colorScheme="blue"
                onClick={handleStartRun}
                isLoading={isRunning}
                loadingText={t('dashboard_evaluation:running_text')}
                isDisabled={
                  !question.trim() ||
                  !referenceAnswer.trim() ||
                  !actualAnswer.trim() ||
                  !selectedModel
                }
              >
                {t('dashboard_evaluation:start_run_button')}
              </Button>
            </Flex>
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

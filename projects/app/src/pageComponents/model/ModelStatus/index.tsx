import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  HStack,
  Input,
  Stack,
  Switch,
  Text
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import type {
  GetModelStatusResponse,
  ModelStatusProbeModel,
  ModelStatusProbeRecord,
  ModelStatusProbeTimelinePoint,
  UpdateModelStatusProbeConfigBody
} from '@fastgpt/global/openapi/admin/system/model/status';
import { ModelStatusProbeStatusEnum } from '@fastgpt/global/core/ai/model/status';
import {
  getModelStatus,
  postModelStatusProbe,
  putModelStatusProbeConfig,
  postTestModelStatusWebhook
} from '@/web/core/ai/config';
import { accountContentScrollStyles } from '@/pageComponents/account/styles';
import ModelTabHeader from '../ModelTabHeader';

const statusColorMap = {
  green: 'green',
  yellow: 'yellow',
  red: 'red',
  unknown: 'gray'
} as const;

const formatTime = (time?: string | null) => {
  if (!time) return '-';
  return new Date(time).toLocaleString();
};

const formatTimeToMinute = (time?: string | null) => {
  if (!time) return '-';
  const d = dayjs(time);
  return d.isValid() ? d.format('YYYY/MM/DD HH:mm') : '-';
};

const TIMELINE_BAR_MIN_WIDTH = 4;
const TIMELINE_BAR_MAX_WIDTH = 10;
const TIMELINE_BAR_GAP = 2;

const StatusBadge = ({
  status,
  label
}: {
  status: ModelStatusProbeModel['status'];
  label: string;
}) => (
  <Badge colorScheme={statusColorMap[status]} borderRadius={'full'} px={2} py={0.5}>
    {label}
  </Badge>
);

const StatusSummaryCard = ({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <MyBox
    border={'1px solid'}
    borderColor={'myGray.200'}
    borderRadius={'lg'}
    bg={'white'}
    px={[3, 5]}
    py={[3, 4]}
  >
    <Text color={'myGray.500'} fontSize={['xs', 'sm']} noOfLines={1}>
      {label}
    </Text>
    <Text mt={1} color={color} fontSize={['xl', '2xl']} fontWeight={'bold'}>
      {value}
    </Text>
  </MyBox>
);

const ProbeTimeline = ({
  points,
  t
}: {
  points: ModelStatusProbeTimelinePoint[];
  t: (key: string, options?: Record<string, unknown>) => string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxBars, setMaxBars] = useState<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const updateMaxBars = () => {
      const clientWidth = container.clientWidth;
      if (clientWidth > 0) {
        // 容器两边内边距 px={2} (共 16px)
        const availableWidth = Math.max(0, clientWidth - 16);
        // 单柱最小宽度 4px，间距 2px；N 根柱子总宽 N * minW + (N - 1) * gap <= availableWidth
        const count = Math.floor(
          (availableWidth + TIMELINE_BAR_GAP) / (TIMELINE_BAR_MIN_WIDTH + TIMELINE_BAR_GAP)
        );
        setMaxBars(Math.max(count, 0));
      }
    };

    updateMaxBars();
    const resizeObserver = new ResizeObserver(updateMaxBars);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const displayPoints = useMemo(() => {
    if (maxBars > 0 && points.length > maxBars) {
      // 放不下时截断较早的历史数据，仅保留最新的柱子展示
      return points.slice(-maxBars);
    }
    return points;
  }, [points, maxBars]);

  if (points.length === 0) {
    return (
      <Flex
        h={'28px'}
        alignItems={'center'}
        justifyContent={'center'}
        borderRadius={'md'}
        bg={'myGray.50'}
      >
        <Text color={'myGray.500'} fontSize={'xs'}>
          {t('config_model:model_status_no_records')}
        </Text>
      </Flex>
    );
  }

  const renderTooltipContent = (point: ModelStatusProbeTimelinePoint) => {
    const probeTimes = (
      <Box color={'myGray.500'} mb={1}>
        <Text>
          {formatTimeToMinute(point.startTime)} ~ {formatTimeToMinute(point.endTime)}
        </Text>
        <Text>
          {point.failedChecks > 0
            ? t('config_model:model_status_tip_checks_with_failed', {
                total: point.totalChecks,
                failed: point.failedChecks
              })
            : t('config_model:model_status_tip_checks', {
                total: point.totalChecks
              })}
        </Text>
      </Box>
    );

    if (point.status === 'green') {
      return (
        <Box fontSize={'xs'}>
          {probeTimes}
          <Flex alignItems={'center'} gap={1.5}>
            <Text fontWeight={'semibold'} color={'green.600'}>
              {t('config_model:model_status_tip_normal')}
            </Text>
            {point.latencyMs !== undefined && <Text color={'myGray.600'}>{point.latencyMs}ms</Text>}
          </Flex>
        </Box>
      );
    }

    if (point.status === 'yellow') {
      return (
        <Box fontSize={'xs'}>
          {probeTimes}
          <Flex alignItems={'center'} gap={1.5}>
            <Text fontWeight={'semibold'} color={'yellow.600'}>
              {t('config_model:model_status_tip_high_latency')}
            </Text>
            {point.latencyMs !== undefined && <Text color={'myGray.600'}>{point.latencyMs}ms</Text>}
          </Flex>
        </Box>
      );
    }

    const errorMsg = point.error || t('config_model:model_status_red');

    return (
      <Box maxW={'320px'} fontSize={'xs'}>
        {probeTimes}
        <Text fontWeight={'semibold'} color={'red.600'} wordBreak={'break-word'}>
          {t('config_model:model_status_tip_error_prefix')}
          {errorMsg}
        </Text>
      </Box>
    );
  };

  return (
    <Box
      ref={containerRef}
      overflow={'hidden'}
      borderRadius={'md'}
      bg={'myGray.50'}
      px={2}
      py={1.5}
    >
      <Flex
        w={'100%'}
        h={'28px'}
        alignItems={'center'}
        justifyContent={'flex-end'}
        gap={`${TIMELINE_BAR_GAP}px`}
      >
        {displayPoints.map((point, index) => (
          <MyTooltip
            key={point.startTime}
            label={renderTooltipContent(point)}
            shouldWrapChildren={false}
            openDelay={100}
          >
            <Box
              data-testid={'model-probe-timeline-bar'}
              flex={1}
              minW={`${TIMELINE_BAR_MIN_WIDTH}px`}
              maxW={`${TIMELINE_BAR_MAX_WIDTH}px`}
              h={'20px'}
              borderRadius={'xs'}
              bg={statusColorMap[point.status] + '.400'}
              cursor={'pointer'}
              transition={
                'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
              }
              _hover={{
                transform: 'scaleY(1.4) scaleX(1.3)',
                bg: statusColorMap[point.status] + '.500',
                boxShadow: '0 0 6px rgba(0, 0, 0, 0.2)',
                zIndex: 2
              }}
            />
          </MyTooltip>
        ))}
      </Flex>
    </Box>
  );
};

const ModelStatusCard = ({
  model,
  t
}: {
  model: ModelStatusProbeModel;
  t: (key: string, options?: Record<string, unknown>) => string;
}) => {
  const statusLabel = t(`config_model:model_status_${model.status}`);
  const { i18n } = useClientTranslation();
  const getModelProvider = useUserModelStore((state) => state.getModelProvider);
  const avatar = model.avatar || getModelProvider(model.provider, i18n.language)?.avatar;

  return (
    <MyBox
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'lg'}
      bg={'white'}
      p={[4, 5]}
    >
      <Flex alignItems={'center'} justifyContent={'space-between'} gap={3}>
        <HStack spacing={2} minW={0} flex={1}>
          <Avatar src={avatar} w={'1.25rem'} borderRadius={'50%'} flexShrink={0} />
          <Text fontWeight={'bold'} noOfLines={1}>
            {model.name}
          </Text>
        </HStack>
        <StatusBadge status={model.status} label={statusLabel} />
      </Flex>

      <Text mt={4} color={'myGray.600'} fontSize={'sm'}>
        {t('config_model:model_status_stability', { percent: model.stabilityPercent.toFixed(2) })}
      </Text>

      <Box mt={3}>
        <ProbeTimeline points={model.points} t={t} />
      </Box>

      <Flex mt={3} justifyContent={'space-between'} gap={3} color={'myGray.500'} fontSize={'xs'}>
        <Text>
          {t('config_model:model_status_last_probe')}: {formatTime(model.latest?.requestEndedAt)}
        </Text>
        <Text>{model.latest?.latencyMs === undefined ? '-' : `${model.latest.latencyMs}ms`}</Text>
      </Flex>
      {model.latest?.error && (
        <Text mt={2} color={'red.500'} fontSize={'xs'} noOfLines={2}>
          {model.latest.error}
        </Text>
      )}
    </MyBox>
  );
};

const ProbeConfigModal = ({
  config,
  onClose,
  onSuccess
}: {
  config: GetModelStatusResponse['config'];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) => {
  const { t } = useClientTranslation('config_model');
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(config.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState<number | undefined>(
    config.intervalMinutes
  );
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl ?? '');
  const [webhookToken, setWebhookToken] = useState('');
  const [clearWebhookToken, setClearWebhookToken] = useState(false);

  const { runAsync, loading } = useRequest(
    async (data: UpdateModelStatusProbeConfigBody) => putModelStatusProbeConfig(data),
    {
      onSuccess: async () => {
        toast({ title: t('config_model:model_status_config_saved'), status: 'success' });
        await onSuccess();
        onClose();
      }
    }
  );

  const { runAsync: testWebhook, loading: testLoading } = useRequest(
    async () => {
      const trimmedUrl = webhookUrl.trim();
      if (!trimmedUrl && !config.webhookUrl) {
        toast({ title: t('config_model:model_status_webhook_url_empty'), status: 'warning' });
        return;
      }
      return postTestModelStatusWebhook({
        ...(trimmedUrl ? { webhookUrl: trimmedUrl } : {}),
        ...(webhookToken ? { webhookToken } : {})
      });
    },
    {
      onSuccess: (res) => {
        if (res?.success) {
          toast({
            title: t('config_model:model_status_test_webhook_success'),
            status: 'success'
          });
        }
      }
    }
  );

  const onSubmit = () => {
    if (
      intervalMinutes === undefined ||
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < 5 ||
      intervalMinutes > 60
    ) {
      toast({ title: t('config_model:model_status_interval_invalid'), status: 'warning' });
      return;
    }

    void runAsync({
      enabled,
      intervalMinutes,
      webhookUrl,
      ...(webhookToken ? { webhookToken } : {}),
      clearWebhookToken
    });
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('config_model:model_status_config')}
      footer={
        <Flex w={'100%'} alignItems={'center'} justifyContent={'space-between'}>
          <Button
            variant={'whitePrimary'}
            isLoading={testLoading}
            isDisabled={loading}
            onClick={() => void testWebhook()}
          >
            {t('config_model:model_status_test_webhook')}
          </Button>
          <HStack spacing={3}>
            <Button variant={'whiteBase'} onClick={onClose} isDisabled={loading || testLoading}>
              {t('common:Cancel')}
            </Button>
            <Button isLoading={loading} isDisabled={testLoading} onClick={onSubmit}>
              {t('common:Confirm')}
            </Button>
          </HStack>
        </Flex>
      }
    >
      <Stack spacing={5}>
        <FormControl display={'flex'} alignItems={'center'} justifyContent={'space-between'}>
          <Box>
            <FormLabel mb={1}>{t('config_model:model_status_enable')}</FormLabel>
            <FormHelperText mt={0}>{t('config_model:model_status_enable_tip')}</FormHelperText>
          </Box>
          <Switch isChecked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        </FormControl>

        <FormControl>
          <FormLabel display={'flex'} alignItems={'center'}>
            {t('config_model:model_status_interval')}
            <QuestionTip ml={1} label={t('config_model:model_status_interval_tip')} />
          </FormLabel>
          <MyNumberInput
            bg={'white'}
            inputFieldProps={{ bg: 'white' }}
            min={5}
            max={60}
            step={1}
            value={intervalMinutes}
            onChange={(val) => setIntervalMinutes(val)}
          />
        </FormControl>

        <FormControl>
          <FormLabel display={'flex'} alignItems={'center'}>
            {t('config_model:model_status_webhook_url')}
            <QuestionTip ml={1} label={t('config_model:model_status_webhook_url_tip')} />
          </FormLabel>
          <Input
            bg={'white'}
            type={'url'}
            autoComplete={'off'}
            name={'model-status-webhook-url'}
            placeholder={'https://example.com/webhook'}
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
          />
        </FormControl>

        <FormControl>
          <FormLabel display={'flex'} alignItems={'center'}>
            {t('config_model:model_status_webhook_token')}
            <QuestionTip ml={1} label={t('config_model:model_status_webhook_token_tip')} />
          </FormLabel>
          <Input
            bg={'white'}
            type={'password'}
            autoComplete={'new-password'}
            name={'model-status-webhook-token'}
            placeholder={
              config.webhookTokenConfigured
                ? t('config_model:model_status_token_configured')
                : t('config_model:model_status_token_placeholder')
            }
            value={webhookToken}
            onChange={(event) => setWebhookToken(event.target.value)}
          />
        </FormControl>

        {config.webhookTokenConfigured && (
          <Checkbox
            isChecked={clearWebhookToken}
            onChange={(event) => setClearWebhookToken(event.target.checked)}
          >
            {t('config_model:model_status_clear_token')}
          </Checkbox>
        )}
      </Stack>
    </MyModal>
  );
};

const ModelStatus = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useClientTranslation('config_model');
  const { toast } = useToast();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const {
    data,
    loading,
    runAsync: refresh
  } = useRequest(getModelStatus, {
    manual: false
  });
  const { runAsync: runProbe, loading: probing } = useRequest(postModelStatusProbe, {
    onSuccess: async () => {
      toast({ title: t('config_model:model_status_probe_success'), status: 'success' });
      await refresh();
    }
  });

  // 启用自动探测时，每 1 分钟静默刷新一次状态数据（无感刷新）
  useEffect(() => {
    if (!data?.config.enabled) return;

    const timer = setInterval(() => {
      void refresh();
    }, 60000);

    return () => clearInterval(timer);
  }, [data?.config.enabled, refresh]);

  const models = useMemo(() => data?.models ?? [], [data?.models]);

  return (
    <Flex flexDirection={'column'} flex={['0 0 auto', '1 0 0']} minH={0} gap={4}>
      <ModelTabHeader Tab={Tab}>
        <Button variant={'whiteBase'} onClick={() => setIsConfigOpen(true)}>
          {t('config_model:model_status_config')}
        </Button>
        {data?.config.enabled && (
          <Button isLoading={probing} onClick={() => void runProbe()}>
            {t('config_model:model_status_probe_now')}
          </Button>
        )}
      </ModelTabHeader>

      <MyBox {...accountContentScrollStyles} px={[4, 6]} pb={[6, 0]} isLoading={loading && !data}>
        {data &&
          (!data.config.enabled ? (
            <EmptyTip text={t('config_model:model_status_auto_probe_disabled')} pt={'20vh'} />
          ) : (
            <Flex flexDirection={'column'} gap={5}>
              <Grid
                templateColumns={['repeat(2, minmax(0, 1fr))', 'repeat(4, minmax(0, 1fr))']}
                gap={3}
              >
                <StatusSummaryCard
                  label={t('config_model:model_status_normal')}
                  value={data?.summary.green ?? 0}
                  color={'green.500'}
                />
                <StatusSummaryCard
                  label={t('config_model:model_status_high_latency')}
                  value={data?.summary.yellow ?? 0}
                  color={'yellow.600'}
                />
                <StatusSummaryCard
                  label={t('config_model:model_status_error')}
                  value={data?.summary.red ?? 0}
                  color={'red.500'}
                />
                <StatusSummaryCard
                  label={t('config_model:model_status_unknown')}
                  value={data?.summary.unknown ?? 0}
                  color={'myGray.500'}
                />
              </Grid>

              {models.length === 0 ? (
                <EmptyTip text={t('config_model:model_status_no_models')} pt={'15vh'} />
              ) : (
                <Grid templateColumns={['1fr', null, 'repeat(2, minmax(0, 1fr))']} gap={4} pb={6}>
                  {models.map((model) => (
                    <ModelStatusCard key={model.modelId} model={model} t={t} />
                  ))}
                </Grid>
              )}
            </Flex>
          ))}
      </MyBox>

      {isConfigOpen && data && (
        <ProbeConfigModal
          config={data.config}
          onClose={() => setIsConfigOpen(false)}
          onSuccess={async () => {
            await refresh();
          }}
        />
      )}
    </Flex>
  );
};

export default ModelStatus;

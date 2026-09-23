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
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import type {
  GetModelStatusResponse,
  ModelStatusProbeModel,
  ModelStatusProbeRecord,
  UpdateModelStatusProbeConfigBody
} from '@fastgpt/global/openapi/admin/system/model/status';
import {
  getModelStatus,
  postModelStatusProbe,
  putModelStatusProbeConfig
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
  records,
  t
}: {
  records: ModelStatusProbeRecord[];
  t: (key: string, options?: Record<string, unknown>) => string;
}) => {
  if (records.length === 0) {
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

  const renderTooltipContent = (record: ModelStatusProbeRecord) => {
    if (record.status === 'green') {
      return (
        <Box fontSize={'xs'}>
          <Text color={'myGray.500'} mb={0.5}>
            {formatTime(record.testedAt)}
          </Text>
          <Flex alignItems={'center'} gap={1.5}>
            <Text fontWeight={'semibold'} color={'green.600'}>
              {t('config_model:model_status_tip_normal')}
            </Text>
            {record.latencyMs !== undefined && (
              <Text color={'myGray.600'}>{record.latencyMs}ms</Text>
            )}
          </Flex>
        </Box>
      );
    }

    if (record.status === 'yellow') {
      return (
        <Box fontSize={'xs'}>
          <Text color={'myGray.500'} mb={0.5}>
            {formatTime(record.testedAt)}
          </Text>
          <Flex alignItems={'center'} gap={1.5}>
            <Text fontWeight={'semibold'} color={'yellow.600'}>
              {t('config_model:model_status_tip_high_latency')}
            </Text>
            {record.latencyMs !== undefined && (
              <Text color={'myGray.600'}>{record.latencyMs}ms</Text>
            )}
          </Flex>
        </Box>
      );
    }

    const errorMsg = record.error || t('config_model:model_status_red');

    return (
      <Box maxW={'320px'} fontSize={'xs'}>
        <Text color={'myGray.500'} mb={0.5}>
          {formatTime(record.testedAt)}
        </Text>
        <Text fontWeight={'semibold'} color={'red.600'} wordBreak={'break-word'}>
          {t('config_model:model_status_tip_error_prefix')}
          {errorMsg}
        </Text>
      </Box>
    );
  };

  return (
    <Box overflowX={'auto'} borderRadius={'md'} bg={'myGray.50'} px={2} py={1.5}>
      <Flex minW={Math.max(records.length * 6, 240)} h={'28px'} alignItems={'center'} gap={'2px'}>
        {records.map((record, index) => (
          <MyTooltip
            key={`${record.testedAt}-${index}`}
            label={renderTooltipContent(record)}
            shouldWrapChildren={false}
            openDelay={100}
          >
            <Box
              data-testid={'model-probe-timeline-bar'}
              flex={'0 0 4px'}
              h={'20px'}
              borderRadius={'xs'}
              bg={`${statusColorMap[record.status]}.400`}
              cursor={'pointer'}
              transition={
                'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
              }
              _hover={{
                transform: 'scaleY(1.4) scaleX(1.3)',
                bg: `${statusColorMap[record.status]}.500`,
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
        <ProbeTimeline records={model.records} t={t} />
      </Box>

      <Flex mt={3} justifyContent={'space-between'} gap={3} color={'myGray.500'} fontSize={'xs'}>
        <Text>
          {t('config_model:model_status_last_probe')}: {formatTime(model.latest?.testedAt)}
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
  const [intervalMinutes, setIntervalMinutes] = useState(String(config.intervalMinutes));
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

  const onSubmit = () => {
    const parsedInterval = Number(intervalMinutes);
    if (!Number.isInteger(parsedInterval) || parsedInterval < 5 || parsedInterval > 60) {
      toast({ title: t('config_model:model_status_interval_invalid'), status: 'warning' });
      return;
    }

    void runAsync({
      enabled,
      intervalMinutes: parsedInterval,
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
        <>
          <Button variant={'whiteBase'} onClick={onClose} isDisabled={loading}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={loading} onClick={onSubmit}>
            {t('common:Confirm')}
          </Button>
        </>
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
          <FormLabel>{t('config_model:model_status_interval')}</FormLabel>
          <Input
            type={'number'}
            min={5}
            max={60}
            value={intervalMinutes}
            onChange={(event) => setIntervalMinutes(event.target.value)}
          />
          <FormHelperText>{t('config_model:model_status_interval_tip')}</FormHelperText>
        </FormControl>

        <FormControl>
          <FormLabel>{t('config_model:model_status_webhook_url')}</FormLabel>
          <Input
            type={'url'}
            autoComplete={'off'}
            name={'model-status-webhook-url'}
            placeholder={'https://example.com/webhook'}
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
          />
        </FormControl>

        <FormControl>
          <FormLabel>{t('config_model:model_status_webhook_token')}</FormLabel>
          <Input
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
          <FormHelperText>{t('config_model:model_status_webhook_token_tip')}</FormHelperText>
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

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Progress,
  SimpleGrid,
  Skeleton,
  Spinner
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  SystemMigrationFailurePolicyEnum,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationListItem,
  SystemMigrationProgressListItem
} from '@fastgpt/global/migration/schema';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModalV2 from '@fastgpt/web/components/v2/common/MyModal';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import ConfigContainer from '@/pageComponents/config/ConfigContainer';
import {
  getSystemMigrationFailedRecords,
  getSystemMigrationList,
  retrySystemMigration
} from '@/web/common/system/migrations/api';
import {
  getSystemMigrationDisplayStatus,
  getSystemMigrationProgressPercent,
  type SystemMigrationDisplayStatus
} from '@/web/common/system/migrations/utils';

const statusVisual: Record<
  SystemMigrationDisplayStatus,
  { labelKey: string; color: string; background: string; border: string }
> = {
  [SystemMigrationStatusEnum.pending]: {
    labelKey: i18nT('system_migration:status_pending'),
    color: 'myGray.600',
    background: 'myGray.100',
    border: 'myGray.250'
  },
  [SystemMigrationStatusEnum.running]: {
    labelKey: i18nT('system_migration:status_running'),
    color: 'primary.700',
    background: 'primary.50',
    border: 'primary.200'
  },
  reclaiming: {
    labelKey: i18nT('system_migration:status_reclaiming'),
    color: 'yellow.700',
    background: 'yellow.50',
    border: 'yellow.200'
  },
  [SystemMigrationStatusEnum.failed]: {
    labelKey: i18nT('system_migration:status_failed'),
    color: 'red.600',
    background: 'red.50',
    border: 'red.200'
  },
  [SystemMigrationStatusEnum.succeeded]: {
    labelKey: i18nT('system_migration:status_succeeded'),
    color: 'green.700',
    background: 'green.50',
    border: 'green.200'
  }
};

const formatDate = (value?: Date) => (value ? formatTime2YMDHMS(new Date(value)) : '-');

/** 单个阶段独立展示生命周期、确定性进度和归属于该阶段的错误。 */
const MigrationProgressStage = ({
  progress,
  onViewFailedRecords
}: {
  progress: SystemMigrationProgressListItem;
  onViewFailedRecords: (progress: SystemMigrationProgressListItem) => void;
}) => {
  const { t } = useClientTranslation('system_migration');
  // lease 是否过期属于任务执行权状态；阶段仍保持其真实的 running 状态。
  const displayStatus = progress.status;
  const visual = statusVisual[displayStatus];
  const percent = getSystemMigrationProgressPercent(progress);
  const errorText = progress.error?.message;

  return (
    <Box
      px={3}
      py={2.5}
      border={'1px solid'}
      borderColor={displayStatus === SystemMigrationStatusEnum.failed ? 'red.200' : 'myGray.150'}
      borderRadius={'md'}
      bg={displayStatus === SystemMigrationStatusEnum.failed ? 'red.50' : 'myGray.25'}
    >
      <Flex alignItems={'center'} justifyContent={'space-between'} gap={3}>
        <Box minW={0} fontSize={'sm'} color={'myGray.700'}>
          {t(progress.labelKey as any, progress.params as any)}
        </Box>
        <Flex flexShrink={0} alignItems={'center'} gap={2}>
          {progress.current !== undefined && progress.total !== undefined && (
            <Box fontSize={'xs'} color={'myGray.500'}>
              {t('system_migration:progress_count', {
                current: progress.current,
                total: progress.total
              })}
            </Box>
          )}
          <Badge
            px={2}
            py={0.5}
            borderRadius={'md'}
            color={visual.color}
            bg={visual.background}
            border={'1px solid'}
            borderColor={visual.border}
            textTransform={'none'}
          >
            {t(visual.labelKey as any)}
          </Badge>
        </Flex>
      </Flex>
      {percent !== undefined && (
        <Progress
          mt={2}
          value={percent}
          h={'5px'}
          borderRadius={'full'}
          colorScheme={displayStatus === SystemMigrationStatusEnum.failed ? 'red' : 'blue'}
          bg={'myGray.200'}
        />
      )}
      {displayStatus === SystemMigrationStatusEnum.failed && (
        <Box mt={2} fontSize={'xs'} color={'red.600'}>
          {errorText && <Box wordBreak={'break-word'}>{errorText}</Box>}
          {(progress.failedRecordCount ?? 0) > 0 && (
            <Button
              mt={errorText ? 2 : 0}
              size={'xs'}
              variant={'whiteBase'}
              onClick={() => onViewFailedRecords(progress)}
            >
              {t('system_migration:view_failed_records', {
                count: progress.failedRecordCount
              })}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

/**
 * 单个升级任务卡片只消费列表摘要。
 * 失败正文不在这里预加载，用户点击后交给顶层弹窗按 migrationId 查询。
 */
const MigrationCard = ({
  migration,
  serverTime,
  onViewFailedRecords,
  onRetry,
  retrying
}: {
  migration: SystemMigrationListItem;
  serverTime: Date;
  onViewFailedRecords: (
    migration: SystemMigrationListItem,
    progress: SystemMigrationProgressListItem
  ) => void;
  onRetry: (migrationId: string) => void;
  retrying: boolean;
}) => {
  const { t } = useClientTranslation('system_migration');
  const displayStatus = getSystemMigrationDisplayStatus({ migration, serverTime });
  const visual = statusVisual[displayStatus];
  const resultText = migration.result
    ? t(migration.result.key as any, migration.result.params as any)
    : undefined;
  const unscopedError = migration.lastError?.stageKey ? undefined : migration.lastError;
  const errorText = unscopedError?.message;

  return (
    <Box
      mb={4}
      border={'1px solid'}
      borderColor={displayStatus === SystemMigrationStatusEnum.failed ? 'red.200' : 'myGray.200'}
      borderRadius={'xl'}
      bg={'white'}
      boxShadow={'1'}
      overflow={'hidden'}
    >
      <Flex px={[4, 5]} py={4} gap={3} alignItems={'flex-start'} justifyContent={'space-between'}>
        <Box minW={0}>
          <Flex alignItems={'center'} gap={2} flexWrap={'wrap'}>
            <Box fontWeight={'semibold'} color={'myGray.900'}>
              {t(migration.nameKey as any)}
            </Box>
            <Badge
              px={2}
              py={0.5}
              borderRadius={'md'}
              color={visual.color}
              bg={visual.background}
              border={'1px solid'}
              borderColor={visual.border}
              textTransform={'none'}
            >
              {t(visual.labelKey as any)}
            </Badge>
          </Flex>
          <Box mt={2} fontSize={'sm'} color={'myGray.500'} lineHeight={1.7}>
            {t(migration.descriptionKey as any)}
          </Box>
        </Box>
        {!migration.blockStartup && migration.status === SystemMigrationStatusEnum.failed && (
          <Button
            flexShrink={0}
            size={'sm'}
            variant={'primary'}
            isLoading={retrying}
            onClick={() => onRetry(migration.id)}
          >
            {t('system_migration:retry_migration')}
          </Button>
        )}
      </Flex>

      {migration.status === SystemMigrationStatusEnum.failed && (
        <Box
          mx={[4, 5]}
          mb={4}
          p={3}
          bg={
            migration.onFailure === SystemMigrationFailurePolicyEnum.continue
              ? 'yellow.50'
              : 'red.50'
          }
          borderRadius={'lg'}
          fontSize={'sm'}
          color={
            migration.onFailure === SystemMigrationFailurePolicyEnum.continue
              ? 'yellow.700'
              : 'red.700'
          }
        >
          {t(
            migration.onFailure === SystemMigrationFailurePolicyEnum.continue
              ? i18nT('system_migration:failure_allows_following')
              : i18nT('system_migration:failure_blocks_following')
          )}
        </Box>
      )}

      {migration.result && migration.status === SystemMigrationStatusEnum.succeeded && (
        <Box
          mx={[4, 5]}
          mb={4}
          p={3}
          bg={'green.50'}
          borderRadius={'sm'}
          fontSize={'sm'}
          color={'green.700'}
        >
          {resultText}
        </Box>
      )}

      <Box mx={[4, 5]} mb={4}>
        <Box mb={2} fontSize={'xs'} fontWeight={'medium'} color={'myGray.500'}>
          {t('system_migration:stages')}
        </Box>
        <Flex flexDirection={'column'} gap={2}>
          {migration.progress.map((progress) => (
            <MigrationProgressStage
              key={progress.key}
              progress={progress}
              onViewFailedRecords={(selectedProgress) =>
                onViewFailedRecords(migration, selectedProgress)
              }
            />
          ))}
        </Flex>
      </Box>

      {unscopedError && (
        <Box
          mx={[4, 5]}
          mb={4}
          p={3}
          bg={'red.50'}
          borderRadius={'lg'}
          borderLeft={'3px solid'}
          borderLeftColor={'red.400'}
        >
          <Box fontSize={'xs'} fontWeight={'semibold'} color={'red.700'}>
            {t('system_migration:last_error')}
          </Box>
          <Box
            mt={1}
            fontSize={'sm'}
            color={'red.700'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-word'}
          >
            {errorText}
          </Box>
          <Box mt={1} fontSize={'xs'} color={'red.500'}>
            {t('system_migration:error_run', { runId: unscopedError.runId })}
          </Box>
        </Box>
      )}

      <SimpleGrid
        columns={[1, 2, 3]}
        spacingX={5}
        spacingY={2}
        px={[4, 5]}
        py={3}
        bg={'myGray.25'}
        borderTop={'1px solid'}
        borderColor={'myGray.150'}
        fontSize={'xs'}
      >
        <Box>
          <Box color={'myGray.400'}>{t('system_migration:version')}</Box>
          <Box mt={0.5} color={'myGray.700'}>
            {migration.version}
          </Box>
        </Box>
        <Box>
          <Box color={'myGray.400'}>{t('system_migration:last_started')}</Box>
          <Box mt={0.5} color={'myGray.700'}>
            {formatDate(migration.lastStartedAt)}
          </Box>
        </Box>
        <Box minW={0}>
          <Box color={'myGray.400'}>{t('system_migration:completed_at')}</Box>
          <Box mt={0.5} color={'myGray.700'} noOfLines={1}>
            {formatDate(migration.completedAt)}
          </Box>
        </Box>
      </SimpleGrid>
    </Box>
  );
};

/**
 * 按需读取并展示最近一次失败记录。
 * 使用只读 JSON Editor 是为了完整保留数据结构，同时避免页面为不同迁移定义专用表格列。
 */
const FailedRecordsModal = ({
  migration,
  progress,
  onClose
}: {
  migration: SystemMigrationListItem;
  progress: SystemMigrationProgressListItem;
  onClose: () => void;
}) => {
  const { t } = useClientTranslation('system_migration');
  const { data, isLoading, isError, refetch } = useQuery(
    // migrationId 进入 query key，切换任务时不会复用上一任务的错误正文。
    ['systemMigrationFailedRecords', migration.id, progress.key],
    () => getSystemMigrationFailedRecords({ migrationId: migration.id, stageKey: progress.key })
  );
  const stageLabel = t(progress.labelKey as any, progress.params as any);

  return (
    <MyModalV2
      isOpen
      onClose={onClose}
      title={t('system_migration:stage_failed_records_title', {
        stage: stageLabel,
        count: progress.failedRecordCount ?? 0
      })}
      size={'xl'}
      bodyStyles={{
        minH: '520px',
        display: 'flex',
        flexDirection: 'column',
        p: 5,
        overflowY: 'auto'
      }}
    >
      {isLoading ? (
        <Flex flex={1} alignItems={'center'} justifyContent={'center'}>
          <Spinner />
        </Flex>
      ) : isError ? (
        <Flex flex={1} flexDirection={'column'} alignItems={'center'} justifyContent={'center'}>
          <Box fontSize={'sm'} color={'red.600'}>
            {t('system_migration:failed_records_load_failed')}
          </Box>
          <Button mt={3} size={'sm'} variant={'whiteBase'} onClick={() => void refetch()}>
            {t('system_migration:refresh')}
          </Button>
        </Flex>
      ) : (
        <JsonEditor
          value={JSON.stringify(data?.failedRecords ?? [], null, 2)}
          readOnly
          defaultHeight={480}
        />
      )}
    </MyModalV2>
  );
};

/** Root 管理员的升级状态页：轮询轻量摘要，所有执行动作仍通过服务端 lease runner 完成。 */
const SystemMigrationsPage = () => {
  const { t } = useClientTranslation('system_migration');
  const { data, isFetching, isError, refetch } = useQuery(
    ['systemMigrationList'],
    getSystemMigrationList,
    {
      refetchInterval: (latestData) =>
        latestData?.migrations.every(
          (migration) => migration.status === SystemMigrationStatusEnum.succeeded
        )
          ? false
          : 10_000
    }
  );
  const { runAsync: retryMigration, loading: isRetrying } = useRequest(
    (migrationId: string) => retrySystemMigration({ migrationId }),
    {
      successToast: t('system_migration:migration_retry_requested'),
      // 重置成功后立即刷新，否则需要等待下一次定时轮询才能看到 pending/running。
      onSuccess: () => void refetch()
    }
  );
  const [failedRecordsTarget, setFailedRecordsTarget] = useState<{
    migration: SystemMigrationListItem;
    progress: SystemMigrationProgressListItem;
  }>();
  const [pending, running, failed] = useMemo(() => {
    const migrations = data?.migrations ?? [];
    return [
      migrations.filter((item) => item.status === SystemMigrationStatusEnum.pending).length,
      migrations.filter((item) => item.status === SystemMigrationStatusEnum.running).length,
      migrations.filter((item) => item.status === SystemMigrationStatusEnum.failed).length
    ];
  }, [data?.migrations]);
  // 仅倒序展示副本；注册表顺序和 Runner 的串行执行顺序仍保持不变。
  const displayMigrations = useMemo(
    () => [...(data?.migrations ?? [])].reverse(),
    [data?.migrations]
  );

  return (
    <ConfigContainer>
      <Flex h={'100%'} minH={0} flexDirection={'column'} bg={'myGray.25'}>
        <Flex
          px={[4, 7]}
          py={5}
          bg={'white'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          alignItems={['flex-start', 'center']}
          justifyContent={'space-between'}
          gap={4}
        >
          <Box>
            <Box as={'h1'} fontSize={'lg'} fontWeight={'semibold'} color={'myGray.900'}>
              {t('system_migration:migration_page_title')}
            </Box>
            <Box mt={1} maxW={'760px'} fontSize={'sm'} color={'myGray.500'}>
              {t('system_migration:migration_page_description')}
            </Box>
          </Box>
          <Flex flexShrink={0} flexDirection={'column'} alignItems={'flex-end'} gap={1.5}>
            <Button
              size={'sm'}
              variant={'whiteBase'}
              leftIcon={<MyIcon name={'common/refresh'} w={4} />}
              isLoading={isFetching}
              loadingText={t('system_migration:refresh')}
              onClick={() => void refetch()}
            >
              {t('system_migration:refresh')}
            </Button>
            {data?.serverTime && (
              <Box fontSize={'xs'} color={'myGray.500'} whiteSpace={'nowrap'}>
                {t('system_migration:last_refreshed_at', {
                  time: formatDate(data.serverTime)
                })}
              </Box>
            )}
          </Flex>
        </Flex>

        <Box flex={1} minH={0} overflowY={'auto'} px={[4, 7]} py={5}>
          {data ? (
            <Box maxW={'1040px'} mx={'auto'}>
              <SimpleGrid columns={[2, 4]} spacing={3} mb={6}>
                {[
                  [t('system_migration:total_tasks'), data.migrations.length, 'myGray.900'],
                  [t('system_migration:pending_tasks'), pending, 'myGray.600'],
                  [t('system_migration:running_tasks'), running, 'primary.700'],
                  [t('system_migration:failed_tasks'), failed, 'red.600']
                ].map(([label, value, color]) => (
                  <Box
                    key={String(label)}
                    px={4}
                    py={3}
                    bg={'white'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    borderRadius={'lg'}
                  >
                    <Box fontSize={'xs'} color={'myGray.500'}>
                      {label}
                    </Box>
                    <Box mt={1} fontSize={'xl'} fontWeight={'semibold'} color={String(color)}>
                      {value}
                    </Box>
                  </Box>
                ))}
              </SimpleGrid>

              {data.migrations.length === 0 ? (
                <Flex
                  minH={'300px'}
                  flexDirection={'column'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  bg={'white'}
                  border={'1px dashed'}
                  borderColor={'myGray.250'}
                  borderRadius={'xl'}
                  textAlign={'center'}
                  px={6}
                >
                  <Flex
                    w={12}
                    h={12}
                    alignItems={'center'}
                    justifyContent={'center'}
                    borderRadius={'full'}
                    bg={'primary.50'}
                  >
                    <MyIcon name={'common/rocket'} w={6} color={'primary.600'} />
                  </Flex>
                  <Box mt={4} fontWeight={'semibold'} color={'myGray.800'}>
                    {t('system_migration:no_migrations_title')}
                  </Box>
                  <Box mt={2} maxW={'520px'} fontSize={'sm'} color={'myGray.500'}>
                    {t('system_migration:no_migrations_description')}
                  </Box>
                </Flex>
              ) : (
                displayMigrations.map((migration) => (
                  <MigrationCard
                    key={migration.id}
                    migration={migration}
                    serverTime={data.serverTime}
                    onViewFailedRecords={(migration, progress) =>
                      setFailedRecordsTarget({ migration, progress })
                    }
                    onRetry={(migrationId) => void retryMigration(migrationId)}
                    retrying={isRetrying}
                  />
                ))
              )}
            </Box>
          ) : isError ? (
            <Flex
              maxW={'1040px'}
              minH={'300px'}
              mx={'auto'}
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
              bg={'white'}
              border={'1px solid'}
              borderColor={'red.200'}
              borderRadius={'xl'}
              textAlign={'center'}
              px={6}
            >
              <MyIcon name={'common/error'} w={8} color={'red.500'} />
              <Box mt={4} fontWeight={'semibold'} color={'myGray.800'}>
                {t('system_migration:migration_list_load_failed')}
              </Box>
              <Button mt={4} size={'sm'} variant={'whiteBase'} onClick={() => void refetch()}>
                {t('system_migration:refresh')}
              </Button>
            </Flex>
          ) : (
            <Box maxW={'1040px'} mx={'auto'}>
              <Skeleton h={'92px'} borderRadius={'xl'} mb={5} />
              <Skeleton h={'180px'} borderRadius={'xl'} />
            </Box>
          )}
        </Box>
      </Flex>
      {failedRecordsTarget && (
        <FailedRecordsModal
          migration={failedRecordsTarget.migration}
          progress={failedRecordsTarget.progress}
          onClose={() => setFailedRecordsTarget(undefined)}
        />
      )}
    </ConfigContainer>
  );
};

export default SystemMigrationsPage;

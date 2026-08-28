import { Box, Button, Flex, Grid, Input, Switch } from '@chakra-ui/react';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import type { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';
import type {
  StandSubPlanLevelMapType,
  TeamStandardSubPlanItemType
} from '@fastgpt/global/support/wallet/sub/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export const FeatureRow = ({ values }: { values: string[] }) => {
  const columnCount = values.length;
  return (
    <Grid
      gridTemplateColumns={`repeat(${columnCount}, 1fr)`}
      w={'100%'}
      _notLast={{
        borderBottom: '1px solid',
        borderColor: 'myGray.200'
      }}
    >
      {values.map((value, index) => (
        <Flex
          key={index}
          alignItems={'center'}
          px={4}
          h={12}
          flex={1}
          borderColor={'myGray.200'}
          fontSize={'sm'}
          color={'myGray.600'}
        >
          {value || ''}
        </Flex>
      ))}
    </Grid>
  );
};

export const EditPlanModal = ({
  level,
  value,
  onClose,
  onChange,
  isLegacy = false
}: {
  level: `${StandardSubLevelEnum}`;
  value: StandSubPlanLevelMapType;
  onClose: () => void;
  onChange: (e: StandSubPlanLevelMapType) => void;
  isLegacy?: boolean;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { handleSubmit, watch, setValue } = useForm<TeamStandardSubPlanItemType>({
    defaultValues: value[level]
  });
  const label = value?.[level]?.name || t(standardSubLevelMap[level].label);

  const onSubmit = (data: TeamStandardSubPlanItemType) => {
    onChange({
      ...value,
      [level]: data
    });
    onClose();
  };

  return (
    <MyModal
      isOpen
      title={`编辑 ${label} 套餐${isLegacy ? '（旧版）' : ''}`}
      isCentered
      minW={'800px'}
      maxH={'90vh'}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>确认</Button>
        </>
      }
    >
      <Flex mb={6} pb={6} gap={8} borderBottomWidth={'1px'} borderBottomColor={'myGray.200'}>
        <FormLabel fontSize={'md'} fontWeight={'medium'} flex={'0 0 160px'}>
          基础信息与定价
        </FormLabel>
        <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
          <Box>
            <FormLabel mb={2}>套餐名称</FormLabel>
            <Input
              bg={'myGray.50'}
              value={watch('name')}
              onChange={(e) => {
                setValue('name', e.target.value ?? '');
              }}
              placeholder={'自定义套餐名，可覆盖原套餐名'}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>每月价格</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('price')}
              h={9}
              min={0}
              onChange={(e) => {
                setValue('price', e ?? 0);
              }}
            />
          </Box>
          <Box gridColumn="span 2">
            <FormLabel mb={2}>套餐描述</FormLabel>
            <Input
              bg={'myGray.50'}
              value={watch('desc') as any}
              onChange={(e) => {
                setValue('desc', e.target.value ?? '');
              }}
              placeholder={'自定义套餐描述，可覆盖原套餐描述，14字以内'}
            />
          </Box>
        </Grid>
      </Flex>
      <Flex mb={6} pb={6} gap={8} borderBottomWidth={'1px'} borderBottomColor={'myGray.200'}>
        <FormLabel fontSize={'md'} fontWeight={'medium'} flex={'0 0 160px'}>
          核心资源配额
        </FormLabel>
        <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
          <Box>
            <FormLabel mb={2}>AI 积分量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('totalPoints')}
              min={0}
              onChange={(e) => {
                setValue('totalPoints', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>团队成员数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('maxTeamMember')}
              min={0}
              onChange={(e) => {
                setValue('maxTeamMember', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>Agent 数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('maxAppAmount')}
              min={0}
              onChange={(e) => {
                setValue('maxAppAmount', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>知识库数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('maxDatasetAmount')}
              min={0}
              onChange={(e) => {
                setValue('maxDatasetAmount', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>知识库索引数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('maxDatasetSize')}
              min={0}
              onChange={(e) => {
                setValue('maxDatasetSize', e ?? 0);
              }}
            />
          </Box>
        </Grid>
      </Flex>
      <Flex mb={6} pb={6} gap={8} borderBottomWidth={'1px'} borderBottomColor={'myGray.200'}>
        <FormLabel flex={'0 0 160px'} fontSize={'md'} fontWeight={'medium'}>
          使用限制与数据留存
        </FormLabel>
        <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
          <Box>
            <FormLabel mb={2}>每分钟请求数</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('requestsPerMinute')}
              min={0}
              placeholder={'默认上限 2000'}
              onChange={(e) => {
                setValue('requestsPerMinute', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>单知识库网页同步数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('websiteSyncPerDataset')}
              min={0}
              placeholder={'默认不开启'}
              onChange={(e) => {
                setValue('websiteSyncPerDataset', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>应用备案数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('appRegistrationCount')}
              min={0}
              placeholder={'默认不开启'}
              onChange={(e) => {
                setValue('appRegistrationCount', e ?? 0);
              }}
            />
          </Box>

          <Box>
            <FormLabel mb={2}>对话记录保存时长（天）</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('chatHistoryStoreDuration')}
              min={0}
              placeholder={'默认不开启'}
              onChange={(e) => {
                setValue('chatHistoryStoreDuration', e ?? 0);
              }}
            />
          </Box>

          <Box>
            <FormLabel mb={2}>审计日志保存时间（天）</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('auditLogStoreDuration')}
              min={0}
              placeholder={'默认不开启'}
              onChange={(e) => {
                setValue('auditLogStoreDuration', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>工单支持响应时间（小时）</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('ticketResponseTime')}
              min={0}
              placeholder={'默认不开启'}
              onChange={(e) => {
                setValue('ticketResponseTime', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>自定义域名数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('customDomain')}
              min={0}
              placeholder={'默认为 0'}
              onChange={(e) => {
                setValue('customDomain', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>最大上传文件大小（MB）</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('maxUploadFileSize')}
              min={0}
              placeholder={'默认为系统配置'}
              onChange={(e) => {
                setValue('maxUploadFileSize', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>最大上传文件数量</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('maxUploadFileCount')}
              min={0}
              placeholder={'默认为系统配置'}
              onChange={(e) => {
                setValue('maxUploadFileCount', e ?? 0);
              }}
            />
          </Box>
          <Box>
            <FormLabel mb={2}>体验虚拟机</FormLabel>
            <Switch
              isChecked={watch('enableSandbox')}
              onChange={(e) => {
                setValue('enableSandbox', e.target.checked);
              }}
            />
          </Box>
        </Grid>
      </Flex>
      <Flex mb={6} pb={6} gap={8}>
        <FormLabel flex={'0 0 160px'} fontSize={'md'} fontWeight={'medium'}>
          活动套餐
        </FormLabel>
        <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
          <Box>
            <FormLabel mb={2}>年套餐活动赠送积分</FormLabel>
            <MyNumberInput
              bg={'myGray.50'}
              value={watch('annualBonusPoints')}
              min={0}
              placeholder={'默认为 0'}
              onChange={(e) => {
                setValue('annualBonusPoints', e ?? 0);
              }}
            />
          </Box>
        </Grid>
      </Flex>
      {!!feConfigs?.showWecomConfig && (
        <Flex mb={6} pb={6} gap={8}>
          <FormLabel flex={'0 0 160px'} fontSize={'md'} fontWeight={'medium'}>
            企微套餐设置
          </FormLabel>
          <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
            <Box>
              <FormLabel mb={2}>年套餐价格</FormLabel>
              <MyNumberInput
                bg={'myGray.50'}
                value={watch('wecom.price')}
                min={0}
                placeholder={'默认为 0'}
                onChange={(e) => {
                  setValue('wecom.price', e ?? 0);
                }}
              />
            </Box>
            <Box>
              <FormLabel mb={2}>年套餐积分</FormLabel>
              <MyNumberInput
                bg={'myGray.50'}
                value={watch('wecom.points')}
                min={0}
                placeholder={'默认为 0'}
                onChange={(e) => {
                  setValue('wecom.points', e ?? 0);
                }}
              />
            </Box>
          </Grid>
        </Flex>
      )}
    </MyModal>
  );
};

// 共享的获取特性列表函数
export const getColumnFeatures = (
  plan: TeamStandardSubPlanItemType | undefined,
  t: (key: string, options?: any) => string
): string[] => {
  const features: string[] = [
    t('common:n_ai_points', { amount: plan?.totalPoints }),
    t('common:n_team_members', {
      amount: plan?.maxTeamMember
    }),
    t('common:n_agent_amount', { amount: plan?.maxAppAmount }),
    t('common:n_dataset_amount', {
      amount: plan?.maxDatasetAmount
    }),
    t('common:n_dataset_size', {
      amount: plan?.maxDatasetSize
    }),
    t('common:n_team_qpm', {
      amount: plan?.requestsPerMinute
    }),
    t('common:n_chat_records_retain', {
      amount: plan?.chatHistoryStoreDuration
    })
  ];
  if (plan?.websiteSyncPerDataset) {
    features.push(
      t('common:n_website_sync_max_pages', {
        amount: plan.websiteSyncPerDataset
      })
    );
  }
  if (plan?.auditLogStoreDuration) {
    features.push(
      t('common:n_team_audit_day', {
        amount: plan.auditLogStoreDuration
      })
    );
  }
  if (plan?.appRegistrationCount) {
    features.push(
      t('common:n_app_registration_amount', {
        amount: plan.appRegistrationCount
      })
    );
  }
  if (plan?.ticketResponseTime) {
    features.push(
      t('common:worker_order_support_time', {
        amount: plan.ticketResponseTime
      })
    );
  }
  if (plan?.customDomain) {
    features.push(
      t('common:n_custom_domain_amount', {
        amount: plan.customDomain
      })
    );
  }
  if (plan?.maxUploadFileSize) {
    features.push(
      t('common:n_max_upload_file_size', {
        amount: plan.maxUploadFileSize
      })
    );
  }
  if (plan?.maxUploadFileCount) {
    features.push(
      t('common:n_max_upload_file_count', {
        amount: plan.maxUploadFileCount
      })
    );
  }
  if (plan?.enableSandbox) {
    features.push(t('common:enable_sandbox'));
  }
  return features;
};

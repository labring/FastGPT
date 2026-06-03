import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  Switch,
  Flex,
  Text,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  TableContainer,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  SimpleGrid
} from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import {
  getAdminToolRuntimeConfig,
  getAdminSystemToolDetail,
  getAdminSystemToolVersions,
  postAdminResetToolRuntimeConfig,
  putAdminUpdateToolRuntimeConfig,
  putAdminUpdateSystemTool
} from '@/web/core/plugin/admin/tool/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { UserTagsSchema } from '@fastgpt/global/support/user/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { UpdateSystemToolBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';

const COST_LIMITS = { max: 1000, min: 0, step: 0.1 };
const FORM_LABEL_WIDTH = '160px';
const SINGLE_TOOL_MODAL_WIDTH = '560px';
const TOOL_SET_MODAL_WIDTH = '800px';

const RUNTIME_CONFIG_FIELDS = [
  {
    key: 'minPods',
    labelKey: 'app:toolkit_runtime_config_min_pods',
    tipKey: 'app:toolkit_runtime_config_min_pods_tip',
    min: 0
  },
  {
    key: 'maxPods',
    labelKey: 'app:toolkit_runtime_config_max_pods',
    tipKey: 'app:toolkit_runtime_config_max_pods_tip',
    min: 1
  },
  {
    key: 'podTimeout',
    labelKey: 'app:toolkit_runtime_config_pod_timeout',
    tipKey: 'app:toolkit_runtime_config_pod_timeout_tip',
    min: 1
  },
  {
    key: 'maxConcurrentRequestsPerPod',
    labelKey: 'app:toolkit_runtime_config_max_concurrent_requests_per_pod',
    tipKey: 'app:toolkit_runtime_config_max_concurrent_requests_per_pod_tip',
    min: 1
  }
] as const;

type RuntimeConfigFieldKey = (typeof RUNTIME_CONFIG_FIELDS)[number]['key'];
type RuntimeConfigValue = Record<string, unknown>;

const normalizeRuntimeConfig = (config: unknown): RuntimeConfigValue => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  return config as RuntimeConfigValue;
};

type ChildToolConfigItem = {
  id: string;
  name?: string;
  systemKeyCost?: number;
};

const ConfigCard = ({
  title,
  rightContent,
  children
}: {
  title: React.ReactNode;
  rightContent?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Box border={'1px solid'} borderColor={'myGray.200'} borderRadius={'8px'} p={4}>
    <Flex alignItems={'flex-start'} justifyContent={'space-between'} gap={4} mb={4}>
      <Box color={'myGray.400'} fontSize={'10px'} lineHeight={'14px'} fontWeight={'500'}>
        {title}
      </Box>
      {rightContent}
    </Flex>
    <Flex flexDirection={'column'} gap={4}>
      {children}
    </Flex>
  </Box>
);

const ConfigRow = ({
  label,
  children,
  align = 'center'
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  align?: 'center' | 'flex-start';
}) => (
  <Flex alignItems={align} gap={4} minH={9}>
    <Box flex={`0 0 ${FORM_LABEL_WIDTH}`} color={'#24282C'} fontSize={'14px'} fontWeight={'500'}>
      {label}
    </Box>
    <Box flex={1} minW={0}>
      {children}
    </Box>
  </Flex>
);

const VerticalField = ({
  label,
  tip,
  children
}: {
  label: React.ReactNode;
  tip?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Box>
    <Flex alignItems={'center'} minH={9}>
      <Box flex={`0 0 ${FORM_LABEL_WIDTH}`} color={'#24282C'} fontSize={'14px'} fontWeight={'500'}>
        {label}
      </Box>
      {tip && (
        <Box flex={1} color={'myGray.500'} fontSize={'12px'} textAlign={'right'}>
          {tip}
        </Box>
      )}
    </Flex>
    {children}
  </Box>
);

const SystemToolConfigModal = ({
  toolId,
  onSuccess,
  onClose
}: {
  toolId: string;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const { register, reset, handleSubmit, setValue, watch } = useForm<UpdateSystemToolBodyType>();
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigValue>({});
  const [selectedVersion, setSelectedVersion] = useState<string>();
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    setSelectedVersion(undefined);
  }, [toolId]);

  const { data: toolVersions = [], loading: loadingVersions } = useRequest(
    () => getAdminSystemToolVersions({ toolId }),
    {
      onSuccess(versions) {
        if (!selectedVersion && versions[0]?.version) {
          setSelectedVersion(versions[0].version);
        }
      },
      manual: false,
      refreshDeps: [toolId]
    }
  );

  const { data: tool, loading } = useRequest(
    () => getAdminSystemToolDetail({ toolId, version: selectedVersion }),
    {
      onSuccess(res) {
        const formData: Partial<UpdateSystemToolBodyType> = {
          status: res.status,
          secretsVal: res.secretsVal,
          systemKeyCost: res.systemKeyCost,
          children: res.children?.map((childTool: ChildToolConfigItem) => ({
            id: childTool.id,
            systemKeyCost: childTool.systemKeyCost ?? 0
          })),
          promoteTags: res.promoteTags,
          hideTags: res.hideTags,
          tags: res.tags || []
        };
        reset(formData as UpdateSystemToolBodyType);
        setSelectedTags(res.tags || []);
        if (!selectedVersion && res.version) {
          setSelectedVersion(res.version);
        }
      },
      manual: false,
      refreshDeps: [toolId, selectedVersion]
    }
  );

  const {
    data: runtimeConfigData,
    loading: loadingRuntimeConfig,
    runAsync: refreshRuntimeConfig
  } = useRequest(() => getAdminToolRuntimeConfig({ pluginId: toolId }), {
    onSuccess(res) {
      setRuntimeConfig(normalizeRuntimeConfig(res.runtimeConfig));
    },
    manual: false,
    refreshDeps: [toolId]
  });

  // 从表单 watch 可变数据
  const [status, secretsVal, promoteTags, hideTags] = watch([
    'status',
    'secretsVal',
    'promoteTags',
    'hideTags'
  ]);

  // 从 tool 读取只读数据
  const inputList = tool?.secrets;
  const isFolder = tool?.isToolSet;
  const modalWidth = isFolder ? TOOL_SET_MODAL_WIDTH : SINGLE_TOOL_MODAL_WIDTH;

  const { value: selectedTags, setValue: setSelectedTags } = useMultipleSelect<string>(
    tool?.tags ?? [],
    false
  );

  useEffect(() => {
    setValue('tags', selectedTags);
  }, [selectedTags, setValue]);

  // 是否显示系统密钥配置
  const showSystemSecretInput = !!inputList && inputList.length > 0;
  const showRuntimeConfig = runtimeConfigData?.runtimeConfig !== undefined;

  const updateRuntimeConfigField = (key: RuntimeConfigFieldKey, value: string) => {
    setRuntimeConfig((config) => ({
      ...config,
      [key]: value === '' ? '' : Number(value)
    }));
  };

  const buildRuntimeConfig = () => {
    const config = {} as Record<RuntimeConfigFieldKey, number>;

    for (const field of RUNTIME_CONFIG_FIELDS) {
      const value = runtimeConfig[field.key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return Promise.reject(
          t('app:toolkit_runtime_config_invalid_number', {
            label: t(field.labelKey)
          })
        );
      }
      if (value < field.min) {
        return Promise.reject(
          t('app:toolkit_runtime_config_min_value', {
            label: t(field.labelKey),
            min: field.min
          })
        );
      }
      if (!Number.isInteger(value)) {
        return Promise.reject(
          t('app:toolkit_runtime_config_invalid_integer', {
            label: t(field.labelKey)
          })
        );
      }
      config[field.key] = value;
    }

    if (config.minPods > config.maxPods) {
      return Promise.reject(t('app:toolkit_runtime_config_min_pods_over_max_pods'));
    }

    return config;
  };

  // 准备用户标签列表
  const userTagsList = UserTagsSchema.options.map((tag) => ({
    label: tag,
    value: tag
  }));

  const { data: toolTags = [], loading: loadingTags } = useRequest(getPluginToolTags, {
    manual: false
  });

  const pluginTypeSelectList = useMemo(
    () =>
      toolTags?.map((tag) => ({
        label: parseI18nString(tag.tagName, i18n.language),
        value: tag.tagId
      })) || [],
    [i18n.language, toolTags]
  );

  const versionSelectList = useMemo(
    () =>
      toolVersions.map((item) => ({
        label: item.version,
        value: item.version
      })),
    [toolVersions]
  );

  const pluginStatusSelectList = useMemo(
    () => [
      { label: t('app:toolkit_status_normal'), value: PluginStatusEnum.Normal },
      {
        label: t('app:toolkit_status_soon_offline'),
        value: PluginStatusEnum.SoonOffline
      },
      { label: t('app:toolkit_status_offline'), value: PluginStatusEnum.Offline }
    ],
    [t]
  );

  const { runAsync: onSubmit, loading: submitting } = useRequest(
    async (formData: UpdateSystemToolBodyType) => {
      const submitRuntimeConfig = showRuntimeConfig ? await buildRuntimeConfig() : undefined;

      await putAdminUpdateSystemTool({
        ...formData,
        id: toolId
      });
      if (submitRuntimeConfig !== undefined) {
        await putAdminUpdateToolRuntimeConfig({
          pluginId: toolId,
          runtimeConfig: submitRuntimeConfig
        });
      }
    },
    {
      successToast: t('common:Config') + t('common:Success'),
      onSuccess() {
        onSuccess();
        onClose();
      }
    }
  );

  const { runAsync: onResetRuntimeConfig, loading: resettingRuntimeConfig } = useRequest(
    () => postAdminResetToolRuntimeConfig({ pluginId: toolId }),
    {
      successToast: t('common:Reset') + t('common:Success'),
      onSuccess: refreshRuntimeConfig
    }
  );

  // Secret input render
  const renderInputField = (item: InputConfigType) => {
    const labelSection = (
      <HStack>
        <Box position={'relative'} fontSize={'14px'} fontWeight={'500'}>
          {item.required && (
            <Box position={'absolute'} color={'red.600'} left={'-2'} top={'-1'}>
              *
            </Box>
          )}
          {item.label}
        </Box>
        {item.description && <QuestionTip label={item.description} pt={1} />}
      </HStack>
    );

    if (item.inputType === 'switch') {
      return (
        <ConfigRow key={item.key} label={labelSection}>
          <Switch {...register(`secretsVal.${item.key}`)} />
        </ConfigRow>
      );
    }

    return (
      <ConfigRow key={item.key} label={labelSection}>
        <Input
          bg={'white'}
          h={9}
          borderColor={'myGray.200'}
          {...register(`secretsVal.${item.key}`, {
            required: item.required
          })}
        />
      </ConfigRow>
    );
  };

  const systemConfigSection = showSystemSecretInput && !!secretsVal && (
    <Flex flexDirection={'column'} gap={5}>
      {!isFolder && (
        <ConfigRow label={t('app:toolkit_system_key_cost')}>
          <MyNumberInput
            width={'100%'}
            register={register}
            name="systemKeyCost"
            defaultValue={0}
            {...COST_LIMITS}
          />
        </ConfigRow>
      )}
      {inputList?.map(renderInputField)}
    </Flex>
  );

  const runtimeConfigSection = showRuntimeConfig && (
    <SimpleGrid columns={[1, 2]} spacingX={4} spacingY={4}>
      {RUNTIME_CONFIG_FIELDS.map((field) => (
        <Box key={field.key}>
          <Flex alignItems={'center'} gap={1} mb={2}>
            <Box color={'myGray.900'} fontSize={'xs'} fontWeight={'medium'}>
              {t(field.labelKey)}
            </Box>
            <QuestionTip label={t(field.tipKey)} />
          </Flex>
          <Input
            type="number"
            h={'32px'}
            bg={'white'}
            borderColor={'myGray.200'}
            fontSize={'xs'}
            min={field.min}
            step={1}
            value={
              runtimeConfig[field.key] === undefined || runtimeConfig[field.key] === null
                ? ''
                : String(runtimeConfig[field.key])
            }
            onChange={(e) => updateRuntimeConfigField(field.key, e.target.value)}
          />
        </Box>
      ))}
    </SimpleGrid>
  );

  const toolIdContent = (
    <Flex
      alignItems={'center'}
      color={'myGray.400'}
      fontSize={'10px'}
      lineHeight={'14px'}
      fontWeight={'500'}
      gap={2}
      minW={0}
      maxW={'55%'}
    >
      <Box>{t('app:toolkit_id')}:</Box>
      <Box overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
        {tool?.id || toolId}
      </Box>
      <CopyBox value={tool?.id || toolId} lineHeight={0}>
        <MyIcon name={'copy'} w={'12px'} color={'myGray.400'} />
      </CopyBox>
    </Flex>
  );

  const basicConfigSection = (
    <ConfigCard title={t('app:toolkit_basic_config')} rightContent={toolIdContent}>
      <ConfigRow label={t('app:toolkit_plugin_status')}>
        <MySelect<PluginStatusType>
          width={'100%'}
          h={9}
          value={status}
          list={pluginStatusSelectList}
          onChange={(e) => setValue('status', e)}
        />
      </ConfigRow>

      <ConfigRow label={t('app:custom_plugin_tags_label')}>
        <MultipleSelect
          list={pluginTypeSelectList}
          value={selectedTags}
          onSelect={(newTags) => {
            if (newTags.length > 3) {
              toast({
                title: t('app:custom_plugin_tags_max_limit'),
                status: 'warning'
              });
              return;
            }
            setSelectedTags(newTags);
          }}
          placeholder={t('app:custom_plugin_tags_label')}
          w={'100%'}
          h={9}
          borderRadius={'sm'}
          bg={'white'}
        />
      </ConfigRow>

      {showSystemSecretInput && (
        <>
          <ConfigRow label={t('app:toolkit_config_system_key')}>
            <Switch
              isChecked={!!secretsVal}
              onChange={(e) => {
                const val = e.target.checked;
                if (val) {
                  setValue('secretsVal', {});
                } else {
                  setValue('secretsVal', null);
                }
              }}
            />
          </ConfigRow>
          {systemConfigSection}
        </>
      )}

      {feConfigs?.showWecomConfig && (
        <>
          <VerticalField
            label={t('app:toolkit_promote_tags')}
            tip={t('app:toolkit_promote_tags_tip')}
          >
            <MultipleSelect
              list={userTagsList}
              value={promoteTags || []}
              onSelect={(val) => setValue('promoteTags', val)}
              placeholder={t('app:toolkit_select_user_tags')}
              w={'100%'}
              h={9}
              borderRadius={'sm'}
              bg={'white'}
            />
          </VerticalField>

          <VerticalField label={t('app:toolkit_hide_tags')} tip={t('app:toolkit_hide_tags_tip')}>
            <MultipleSelect
              list={userTagsList}
              value={hideTags || []}
              onSelect={(val) => setValue('hideTags', val)}
              placeholder={t('app:toolkit_select_user_tags')}
              w={'100%'}
              h={9}
              borderRadius={'sm'}
              bg={'white'}
            />
          </VerticalField>
        </>
      )}
    </ConfigCard>
  );

  const toolListSection = isFolder && (
    <VerticalField label={t('app:toolkit_tool_list')}>
      <TableContainer border={'1px solid'} borderColor={'myGray.200'} borderRadius={'6px'}>
        <Table size="sm">
          <Thead bg={'myGray.25'}>
            <Tr>
              <Th fontSize="12px" py={2} px={3} color={'myGray.500'} textTransform={'none'}>
                {t('app:toolkit_tool_name')}
              </Th>
              <Th
                fontSize="12px"
                py={2}
                px={3}
                width="50%"
                color={'myGray.500'}
                textTransform={'none'}
              >
                {t('app:toolkit_key_price')}
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {tool?.children?.map((childTool: ChildToolConfigItem, index: number) => {
              return (
                <Tr key={childTool.id}>
                  <Td fontSize="12px" color={'myGray.500'} py={2} px={3}>
                    <Text fontSize="12px">{childTool.name}</Text>
                  </Td>
                  <Td fontSize="12px" py={1} px={3}>
                    <MyNumberInput
                      width={'160px'}
                      h={'28px'}
                      register={register}
                      defaultValue={0}
                      name={`children.${index}.systemKeyCost`}
                      {...COST_LIMITS}
                    />
                    <Input
                      type="hidden"
                      {...register(`children.${index}.id`)}
                      value={childTool.id}
                    />
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </TableContainer>
    </VerticalField>
  );

  const versionInfoSection = (
    <ConfigCard title={t('app:toolkit_version_info')}>
      <ConfigRow label={t('app:toolkit_plugin_version')}>
        <MySelect<string>
          width={'100%'}
          h={9}
          value={selectedVersion || tool?.version}
          list={versionSelectList}
          isLoading={loadingVersions}
          onChange={(version) => setSelectedVersion(version)}
        />
      </ConfigRow>

      <ConfigRow label={t('app:toolkit_plugin_name')}>
        <Box color={'#24282C'} fontSize={'14px'} lineHeight={'20px'}>
          {tool?.name || '-'}
        </Box>
      </ConfigRow>

      <ConfigRow label={t('app:toolkit_plugin_intro')} align={'flex-start'}>
        <Text color={'#24282C'} fontSize={'14px'} lineHeight={'20px'} whiteSpace={'pre-wrap'}>
          {tool?.intro || '-'}
        </Text>
      </ConfigRow>
      {toolListSection}
    </ConfigCard>
  );

  return (
    <MyModal
      isOpen
      isLoading={loading || loadingTags || loadingVersions || loadingRuntimeConfig}
      onClose={onClose}
      width={modalWidth}
      maxW={['92vw', modalWidth]}
      bg={'white'}
      borderRadius={'10px'}
      overflow={'hidden'}
    >
      <Box
        flexShrink={0}
        px={8}
        pr={12}
        pt={8}
        pb={6}
        color={'black'}
        fontSize={'20px'}
        lineHeight={'26px'}
        fontWeight={'500'}
      >
        {t('app:toolkit_tool_config', { name: tool?.name })}
      </Box>
      <ModalBody flex={1} minH={0} overflowY={'auto'} px={8} pt={0} pb={0}>
        <Tabs variant={'unstyled'} index={tabIndex} onChange={setTabIndex}>
          <TabList
            position={'sticky'}
            top={0}
            zIndex={1}
            bg={'white'}
            borderBottom={'1px solid'}
            borderColor={'myGray.200'}
          >
            <Tab
              px={0}
              mr={8}
              pb={2}
              color={'myGray.600'}
              borderBottom={'2px solid transparent'}
              _selected={{ color: 'primary.600', borderBottomColor: 'primary.600' }}
              fontWeight={'600'}
            >
              {t('app:toolkit_plugin_config')}
            </Tab>
            <Tab
              px={0}
              pb={2}
              color={'myGray.600'}
              borderBottom={'2px solid transparent'}
              _selected={{ color: 'primary.600', borderBottomColor: 'primary.600' }}
              fontWeight={'600'}
            >
              {t('app:toolkit_runtime_config')}
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel px={0} pt={6} pb={0}>
              <Flex flexDirection={'column'} gap={6}>
                {basicConfigSection}
                {versionInfoSection}
              </Flex>
            </TabPanel>
            <TabPanel px={0} pt={6} pb={0}>
              {runtimeConfigSection || (
                <Box color={'myGray.500'} fontSize={'sm'}>
                  {t('app:toolkit_no_runtime_config')}
                </Box>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </ModalBody>
      <ModalFooter flexShrink={0} justifyContent={'space-between'} px={8} py={6}>
        <Box>
          {showRuntimeConfig && tabIndex === 1 && (
            <PopoverConfirm
              type="info"
              content={t('app:toolkit_reset_runtime_config_confirm')}
              onConfirm={onResetRuntimeConfig}
              Trigger={
                <Button
                  variant={'whiteBase'}
                  h={'32px'}
                  px={'14px'}
                  isLoading={resettingRuntimeConfig}
                >
                  {t('common:Reset')}
                </Button>
              }
            />
          )}
        </Box>
        <Flex gap={3}>
          <Button variant={'whiteBase'} w={'64px'} h={'32px'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button w={'64px'} h={'32px'} isLoading={submitting} onClick={handleSubmit(onSubmit)}>
            {t('common:Confirm')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default SystemToolConfigModal;

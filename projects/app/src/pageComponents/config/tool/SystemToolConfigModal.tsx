import React, { useEffect, useMemo } from 'react';
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
  TableContainer
} from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { deletePkgPlugin } from '@/web/core/plugin/admin/api';
import { getAdminSystemToolDetail, putAdminUpdateTool } from '@/web/core/plugin/admin/tool/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { UserTagsEnum } from '@fastgpt/global/support/user/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { UpdateToolBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

const COST_LIMITS = { max: 1000, min: 0, step: 0.1 };

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
  const { register, reset, handleSubmit, setValue, watch } = useForm<UpdateToolBodyType>();

  const { data: tool, loading } = useRequest(() => getAdminSystemToolDetail({ toolId }), {
    onSuccess(res) {
      // 转换 AdminSystemToolDetailType 到 UpdateToolBodyType
      const formData: Partial<UpdateToolBodyType> = {
        status: res.status,
        defaultInstalled: res.defaultInstalled,
        inputListVal: res.inputListVal,
        systemKeyCost: res.systemKeyCost,
        childTools: res.childTools?.map((t) => ({
          pluginId: t.pluginId,
          systemKeyCost: t.systemKeyCost
        })),
        promoteTags: res.promoteTags,
        hideTags: res.hideTags,
        tagIds: res.tags || []
      };
      reset(formData);
      setSelectedTags(res.tags || []);
    },
    manual: false
  });

  // 从表单 watch 可变数据
  const [status, defaultInstalled, inputListVal, promoteTags, hideTags] = watch([
    'status',
    'defaultInstalled',
    'inputListVal',
    'promoteTags',
    'hideTags'
  ]);

  // 从 tool 读取只读数据
  const inputList = tool?.inputList;
  const isFolder = tool?.isFolder;

  const { value: selectedTags, setValue: setSelectedTags } = useMultipleSelect<string>(
    tool?.tags ?? [],
    false
  );

  useEffect(() => {
    setValue('tagIds', selectedTags);
  }, [selectedTags, setValue]);

  // 是否显示系统密钥配置
  const showSystemSecretInput = !!inputList && inputList.length > 0;

  // 准备用户标签列表
  const userTagsList = UserTagsEnum.options.map((tag) => ({
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

  const { runAsync: onSubmit, loading: submitting } = useRequest(
    (formData: UpdateToolBodyType) =>
      putAdminUpdateTool({
        ...formData,
        pluginId: toolId
      }),
    {
      successToast: t('common:Config') + t('common:Success'),
      onSuccess() {
        onSuccess();
        onClose();
      }
    }
  );

  const { runAsync: onDelete, loading: deleteLoading } = useRequest(
    () => deletePkgPlugin({ toolId: toolId.split('-')[1] }),
    {
      onSuccess() {
        onSuccess();
        onClose();
      }
    }
  );

  // Secret input render
  const renderInputField = (item: InputConfigType) => {
    const labelSection = (
      <HStack>
        <Box position={'relative'} fontSize={'sm'} fontWeight={'medium'}>
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
        <Box key={item.key}>
          {labelSection}
          <Box mt={1}>
            <Switch {...register(`inputListVal.${item.key}`)} />
          </Box>
        </Box>
      );
    }

    return (
      <Box key={item.key}>
        {labelSection}
        <Box mt={1}>
          <Input
            bg={'myGray.50'}
            {...register(`inputListVal.${item.key}`, {
              required: item.required
            })}
          />
        </Box>
      </Box>
    );
  };

  const systemConfigSection = showSystemSecretInput && !!inputListVal && (
    <>
      <MyDivider my={2} />

      {!isFolder && (
        <HStack>
          <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
            {t('app:toolkit_system_key_cost')}
          </Box>
          <MyNumberInput
            width={'100px'}
            register={register}
            name="systemKeyCost"
            defaultValue={0}
            {...COST_LIMITS}
          />
        </HStack>
      )}
      {inputList?.map(renderInputField)}
    </>
  );

  return (
    <MyModal
      isOpen
      isLoading={loading || loadingTags}
      title={t('app:toolkit_tool_config', { name: tool?.name })}
      iconSrc={tool?.avatar}
      onClose={onClose}
      width={isFolder ? '900px' : '450px'}
      height={isFolder ? '500px' : 'auto'}
      maxW={isFolder ? '900px' : '600px'}
      bg={'white'}
    >
      <ModalBody>
        {isFolder ? (
          <Flex gap={5}>
            <Flex flexDirection={'column'} gap={5} flex={'0 0 300px'}>
              <Box fontWeight={'medium'} color={'myGray.900'}>
                {t('app:toolkit_basic_config')}
              </Box>

              <HStack>
                <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                  {t('app:toolkit_plugin_status')}
                </Box>
                <MySelect<PluginStatusEnum>
                  width={'120px'}
                  value={status}
                  list={[
                    { label: t('app:toolkit_status_normal'), value: PluginStatusEnum.Normal },
                    {
                      label: t('app:toolkit_status_soon_offline'),
                      value: PluginStatusEnum.SoonOffline
                    },
                    { label: t('app:toolkit_status_offline'), value: PluginStatusEnum.Offline }
                  ]}
                  onChange={(e) => {
                    setValue('status', e);
                    if (e !== PluginStatusEnum.Normal) {
                      setValue('defaultInstalled', false);
                    }
                  }}
                />
              </HStack>

              <HStack>
                <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                  {t('app:toolkit_default_install')}
                </Box>
                <Switch
                  isChecked={defaultInstalled}
                  onChange={(e) => {
                    const newDefaultInstalled = e.target.checked;
                    setValue('defaultInstalled', newDefaultInstalled);
                    if (newDefaultInstalled && status !== PluginStatusEnum.Normal) {
                      setValue('status', PluginStatusEnum.Normal);
                    }
                  }}
                />
              </HStack>

              <Box>
                <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
                  {t('app:custom_plugin_tags_label')}
                </Box>
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
                />
              </Box>

              {showSystemSecretInput && (
                <>
                  <HStack>
                    <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                      {t('app:toolkit_config_system_key')}
                    </Box>
                    <Switch
                      isChecked={!!inputListVal}
                      onChange={(e) => {
                        const val = e.target.checked;
                        if (val) {
                          setValue('inputListVal', {});
                        } else {
                          setValue('inputListVal', null);
                        }
                      }}
                    />
                  </HStack>
                  {systemConfigSection}
                </>
              )}

              {feConfigs?.showWecomConfig && (
                <>
                  <Box>
                    <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
                      {t('app:toolkit_promote_tags')}
                    </Box>
                    <Box color={'myGray.500'} fontSize={'xs'} mb={2}>
                      {t('app:toolkit_promote_tags_tip')}
                    </Box>
                    <MultipleSelect
                      list={userTagsList}
                      value={promoteTags || []}
                      onSelect={(val) => setValue('promoteTags', val)}
                      placeholder={t('app:toolkit_select_user_tags')}
                      w={'100%'}
                    />
                  </Box>

                  <Box>
                    <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
                      {t('app:toolkit_hide_tags')}
                    </Box>
                    <Box color={'myGray.500'} fontSize={'xs'} mb={2}>
                      {t('app:toolkit_hide_tags_tip')}
                    </Box>
                    <MultipleSelect
                      list={userTagsList}
                      value={hideTags || []}
                      onSelect={(val) => setValue('hideTags', val)}
                      placeholder={t('app:toolkit_select_user_tags')}
                      w={'100%'}
                    />
                  </Box>
                </>
              )}
            </Flex>

            <Flex flex={'3 0 0'} flexDirection={'column'}>
              <Box mb={4} fontWeight={'medium'} color={'myGray.900'}>
                {t('app:toolkit_tool_list')}
              </Box>
              <TableContainer>
                <Table size="sm">
                  <Thead bg={'myGray.50'}>
                    <Tr>
                      <Th fontSize="xs" py={2} px={2} width="50px">
                        {t('app:toolkit_tool_name')}
                      </Th>
                      <Th fontSize="xs" py={2} px={2} width="50px">
                        {t('app:toolkit_key_price')}
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {tool?.childTools?.map((childTool, index) => {
                      return (
                        <Tr key={childTool.pluginId}>
                          <Td fontSize="xs">
                            <Text fontSize="xs" fontWeight="medium">
                              {childTool.name}
                            </Text>
                          </Td>
                          <Td fontSize="xs">
                            <MyNumberInput
                              width={'100px'}
                              register={register}
                              defaultValue={0}
                              name={`childTools.${index}.systemKeyCost`}
                              {...COST_LIMITS}
                            />
                            <Input
                              type="hidden"
                              {...register(`childTools.${index}.pluginId`)}
                              value={childTool.pluginId}
                            />
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableContainer>
            </Flex>
          </Flex>
        ) : (
          <Flex flexDirection={'column'} gap={5}>
            <HStack>
              <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                {t('app:toolkit_plugin_status')}
              </Box>
              <MySelect<PluginStatusEnum>
                width={'120px'}
                value={status}
                list={[
                  { label: t('app:toolkit_status_normal'), value: PluginStatusEnum.Normal },
                  {
                    label: t('app:toolkit_status_soon_offline'),
                    value: PluginStatusEnum.SoonOffline
                  },
                  { label: t('app:toolkit_status_offline'), value: PluginStatusEnum.Offline }
                ]}
                onChange={(e) => {
                  setValue('status', e);
                  if (e !== PluginStatusEnum.Normal) {
                    setValue('defaultInstalled', false);
                  }
                }}
              />
            </HStack>

            <HStack>
              <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                {t('app:toolkit_default_install')}
              </Box>
              <Switch
                isChecked={defaultInstalled}
                onChange={(e) => {
                  const newDefaultInstalled = e.target.checked;
                  setValue('defaultInstalled', newDefaultInstalled);
                  if (newDefaultInstalled && status !== PluginStatusEnum.Normal) {
                    setValue('status', PluginStatusEnum.Normal);
                  }
                }}
              />
            </HStack>

            {showSystemSecretInput && (
              <>
                <HStack>
                  <Box flex={1} fontSize={'sm'} fontWeight={'medium'}>
                    {t('app:toolkit_config_system_key')}
                  </Box>
                  <Switch
                    isChecked={!!inputListVal}
                    onChange={(e) => {
                      const val = e.target.checked;
                      if (val) {
                        setValue('inputListVal', {});
                      } else {
                        setValue('inputListVal', null);
                      }
                    }}
                  />
                </HStack>
                {systemConfigSection}
              </>
            )}

            <HStack>
              <Box
                flex={'0 0 160px'}
                color={'myGray.900'}
                fontWeight={'medium'}
                fontSize={'sm'}
                mb={2}
              >
                {t('app:custom_plugin_tags_label')}
              </Box>
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
                maxW={270}
                h={9}
                borderRadius={'sm'}
                bg={'myGray.50'}
              />
            </HStack>

            {feConfigs?.showWecomConfig && (
              <>
                <Box>
                  <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
                    {t('app:toolkit_promote_tags')}
                  </Box>
                  <Box color={'myGray.500'} fontSize={'xs'} mb={2}>
                    {t('app:toolkit_promote_tags_tip')}
                  </Box>
                  <MultipleSelect
                    list={userTagsList}
                    value={promoteTags || []}
                    onSelect={(val) => setValue('promoteTags', val)}
                    placeholder={t('app:toolkit_select_user_tags')}
                    w={'100%'}
                  />
                </Box>

                <Box>
                  <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
                    {t('app:toolkit_hide_tags')}
                  </Box>
                  <Box color={'myGray.500'} fontSize={'xs'} mb={2}>
                    {t('app:toolkit_hide_tags_tip')}
                  </Box>
                  <MultipleSelect
                    list={userTagsList}
                    value={hideTags || []}
                    onSelect={(val) => setValue('hideTags', val)}
                    placeholder={t('app:toolkit_select_user_tags')}
                    w={'100%'}
                  />
                </Box>
              </>
            )}
          </Flex>
        )}
      </ModalBody>
      <ModalFooter gap={4} justifyContent={'space-between'}>
        <PopoverConfirm
          type="delete"
          content={t('app:confirm_delete_tool')}
          onConfirm={onDelete}
          Trigger={
            <Button variant={'whiteDanger'} isLoading={deleteLoading}>
              {t('common:Delete')}
            </Button>
          }
        />

        <Flex gap={4}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button isLoading={submitting} onClick={handleSubmit(onSubmit)}>
            {t('common:Confirm')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default SystemToolConfigModal;

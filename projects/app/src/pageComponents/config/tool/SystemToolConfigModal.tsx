import React from 'react';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { deletePkgPlugin } from '@/web/core/plugin/admin/api';
import { getAdminSystemToolDetail, putAdminUpdateTool } from '@/web/core/plugin/admin/tool/api';
import type { AdminSystemToolDetailType } from '@fastgpt/global/core/plugin/admin/tool/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';

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
  const { t } = useTranslation();
  const { register, reset, handleSubmit, setValue, watch, control } =
    useForm<AdminSystemToolDetailType>();

  const { data: tool, loading } = useRequest2(() => getAdminSystemToolDetail({ toolId }), {
    onSuccess(res) {
      reset(res);
    },
    manual: false
  });

  const [inputList, status, defaultInstalled, inputListVal, childTools] = watch([
    'inputList',
    'status',
    'defaultInstalled',
    'inputListVal',
    'childTools'
  ]);

  // 是否显示系统密钥配置
  const showSystemSecretInput = !!inputList && inputList.length > 0;

  const { runAsync: onSubmit, loading: submitting } = useRequest2(
    (formData: AdminSystemToolDetailType) =>
      putAdminUpdateTool({
        ...formData,
        pluginId: toolId,
        childTools: formData.childTools?.map((tool) => {
          return {
            pluginId: tool.pluginId,
            systemKeyCost: tool.systemKeyCost
          };
        })
      }),
    {
      successToast: t('common:Config') + t('common:Success'),
      onSuccess() {
        onSuccess();
        onClose();
      }
    }
  );

  const { runAsync: onDelete, loading: deleteLoading } = useRequest2(
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

      {!tool?.isFolder && (
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
      {tool?.inputList?.map(renderInputField)}
    </>
  );

  return (
    <MyModal
      isOpen
      isLoading={loading}
      title={t('app:toolkit_tool_config', { name: tool?.name })}
      iconSrc={tool?.avatar}
      onClose={onClose}
      width={tool?.isFolder ? '900px' : '450px'}
      height={tool?.isFolder ? '500px' : 'auto'}
      maxW={tool?.isFolder ? '900px' : '600px'}
      bg={'white'}
    >
      <ModalBody>
        {tool?.isFolder ? (
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
                      {/* <Th fontSize="xs" py={2} px={2} width="50px">
                        {t('common:Status')}
                      </Th> */}
                      <Th fontSize="xs" py={2} px={2} width="50px">
                        {t('app:toolkit_key_price')}
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {childTools?.map((tool, index) => {
                      return (
                        <Tr key={tool.pluginId}>
                          <Td fontSize="xs">
                            <Text fontSize="xs" fontWeight="medium">
                              {parseI18nString(tool.name)}
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
                        // @ts-ignore
                        setValue('inputListVal', {});
                      } else {
                        setValue('inputListVal', undefined);
                      }
                    }}
                  />
                </HStack>
                {systemConfigSection}
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

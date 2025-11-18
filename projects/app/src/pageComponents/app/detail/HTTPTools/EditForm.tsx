import {
  Box,
  Button,
  Center,
  Flex,
  ModalBody,
  ModalFooter,
  Switch,
  useDisclosure
} from '@chakra-ui/react';
import React, { useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { AppContext } from '../context';
import { useContextSelector } from 'use-context-selector';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { putUpdateHttpPlugin } from '@/web/core/app/api/tool';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import SchemaConfigModal from './SchemaConfigModal';
import ManualToolModal from './ManualToolModal';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { UpdateHttpPluginBody } from '@/pages/api/core/app/httpTools/update';

const EditForm = ({
  currentTool,
  setCurrentTool,
  toolList,
  baseUrl,
  headerSecret,
  customHeaders,
  apiSchemaStr
}: {
  currentTool?: HttpToolConfigType;
  setCurrentTool?: (tool: HttpToolConfigType) => void;
  toolList?: HttpToolConfigType[];
  baseUrl?: string;
  headerSecret?: StoreSecretValueType;
  customHeaders?: string;
  apiSchemaStr?: string;
}) => {
  const { t } = useTranslation();

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

  const [toolDetail, setToolDetail] = useState<HttpToolConfigType | null>(null);
  const [editingManualTool, setEditingManualTool] = useState<HttpToolConfigType | null>(null);

  const isBatchMode = apiSchemaStr !== undefined;

  const {
    onOpen: onOpenConfigModal,
    isOpen: isOpenConfigModal,
    onClose: onCloseConfigModal
  } = useDisclosure();

  const { runAsync: runDeleteHttpTool, loading: isDeletingTool } = useRequest2(
    async (updatedToolList: HttpToolConfigType[]) =>
      await putUpdateHttpPlugin({
        appId: appDetail._id,
        toolList: updatedToolList
      }),
    {
      manual: true,
      onSuccess: () => {
        reloadApp();
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  return (
    <>
      <Box p={6}>
        <Flex alignItems={'center'}>
          <MyIcon name={'common/list'} w={'20px'} color={'primary.600'} />
          <FormLabel ml={2} flex={1}>
            {t('app:HTTP_tools_list_with_number', {
              total: toolList?.length || 0
            })}
          </FormLabel>
          {isBatchMode ? (
            <Button
              px={'2'}
              leftIcon={
                <MyIcon
                  name={toolList?.length && toolList.length > 0 ? 'change' : 'common/setting'}
                  w={'18px'}
                />
              }
              onClick={onOpenConfigModal}
            >
              {toolList?.length && toolList.length > 0 ? t('common:Config') : t('app:Start_config')}
            </Button>
          ) : (
            <Button
              px={'2'}
              leftIcon={<MyIcon name={'common/addLight'} w={'18px'} />}
              onClick={() =>
                setEditingManualTool({
                  name: '',
                  description: '',
                  inputSchema: { type: 'object' },
                  outputSchema: { type: 'object' },
                  path: '',
                  method: 'POST'
                })
              }
            >
              {t('common:Add')}
            </Button>
          )}
        </Flex>

        <MyBox mt={3} isLoading={isDeletingTool}>
          {toolList && toolList.length > 0 ? (
            toolList.map((tool, index) => {
              return (
                <MyBox
                  key={tool.name}
                  role="group"
                  position="relative"
                  border={'1px solid'}
                  {...(currentTool?.name === tool.name
                    ? {
                        borderRadius: '8px',
                        borderColor: 'primary.600',
                        borderBottomColor: 'primary.600',
                        boxShadow:
                          '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                      }
                    : {
                        borderRadius: 'none',
                        borderColor: 'transparent',
                        borderBottomColor: 'myGray.150',
                        boxShadow: 'none'
                      })}
                  _hover={{
                    borderRadius: '8px',
                    boxShadow:
                      '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                  }}
                  cursor={'pointer'}
                  onClick={() => {
                    setCurrentTool?.(tool);
                  }}
                >
                  <Flex alignItems={'center'} py={3} px={3}>
                    <Box maxW={'full'} pl={2} position="relative" width="calc(100% - 30px)">
                      <Flex alignItems="center" gap={2} mb={1} w={'full'}>
                        <Box flex={'0 0 40px'}>{renderHttpMethod(tool.method)}</Box>
                        <Box
                          color={'myGray.900'}
                          fontSize={'14px'}
                          lineHeight={'20px'}
                          letterSpacing={'0.25px'}
                          whiteSpace={'nowrap'}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                          maxW={'200px'}
                        >
                          {tool.name}
                        </Box>
                        <Box w={'1px'} h={'12px'} bg={'myGray.250'}></Box>
                        <Box
                          color={'myGray.600'}
                          fontSize={'14px'}
                          lineHeight={'20px'}
                          letterSpacing={'0.25px'}
                          whiteSpace={'nowrap'}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                          maxW={'200px'}
                        >
                          {tool.path}
                        </Box>
                      </Flex>
                      <Box
                        overflow="hidden"
                        whiteSpace="nowrap"
                        color={'myGray.500'}
                        textOverflow="ellipsis"
                        fontSize={'12px'}
                        lineHeight={'16px'}
                        letterSpacing={'0.048px'}
                      >
                        {tool.description || t('app:tools_no_description')}
                      </Box>
                    </Box>
                    <Box flex={1} />
                  </Flex>

                  <Flex
                    position="absolute"
                    right={3}
                    top="50%"
                    transform="translateY(-50%)"
                    gap={2}
                    display="none"
                    _groupHover={{ display: 'flex' }}
                    bg="linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 15%, rgba(255,255,255,1) 100%)"
                    paddingLeft="20px"
                  >
                    {isBatchMode ? (
                      <MyIconButton
                        size={'16px'}
                        icon={'common/detail'}
                        p={2}
                        border={'1px solid'}
                        borderColor={'myGray.250'}
                        hoverBg={'rgba(51, 112, 255, 0.10)'}
                        hoverBorderColor={'primary.300'}
                        tip={t('app:HTTP_tools_detail')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setToolDetail(tool);
                        }}
                      />
                    ) : (
                      <>
                        <MyIconButton
                          size={'16px'}
                          icon={'edit'}
                          p={2}
                          border={'1px solid'}
                          borderColor={'myGray.250'}
                          hoverBg={'rgba(51, 112, 255, 0.10)'}
                          hoverBorderColor={'primary.300'}
                          tip={t('common:Edit')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingManualTool(tool);
                          }}
                        />
                        <MyIconButton
                          size={'16px'}
                          icon={'delete'}
                          p={2}
                          border={'1px solid'}
                          borderColor={'myGray.250'}
                          _hover={{
                            color: 'red.500',
                            bg: 'rgba(255, 0, 0, 0.10)',
                            borderColor: 'red.300'
                          }}
                          tip={t('common:Delete')}
                          onClick={(e) => {
                            e.stopPropagation();
                            const updatedToolList =
                              toolList?.filter((t) => t.name !== tool.name) || [];
                            runDeleteHttpTool(updatedToolList);
                          }}
                        />
                      </>
                    )}
                  </Flex>
                </MyBox>
              );
            })
          ) : (
            <Center h={24} fontSize={'14px'}>
              {isBatchMode ? t('app:http_toolset_config_tips') : t('app:http_toolset_add_tips')}
            </Center>
          )}
        </MyBox>
      </Box>

      {isOpenConfigModal && <SchemaConfigModal onClose={onCloseConfigModal} />}
      {toolDetail && (
        <ToolDetailModal
          tool={toolDetail}
          onClose={() => setToolDetail(null)}
          toolList={toolList || []}
          baseUrl={baseUrl || ''}
          apiSchemaStr={apiSchemaStr || ''}
          headerSecret={headerSecret || {}}
          customHeaders={customHeaders || '{}'}
        />
      )}
      {editingManualTool && (
        <ManualToolModal
          onClose={() => setEditingManualTool(null)}
          editingTool={editingManualTool}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);

const ToolDetailModal = ({
  tool,
  onClose,
  toolList,
  baseUrl,
  apiSchemaStr,
  headerSecret,
  customHeaders
}: {
  tool: HttpToolConfigType;
  onClose: () => void;
  toolList: HttpToolConfigType[];
  baseUrl: string;
  apiSchemaStr: string;
  headerSecret: StoreSecretValueType;
  customHeaders: string;
}) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const reloadApp = useContextSelector(AppContext, (v) => v.reloadApp);

  const [enabledParams, setEnabledParams] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    Object.entries(tool.inputSchema.properties || {}).forEach(([key, value]) => {
      if (value['x-tool-description'] !== '') {
        initial.add(key);
      }
    });
    return initial;
  });

  const { runAsync: runUpdateHttpPlugin, loading: isUpdating } = useRequest2(
    async (data: UpdateHttpPluginBody) => await putUpdateHttpPlugin(data),
    {
      manual: true,
      successToast: t('common:update_success'),
      onSuccess: () => {
        onClose();
        reloadApp();
      },
      errorToast: t('common:update_failed')
    }
  );

  return (
    <MyModal
      isOpen={true}
      iconSrc="common/detail"
      iconColor={'primary.600'}
      title={t('app:tool_detail')}
      onClose={onClose}
      w={'530px'}
    >
      <ModalBody pt={0}>
        <Flex py={6} borderBottom={'1px solid'} borderColor={'myGray.200'}>
          <Avatar src={appDetail.avatar} borderRadius={'md'} w={'40px'} />
          <Box ml={'14px'}>
            <Box fontSize={'16px'} color={'myGray.900'}>
              {tool.name}
            </Box>
            <Box fontSize={'12px'} color={'myGray.500'}>
              {tool.description}
            </Box>
          </Box>
        </Flex>

        <Flex
          py={'16px'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          gap={2}
          alignItems={'center'}
        >
          <Box>{renderHttpMethod(tool.method)}</Box>
          <Box
            color={'myGray.600'}
            fontSize={'14px'}
            fontStyle={'normal'}
            fontWeight={'400'}
            lineHeight={'20px'}
            letterSpacing={'0.25px'}
          >
            {tool.path}
          </Box>
        </Flex>

        <Box mt={6} color={'myGray.900'} fontWeight={'medium'}>
          {t('common:Params')}
        </Box>

        <Flex
          justifyContent={'space-between'}
          my={2}
          py={'10px'}
          px={3}
          borderRadius={'6px'}
          bg={'myGray.100'}
          color={'myGray.600'}
          fontSize={'12px'}
          fontWeight={'500'}
        >
          <Box>{t('workflow:tool_params.params_description')}</Box>
          <Box display={'flex'} alignItems={'center'} gap={1}>
            {t('workflow:field_used_as_tool_input')}
            <QuestionTip label={t('app:tool_tip')} />
          </Box>
        </Flex>

        <Box mt={3} px={3}>
          {Object.entries(tool.inputSchema.properties || {}).map(
            ([paramName, paramInfo]: [string, any]) => (
              <Box
                key={paramName}
                py={2}
                borderBottom={'1px solid'}
                borderColor={'myGray.150'}
                display={'flex'}
                justifyContent={'space-between'}
                alignItems={'center'}
              >
                <Box pr={4}>
                  <Flex alignItems="center">
                    {tool.inputSchema.required?.includes(paramName) && (
                      <Box mr={1} color="red.500">
                        *
                      </Box>
                    )}
                    <Box fontSize="14px" color="myGray.900">
                      {paramName}
                    </Box>

                    <Box
                      ml={1}
                      fontSize={'12px'}
                      color={'myGray.600'}
                      px={1}
                      bg={'myGray.25'}
                      borderRadius={'sm'}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                    >
                      {paramInfo.type}
                    </Box>
                  </Flex>
                  <Box mt={1} fontSize="13px" color="myGray.600">
                    {paramInfo.description}
                  </Box>
                </Box>
                <Switch
                  isChecked={enabledParams.has(paramName)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnabledParams((prev) => {
                      const next = new Set(prev);
                      if (checked) {
                        next.add(paramName);
                      } else {
                        next.delete(paramName);
                      }
                      return next;
                    });
                  }}
                />
              </Box>
            )
          )}
        </Box>
      </ModalBody>
      <ModalFooter mx={'28px'} px={0} gap={3}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Close')}
        </Button>
        {Object.keys(tool.inputSchema.properties || {}).length > 0 && (
          <Button
            size={'md'}
            isLoading={isUpdating}
            onClick={() => {
              const updatedTool = {
                ...tool,
                inputSchema: {
                  ...tool.inputSchema,
                  properties: Object.fromEntries(
                    Object.entries(tool.inputSchema.properties || {}).map(([key, value]) => [
                      key,
                      {
                        ...value,
                        'x-tool-description': enabledParams.has(key) ? value.description || key : ''
                      }
                    ])
                  )
                }
              };

              const updatedToolList = toolList.map((item) =>
                item.name === tool.name ? updatedTool : item
              );

              runUpdateHttpPlugin({
                appId: appDetail._id,
                toolList: updatedToolList,
                baseUrl,
                apiSchemaStr,
                headerSecret,
                customHeaders
              });
            }}
          >
            {t('common:Confirm')}
          </Button>
        )}
      </ModalFooter>
    </MyModal>
  );
};

const renderHttpMethod = (method?: string) => {
  if (!method) return null;

  const HTTP_METHOD_STYLES = {
    GET: { bg: 'green.50', color: 'green.600' },
    POST: { bg: 'yellow.50', color: 'yellow.600' },
    PUT: { bg: 'blue.50', color: 'blue.600' },
    DELETE: { bg: 'red.50', color: 'red.600' },
    PATCH: { bg: 'adora.50', color: 'adora.600' },
    DEFAULT: { bg: 'adora.50', color: 'adora.600' }
  };

  const methodUpper = method.toUpperCase();
  const style =
    HTTP_METHOD_STYLES[methodUpper as keyof typeof HTTP_METHOD_STYLES] ||
    HTTP_METHOD_STYLES.DEFAULT;

  return (
    <Box
      display="inline-flex"
      padding="2px 4px"
      justifyContent="center"
      alignItems="center"
      borderRadius="4px"
      fontSize="12px"
      fontWeight="500"
      lineHeight="16px"
      {...style}
    >
      {methodUpper}
    </Box>
  );
};

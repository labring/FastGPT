import { Box, Button, Flex, Input, ModalBody, ModalFooter, Switch } from '@chakra-ui/react';
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
import ParamsAuthConfig from '@/components/common/secret/ParamsAuthConfig';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { POST, GET, PUT, DELETE, PATCH, OTHER } from '../HTTPMethodComponents';
import { putUpdateHttpPlugin } from '@/web/core/app/api/plugin';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const EditForm = ({
  url,
  setUrl,
  toolList,
  setToolList,
  currentTool,
  setCurrentTool,
  headerSecret,
  setHeaderSecret,
  createType
}: {
  url: string;
  setUrl: (url: string) => void;
  toolList: HttpToolConfigType[];
  setToolList: (toolList: HttpToolConfigType[]) => void;
  currentTool?: HttpToolConfigType;
  setCurrentTool: (tool: HttpToolConfigType) => void;
  headerSecret: StoreSecretValueType;
  setHeaderSecret: (headerSecret: StoreSecretValueType) => void;
  createType: 'batch' | 'manual';
}) => {
  const { t } = useTranslation();

  const [toolDetail, setToolDetail] = useState<HttpToolConfigType | null>(null);
  const [toolParamEnabledMap, setToolParamEnabledMap] = useState<
    Record<string, Record<string, boolean>>
  >({});

  return (
    <>
      <Box p={6}>
        <Flex alignItems={'center'}>
          <MyIcon name={'common/list'} w={'20px'} color={'primary.600'} />
          <FormLabel ml={2} flex={1}>
            {t('app:HTTP_tools_list_with_number', {
              total: toolList.length || 0
            })}
          </FormLabel>
          <ParamsAuthConfig
            storeHeaderSecretConfig={headerSecret}
            onUpdate={setHeaderSecret}
            buttonProps={{
              padding: '8px 14px'
            }}
            onSaved={({ url: newUrl, toolList: newList }) => {
              setUrl(newUrl || '');
              setToolList(newList || []);
              if (newList?.length) setCurrentTool(newList[0]);
            }}
            haveTool={toolList.length > 0}
          />
        </Flex>

        <Box mt={3}>
          {toolList.map((tool, index) => {
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
                  setCurrentTool(tool);
                }}
              >
                <Flex alignItems={'center'} py={3} px={3}>
                  <Box maxW={'full'} pl={2} position="relative" width="calc(100% - 30px)">
                    <Flex alignItems="center" gap={2} mb={1}>
                      <Box>{renderHttpMethod(tool.method)}</Box>
                      <Box
                        color={'myGray.900'}
                        fontFamily={'PingFang SC'}
                        fontSize={'14px'}
                        fontStyle={'normal'}
                        fontWeight={'400'}
                        lineHeight={'20px'}
                        letterSpacing={'0.25px'}
                      >
                        {tool.name}
                      </Box>
                      {/* line */}
                      <Box w={'1px'} h={'12px'} bg={'myGray.250'}></Box>
                      <Box
                        color={'myGray.600'}
                        fontFamily={'PingFang SC'}
                        fontSize={'14px'}
                        fontStyle={'normal'}
                        fontWeight={'400'}
                        lineHeight={'20px'}
                        letterSpacing={'0.25px'}
                      >
                        {tool.path}
                      </Box>
                    </Flex>
                    <Box
                      overflow="hidden"
                      whiteSpace="nowrap"
                      color={'myGray.500'}
                      textOverflow="ellipsis"
                      fontFamily={'PingFang SC'}
                      fontSize={'12px'}
                      fontStyle={'normal'}
                      fontWeight={'400'}
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
                  background="linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 15%, rgba(255,255,255,1) 100%)"
                  paddingLeft="20px"
                >
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
                </Flex>
              </MyBox>
            );
          })}
        </Box>
      </Box>

      {toolDetail && (
        <ToolDetailModal
          tool={toolDetail}
          onClose={() => setToolDetail(null)}
          paramEnabled={toolParamEnabledMap[toolDetail.name] || {}}
          setParamEnabled={(params) =>
            setToolParamEnabledMap((prev) => ({
              ...prev,
              [toolDetail.name]: params
            }))
          }
        />
      )}
    </>
  );
};

export default React.memo(EditForm);

const ToolDetailModal = ({
  tool,
  onClose,
  paramEnabled,
  setParamEnabled
}: {
  tool: HttpToolConfigType;
  onClose: () => void;
  paramEnabled: Record<string, boolean>;
  setParamEnabled: (params: Record<string, boolean>) => void;
}) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const { runAsync: runUpdateHttpPlugin, loading: isUpdating } = useRequest2(
    async (data: any) => await putUpdateHttpPlugin(data),
    {
      manual: true,
      successToast: t('common:update_success'),
      onSuccess: () => {
        onClose();
      },
      errorToast: t('common:update_failed')
    }
  );

  React.useEffect(() => {
    const properties = tool.inputSchema?.properties || {};
    if (Object.keys(paramEnabled).length === 0 && Object.keys(properties).length > 0) {
      const nextState: Record<string, boolean> = {};
      Object.keys(properties).forEach((paramName) => {
        nextState[paramName] = true;
      });
      setParamEnabled(nextState);
    }
  }, [tool, paramEnabled, setParamEnabled]);

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
            fontFamily={'PingFang SC'}
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
          backgroundColor={'myGray.100'}
          color={'myGray.600'}
          fontFamily={'PingFang SC'}
          fontSize={'12px'}
          fontStyle={'normal'}
          fontWeight={'500'}
          lineHeight={'16px'}
          letterSpacing={'0.5px'}
        >
          <Box>{t('workflow:tool_params.params_description')}</Box>
          <Box display={'flex'} gap={1}>
            {t('workflow:field_used_as_tool_input')}
            <QuestionTip label={t('workflow:tool_tip')} />
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
                <Box>
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
                  isChecked={!!paramEnabled[paramName]}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setParamEnabled({ ...paramEnabled, [paramName]: checked });
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
              runUpdateHttpPlugin({
                appId: appDetail._id,
                name: appDetail.name,
                avatar: appDetail.avatar,
                intro: appDetail.intro,
                toolParamEnabledMap: {
                  [tool.name]: paramEnabled
                }
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

  const methodUpper = method.toUpperCase();
  switch (methodUpper) {
    case 'GET':
      return <GET />;
    case 'POST':
      return <POST />;
    case 'PUT':
      return <PUT />;
    case 'DELETE':
      return <DELETE />;
    case 'PATCH':
      return <PATCH />;
    default:
      return <OTHER>{methodUpper}</OTHER>;
  }
};

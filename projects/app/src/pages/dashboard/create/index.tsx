'use client';
import React, { useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  Card,
  Text,
  SimpleGrid,
  Collapse,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Center
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { emptyTemplates, parsePluginFromCurlString } from '@/web/core/app/templates';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { appTypeMap } from '@/pageComponents/app/constants';
import { serviceSideProps } from '@/web/common/i18n/utils';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import HeaderAuthForm from '@/components/common/secret/HeaderAuthForm';
import { getMCPTools, postCreateHttpTools, postCreateMCPTools } from '@/web/core/app/api/tool';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';

type FormType = {
  avatar: string;
  name: string;
  curlContent: string;
  createType?: 'batch' | 'manual';
  // MCP 相关字段
  mcpUrl?: string;
  mcpHeaderSecret?: any;
  mcpToolList?: any[];
};

export type CreateAppType =
  | AppTypeEnum.simple
  // | AppTypeEnum.agent
  | AppTypeEnum.workflow
  | AppTypeEnum.plugin
  | AppTypeEnum.toolSet
  | AppTypeEnum.httpToolSet;

const CreateAppsPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const { parentId } = router.query;

  const [selectedAppType, setSelectedAppType] = useState<CreateAppType>(AppTypeEnum.simple);
  const [showToolSet, setShowToolSet] = useState(false);

  const handleToggleToolSet = () => {
    const newShowToolSet = !showToolSet;
    setShowToolSet(newShowToolSet);

    if (
      !newShowToolSet &&
      (selectedAppType === AppTypeEnum.toolSet || selectedAppType === AppTypeEnum.httpToolSet)
    ) {
      setSelectedAppType(AppTypeEnum.simple);
      setValue('avatar', appTypeMap[AppTypeEnum.simple]?.avatar || '');
    }
  };

  const { data: templateList = [] } = useRequest2(
    () => getTemplateMarketItemList({ isQuickTemplate: true, type: selectedAppType }),
    {
      manual: false,
      refreshDeps: [selectedAppType]
    }
  );

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: appTypeMap[selectedAppType]?.avatar || '',
      name: '',
      curlContent: '',
      createType: 'batch',
      mcpUrl: '',
      mcpHeaderSecret: {},
      mcpToolList: []
    }
  });
  const avatar = watch('avatar');
  const createType = watch('createType');
  const mcpUrl = watch('mcpUrl');
  const mcpHeaderSecret = watch('mcpHeaderSecret');
  const mcpToolList = watch('mcpToolList');

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  // MCP 工具解析
  const { runAsync: runGetMCPTools, loading: isGettingMCPTools } = useRequest2(
    (data: { url: string; headerSecret: any }) => getMCPTools(data),
    {
      onSuccess: (res: McpToolConfigType[]) => {
        setValue('mcpToolList', res);
      },
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );

  const { runAsync: onclickCreate, loading: isCreating } = useRequest2(
    async (
      { avatar, name, curlContent, createType, mcpUrl, mcpHeaderSecret, mcpToolList }: FormType,
      templateId?: string
    ): Promise<string> => {
      const appType = selectedAppType;

      // MCP Tools 特殊处理
      if (appType === AppTypeEnum.toolSet) {
        return postCreateMCPTools({
          parentId: parentId as string,
          name: name,
          avatar: avatar,
          url: mcpUrl || '',
          headerSecret: mcpHeaderSecret || {},
          toolList: (mcpToolList || []) as McpToolConfigType[]
        });
      }

      // HTTP Tools 特殊处理
      if (appType === AppTypeEnum.httpToolSet) {
        return postCreateHttpTools({
          parentId: parentId as string,
          name: name,
          avatar: avatar,
          createType: createType || 'batch'
        });
      }

      // From empty template
      if (!templateId) {
        return postCreateApp({
          parentId: parentId as string,
          avatar: avatar,
          name: name,
          type: appType,
          modules: emptyTemplates[appType].nodes,
          edges: emptyTemplates[appType].edges,
          chatConfig: emptyTemplates[appType].chatConfig
        });
      }

      const { workflow, appAvatar } = await (async () => {
        if (templateId) {
          const templateDetail = await getTemplateMarketItemDetail(templateId);
          return {
            appAvatar: templateDetail.avatar,
            workflow: templateDetail.workflow
          };
        }
        if (curlContent) {
          return {
            appAvatar: avatar,
            workflow: parsePluginFromCurlString(curlContent)
          };
        }
        return Promise.reject('No template or curl content');
      })();

      return postCreateApp({
        parentId: parentId as string,
        avatar: appAvatar,
        name: name,
        type: appType,
        modules: workflow.nodes || [],
        edges: workflow.edges || [],
        chatConfig: workflow.chatConfig || {}
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const appTypeOptionsMap: Record<
    CreateAppType,
    {
      type: CreateAppType;
      icon: string;
      title: string;
      intro: string;
      description: string;
      imgUrl: string;
    }
  > = {
    [AppTypeEnum.simple]: {
      type: AppTypeEnum.simple,
      icon: 'core/app/simpleBot',
      title: '对话 Agent',
      intro: '让AI助手自主调用工具',
      description:
        '由AI驱动的Agent系统，可自行做决策、制定步骤、调用工具，并全程支持交互，适合流程不固定的任务。',
      imgUrl: '/imgs/app/simpleAgentPreview.svg'
    },
    [AppTypeEnum.workflow]: {
      type: AppTypeEnum.workflow,
      icon: 'core/app/type/workflowFill',
      title: t('app:type.Workflow bot'),
      intro: '拖拽编排与多轮对话',
      description: '支持记忆的复杂多轮对话工作流。',
      imgUrl: '/imgs/app/workflowPreview.svg'
    },
    [AppTypeEnum.plugin]: {
      type: AppTypeEnum.plugin,
      icon: 'core/app/type/pluginFill',
      title: t('app:type.Plugin'),
      intro: '常用于封装工作流',
      description: '一键输出指定结果。',
      imgUrl: '/imgs/app/pluginPreview.svg'
    },
    [AppTypeEnum.toolSet]: {
      type: AppTypeEnum.toolSet,
      icon: 'core/app/type/mcpToolsFill',
      title: t('app:type.MCP tools'),
      intro: 'MCP 工具集',
      description: '通过输入MCP地址，自动解析并批量创建可调用的MCP工具',
      imgUrl: '/imgs/app/mcpToolsPreview.svg'
    },
    [AppTypeEnum.httpToolSet]: {
      type: AppTypeEnum.httpToolSet,
      icon: 'core/app/type/httpPluginFill',
      title: t('app:type.Http tool set'),
      intro: 'HTTP 工具集',
      description: '通过OpenAPI Schema批量创建工具（兼容 GPTs），通过 curl 或手动创建工具。',
      imgUrl: '/imgs/app/httpToolSetPreview.svg'
    }
  };
  const baseAppTypeList = Object.values(appTypeOptionsMap).filter(
    (option) => option.type !== AppTypeEnum.toolSet && option.type !== AppTypeEnum.httpToolSet
  );
  const toolSetAppTypeList = Object.values(appTypeOptionsMap).filter(
    (option) => option.type === AppTypeEnum.toolSet || option.type === AppTypeEnum.httpToolSet
  );
  const renderAppTypeCard = (option: (typeof appTypeOptionsMap)[CreateAppType]) => (
    <Card
      key={option.type}
      p={4}
      borderRadius={'10px'}
      border={'1px solid'}
      borderColor={selectedAppType === option.type ? 'primary.300' : 'myGray.200'}
      boxShadow={
        selectedAppType === option.type
          ? '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
          : 'none'
      }
      cursor={'pointer'}
      userSelect={'none'}
      onClick={() => {
        setSelectedAppType(option.type);
        setValue('avatar', appTypeMap[option.type as keyof typeof appTypeMap]?.avatar || '');
      }}
      _hover={{
        boxShadow: '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
      }}
    >
      <MyIcon name={option.icon as any} w={'6'} />
      <Box fontWeight={'medium'} color={'myGray.900'} mt={2}>
        {option.title}
      </Box>
      <Text fontSize={'mini'} color={'myGray.500'} mt={0.5} lineHeight={'16px'}>
        {option.intro}
      </Text>
    </Card>
  );

  return (
    <Box h={'100vh'} overflow={'hidden'}>
      <Flex px={4} py={3} bg={'myGray.25'}>
        <Button
          variant={'ghost'}
          leftIcon={<MyIcon name={'common/backLight'} w={4} />}
          bg={'none'}
          color={'myGray.900'}
          px={1}
          py={1.5}
          onClick={() => router.back()}
          fontSize={'20px'}
        >
          {t('common:create_app')}
        </Button>
      </Flex>
      <Flex bg={'white'} flex={1} gap={7} p={6} h={'calc(100vh - 60px)'}>
        <Flex
          flex={1}
          p={6}
          flexDirection={'column'}
          rounded={'16px'}
          boxShadow={'0 4px 22.1px 0 rgba(130, 141, 168, 0.20)'}
          h={'full'}
          overflow={'auto'}
          sx={{
            '&::-webkit-scrollbar': {
              width: '4px'
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent'
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'transparent',
              borderRadius: '2px',
              transition: 'background 0.2s'
            },
            '&:hover::-webkit-scrollbar-thumb': {
              background: 'myGray.300'
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'myGray.400'
            },
            scrollbarWidth: 'thin',
            scrollbarColor: 'transparent transparent',
            '&:hover': {
              scrollbarColor: 'var(--chakra-colors-myGray-300) transparent'
            }
          }}
        >
          <Box mb={5} borderBottom={'1px solid'} borderColor={'myGray.200'}>
            <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
              {t('common:app_type')}
            </Box>
            <SimpleGrid columns={3} gap={2.5} pb={showToolSet ? 0 : 2.5}>
              {baseAppTypeList.map(renderAppTypeCard)}
            </SimpleGrid>

            <Collapse
              in={showToolSet}
              animateOpacity
              transition={{ enter: { duration: 0.2 }, exit: { duration: 0.2 } }}
            >
              <SimpleGrid columns={3} gap={2.5} mt={2.5} pb={2.5}>
                {toolSetAppTypeList.map(renderAppTypeCard)}
              </SimpleGrid>
            </Collapse>

            <Flex
              px={1.5}
              pb={2.5}
              color={'primary.700'}
              fontSize={'sm'}
              fontWeight={'medium'}
              justifyContent={'end'}
            >
              <Box
                px={2}
                py={1}
                cursor={'pointer'}
                display={'inline-flex'}
                alignItems={'center'}
                gap={1}
                _hover={{
                  bg: 'myGray.50',
                  rounded: 'sm'
                }}
                onClick={handleToggleToolSet}
              >
                <Box>{showToolSet ? '收起' : '展开 MCP、Http 创建'}</Box>
              </Box>
            </Flex>
          </Box>

          <Box mb={5}>
            <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5} letterSpacing={'0.15px'}>
              {t('common:app_icon_and_name')}
            </Box>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Box
                  p={1}
                  mr={2.5}
                  borderRadius={'6px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                >
                  <Avatar
                    src={avatar}
                    w={7}
                    borderRadius={'4.667px'}
                    cursor={'pointer'}
                    onClick={onOpenSelectFile}
                  />
                </Box>
              </MyTooltip>
              <Input
                flex={1}
                h={8}
                mr={5}
                placeholder={'请输入应用名称'}
                {...register('name', {
                  required: t('common:core.app.error.App name can not be empty')
                })}
              />
              <Button
                isLoading={isCreating}
                isDisabled={
                  selectedAppType === AppTypeEnum.toolSet &&
                  (!mcpToolList || mcpToolList.length === 0)
                }
                onClick={handleSubmit((data) => onclickCreate(data))}
              >
                {t('common:Create')}
              </Button>
            </Flex>
          </Box>

          {/* MCP Tools 特有字段 */}
          {selectedAppType === AppTypeEnum.toolSet && (
            <>
              <Box mb={5}>
                <HeaderAuthForm
                  headerSecretValue={mcpHeaderSecret || {}}
                  onChange={(data) => {
                    setValue('mcpHeaderSecret', data);
                  }}
                />
              </Box>

              <Box mb={5}>
                <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                  {t('app:MCP_tools_url')}
                </Box>
                <Flex alignItems={'center'} gap={2}>
                  <Input
                    flex={1}
                    h={8}
                    placeholder={t('app:MCP_tools_url_placeholder')}
                    {...register('mcpUrl', {
                      required: t('app:MCP_tools_url_is_empty')
                    })}
                  />
                  <Button
                    size={'sm'}
                    variant={'whitePrimary'}
                    h={8}
                    isLoading={isGettingMCPTools}
                    onClick={() => {
                      runGetMCPTools({
                        url: mcpUrl || '',
                        headerSecret: mcpHeaderSecret
                      });
                    }}
                  >
                    {t('common:Parse')}
                  </Button>
                </Flex>
              </Box>

              <Box mb={5}>
                <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                  {t('app:MCP_tools_list')}
                </Box>
                <Box
                  borderRadius={'md'}
                  overflow={'hidden'}
                  borderWidth={'1px'}
                  position={'relative'}
                >
                  <TableContainer maxH={360} minH={200} overflowY={'auto'}>
                    <Table bg={'white'}>
                      <Thead bg={'myGray.50'}>
                        <Tr>
                          <Th fontSize={'mini'} py={0} h={'34px'}>
                            {t('common:Name')}
                          </Th>
                          <Th fontSize={'mini'} py={0} h={'34px'}>
                            {t('common:plugin.Description')}
                          </Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {(mcpToolList || []).map((item: McpToolConfigType) => (
                          <Tr key={item.name} height={'28px'}>
                            <Td
                              fontSize={'mini'}
                              color={'myGray.900'}
                              fontWeight={'medium'}
                              py={2}
                              maxW={'50%'}
                              overflow={'hidden'}
                              textOverflow={'ellipsis'}
                              whiteSpace={'nowrap'}
                            >
                              {item.name}
                            </Td>
                            <Td
                              fontSize={'mini'}
                              color={'myGray.900'}
                              fontWeight={'medium'}
                              py={2}
                              maxW={'50%'}
                              overflow={'hidden'}
                              textOverflow={'ellipsis'}
                              whiteSpace={'nowrap'}
                            >
                              {item.description}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                  {(!mcpToolList || mcpToolList.length === 0) && (
                    <Center
                      position={'absolute'}
                      top={0}
                      left={0}
                      right={0}
                      bottom={0}
                      fontSize={'mini'}
                      color={'myGray.500'}
                      bg={'white'}
                    >
                      {t('app:no_mcp_tools_list')}
                    </Center>
                  )}
                </Box>
              </Box>
            </>
          )}

          {/* HTTP Tools 特有字段 */}
          {selectedAppType === AppTypeEnum.httpToolSet && (
            <>
              <Box mb={5}>
                <Flex alignItems={'center'} mb={2.5}>
                  <Box color={'myGray.900'} fontWeight={'medium'}>
                    {t('app:HTTPTools_Create_Type')}
                  </Box>
                  <Flex ml={'auto'} alignItems={'center'} gap={1}>
                    <MyIcon name={'common/info'} w={'14px'} h={'14px'} color={'myGray.500'} />
                    <Box fontSize={'xs'} color={'myGray.500'}>
                      {t('app:HTTPTools_Create_Type_Tip')}
                    </Box>
                  </Flex>
                </Flex>
                <LeftRadio
                  list={[
                    {
                      title: t('app:type.Http batch'),
                      value: 'batch',
                      desc: t('app:type.Http batch tip')
                    },
                    {
                      title: t('app:type.Http manual'),
                      value: 'manual',
                      desc: t('app:type.Http manual tip')
                    }
                  ]}
                  value={createType || 'batch'}
                  fontSize={'xs'}
                  onChange={(e) => setValue('createType', e as 'batch' | 'manual')}
                  defaultBg={'white'}
                  activeBg={'myGray.50'}
                  py={2}
                  px={3}
                  gridGap={2.5}
                />
              </Box>
            </>
          )}

          {templateList.length > 0 && (
            <Box>
              <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                {t('app:create_by_template')}
              </Box>

              <SimpleGrid columns={[1, 3]} gridGap={2.5}>
                {templateList.map((item) => (
                  <Card
                    key={item.templateId}
                    p={4}
                    borderRadius={'10px'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    cursor={'pointer'}
                    boxShadow={'none'}
                    _hover={{
                      boxShadow:
                        '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
                    }}
                  >
                    <Box
                      position={'relative'}
                      h={28}
                      borderRadius={'12px'}
                      overflow={'hidden'}
                      mb={2}
                    >
                      <Avatar
                        src={item.avatar}
                        position={'absolute'}
                        w={'full'}
                        opacity={0.5}
                        top={'50%'}
                        transform={'translate(0, -50%)'}
                        filter={'blur(20px)'}
                        zIndex={0}
                      />
                      <Box
                        position={'absolute'}
                        top={0}
                        left={0}
                        right={0}
                        bottom={0}
                        opacity={0.08}
                        background={
                          'linear-gradient(180deg, rgba(51, 51, 51, 0.00) 50%, #333 131.5%)'
                        }
                        zIndex={1}
                      />

                      <Box
                        position={'absolute'}
                        top={'50%'}
                        left={'50%'}
                        transform={'translate(-50%, -50%)'}
                        zIndex={2}
                      >
                        <Avatar src={item.avatar} w={6} borderRadius={'4px'} />
                      </Box>
                    </Box>

                    <Box color={'myGray.900'}>{t(item.name as any)}</Box>
                    <Box fontSize={'mini'} color={'myGray.500'} flex={1} noOfLines={2} mt={1}>
                      {t(item.intro as any)}
                    </Box>
                    <Box fontSize={'mini'} color={'myGray.500'} mt={2}>
                      by {item.author || feConfigs.systemTitle}
                    </Box>
                  </Card>
                ))}
              </SimpleGrid>
            </Box>
          )}
        </Flex>
        {/* preview image */}
        <Box flex={1} position={'relative'}>
          <Box
            position={'absolute'}
            zIndex={10}
            top={'60px'}
            left={'50%'}
            transform={'translateX(-50%)'}
            w={'full'}
          >
            <Flex alignItems={'center'} justifyContent={'center'}>
              <Box color={'myGray.900'} fontSize={'32px'} fontWeight={'medium'}>
                {appTypeOptionsMap[selectedAppType].title}
              </Box>
              {/* {selectedAppType === AppTypeEnum.agent && (
                <MyIcon name={'core/app/agent'} w={'24px'} h={'24px'} ml={2.5} />
              )} */}
            </Flex>
            <Flex
              color={'myGray.500'}
              fontSize={'md'}
              letterSpacing={'0.5px'}
              px={16}
              mt={2.5}
              textAlign={'center'}
              justifyContent={'center'}
            >
              {appTypeOptionsMap[selectedAppType].description}
            </Flex>
          </Box>
          <MyImage
            src={appTypeOptionsMap[selectedAppType].imgUrl}
            w={'full'}
            position={'absolute'}
            top={0}
            left={0}
            right={0}
            bottom={0}
            style={{ pointerEvents: 'none' }}
          />
        </Box>
      </Flex>
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
    </Box>
  );
};

export default CreateAppsPage;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'user']))
    }
  };
}

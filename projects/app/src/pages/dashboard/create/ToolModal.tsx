import React, { useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalBody,
  ModalFooter,
  Input,
  Grid,
  Card,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Center
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { postCreateApp } from '@/web/core/app/api';
import { getMCPTools, postCreateHttpTools, postCreateMCPTools } from '@/web/core/app/api/tool';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { headerValue2StoreHeader } from '@/components/common/secret/HeaderAuthConfig';
import { emptyTemplates } from '@/web/core/app/templates';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChevronRightIcon } from '@chakra-ui/icons';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import HeaderAuthForm from '@/components/common/secret/HeaderAuthForm';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';

export type ToolModalAppType =
  | AppTypeEnum.workflowTool
  | AppTypeEnum.httpToolSet
  | AppTypeEnum.mcpToolSet;

type FormType = {
  avatar: string;
  name: string;
  createType: 'batch' | 'manual';
  mcpUrl: string;
  mcpHeaderSecret: any;
  mcpToolList: McpToolConfigType[];
};

const ToolModal = ({
  onClose,
  type,
  parentId,
  onSuccess
}: {
  type: ToolModalAppType;
  onClose: () => void;
  parentId?: string | null;
  onSuccess?: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();

  const typeData = createAppTypeMap[type];
  const { feConfigs } = useSystemStore();

  const shouldRequestTemplates = useMemo(() => {
    return type === AppTypeEnum.workflowTool;
  }, [type]);

  const { data: templateData, loading: isRequestTemplates } = useRequest(
    () => getTemplateMarketItemList({ isQuickTemplate: true, type }),
    {
      manual: !shouldRequestTemplates,
      refreshDeps: [type]
    }
  );
  const templateList = templateData?.list ?? [];

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: typeData.icon,
      name: '',
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

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(avatar) {
        setValue('avatar', avatar);
      }
    });

  const { runAsync: runGetMCPTools, loading: isGettingMCPTools } = useRequest(
    (data: { url: string; headerSecret: StoreSecretValueType }) => getMCPTools(data),
    {
      onSuccess: (res: McpToolConfigType[]) => {
        setValue('mcpToolList', res);
      },
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );

  const { runAsync: onClickCreate, loading: isCreating } = useRequest(
    async (
      { avatar, name, createType, mcpUrl, mcpHeaderSecret, mcpToolList }: FormType,
      templateId?: string
    ) => {
      const baseParams = {
        parentId: parentId as string,
        avatar,
        name: name?.trim() || t('app:unnamed_app')
      };

      if (type === AppTypeEnum.httpToolSet) {
        return postCreateHttpTools({
          ...baseParams,
          createType
        });
      }

      if (type === AppTypeEnum.mcpToolSet) {
        const headerSecret = headerValue2StoreHeader(mcpHeaderSecret || {});
        return postCreateMCPTools({
          ...baseParams,
          url: mcpUrl || '',
          headerSecret,
          toolList: mcpToolList || []
        });
      }

      // workflowTool - from template
      if (templateId) {
        const templateDetail = await getTemplateMarketItemDetail(templateId);
        return postCreateApp({
          ...baseParams,
          avatar: templateDetail.avatar,
          name,
          type,
          modules: templateDetail.workflow.nodes || [],
          edges: templateDetail.workflow.edges || [],
          chatConfig: templateDetail.workflow.chatConfig || {},
          templateId: templateDetail.templateId
        });
      }

      // workflowTool - from empty
      const emptyTemplate = emptyTemplates[type];
      return postCreateApp({
        ...baseParams,
        type,
        modules: emptyTemplate?.nodes ?? [],
        edges: emptyTemplate?.edges ?? [],
        chatConfig: emptyTemplate?.chatConfig ?? {}
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
        onSuccess?.();
        onClose();
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const isMcpToolsEmpty =
    type === AppTypeEnum.mcpToolSet && (!mcpToolList || mcpToolList.length === 0);

  return (
    <MyModal
      iconSrc={typeData.icon}
      title={t(typeData.title)}
      onClose={onClose}
      isOpen
      isCentered={!isPc}
      w={'800px'}
      maxW={['90vw', '800px']}
      isLoading={isCreating || isRequestTemplates}
    >
      <ModalBody>
        {/* 名称和头像 */}
        <Box color={'myGray.800'}>{t('common:input_name')}</Box>
        <Flex mt={2} alignItems={'center'}>
          <MyTooltip label={t('common:set_avatar')}>
            <Avatar
              flexShrink={0}
              src={avatar}
              w={['28px', '36px']}
              h={['28px', '36px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={handleAvatarSelectorOpen}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={3}
            autoFocus
            bg={'myWhite.600'}
            placeholder={t('app:unnamed_app')}
            {...register('name', {
              required: t('common:core.app.error.App name can not be empty')
            })}
          />
        </Flex>

        {/* 工作流工具 - 模板列表 */}
        {type === AppTypeEnum.workflowTool && (
          <>
            <Flex mt={[4, 7]} mb={3}>
              <Box color={'myGray.900'} fontWeight={'bold'} fontSize={'sm'}>
                {t('app:create_by_template')}
              </Box>
              <Box flex={1} />
              <Flex
                onClick={() => {
                  router.push({
                    pathname: '/dashboard/templateMarket',
                    query: {
                      appType: type,
                      parentId
                    }
                  });
                  onClose();
                }}
                alignItems={'center'}
                cursor={'pointer'}
                color={'myGray.600'}
                fontSize={'xs'}
                _hover={{ color: 'blue.700' }}
              >
                {t('common:core.app.switch_to_template_market')}
                <ChevronRightIcon w={4} h={4} />
              </Flex>
            </Flex>

            <Grid
              userSelect={'none'}
              gridTemplateColumns={
                templateList.length > 0 ? ['repeat(1,1fr)', 'repeat(2,1fr)'] : '1fr'
              }
              gridGap={[2, 4]}
            >
              <Card
                borderWidth={'1px'}
                borderRadius={'md'}
                cursor={'pointer'}
                boxShadow={'3'}
                display={'flex'}
                flexDirection={'column'}
                alignItems={'center'}
                justifyContent={'center'}
                color={'myGray.500'}
                borderColor={'myGray.200'}
                h={'8.25rem'}
                _hover={{
                  color: 'primary.700',
                  borderColor: 'primary.300'
                }}
                onClick={handleSubmit((data) => onClickCreate(data))}
              >
                <MyIcon name={'common/addLight'} w={'1.5rem'} />
                <Box fontSize={'sm'} mt={2}>
                  {t(typeData.intro)}
                </Box>
              </Card>
              {templateList.map((item) => (
                <Card
                  key={item.templateId}
                  p={4}
                  borderRadius={'md'}
                  borderWidth={'1px'}
                  borderColor={'myGray.200'}
                  boxShadow={'3'}
                  h={'8.25rem'}
                  _hover={{
                    borderColor: 'primary.300',
                    '& .buttons': {
                      display: 'flex'
                    }
                  }}
                  display={'flex'}
                  flexDirection={'column'}
                >
                  <Flex alignItems={'center'}>
                    <Avatar src={item.avatar} borderRadius={'sm'} w={'1.5rem'} />
                    <Box ml={3} color={'myGray.900'} fontWeight={500}>
                      {t(item.name as any)}
                    </Box>
                  </Flex>
                  <Box fontSize={'xs'} mt={2} color={'myGray.600'} flex={1}>
                    {t(item.intro as any)}
                  </Box>
                  <Box w={'full'} fontSize={'mini'}>
                    <Box color={'myGray.500'}>{`By ${item.author || feConfigs.systemTitle}`}</Box>
                    <Box
                      className="buttons"
                      display={'none'}
                      justifyContent={'center'}
                      alignItems={'center'}
                      position={'absolute'}
                      borderRadius={'lg'}
                      w={'full'}
                      h={'full'}
                      left={0}
                      right={0}
                      bottom={1}
                      height={'40px'}
                      bg={'white'}
                      zIndex={1}
                    >
                      <Button
                        variant={'whiteBase'}
                        h={6}
                        borderRadius={'sm'}
                        w={'40%'}
                        onClick={handleSubmit((data) => onClickCreate(data, item.templateId))}
                      >
                        {t('app:templateMarket.Use')}
                      </Button>
                    </Box>
                  </Box>
                </Card>
              ))}
            </Grid>
          </>
        )}

        {/* HTTP 工具 - 创建类型选择 */}
        {type === AppTypeEnum.httpToolSet && (
          <Box mt={5}>
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
              value={createType}
              fontSize={'xs'}
              onChange={(e) => setValue('createType', e as 'batch' | 'manual')}
              defaultBg={'white'}
              activeBg={'primary.50'}
              py={2}
              px={3}
              gridGap={2.5}
            />
          </Box>
        )}

        {/* MCP 工具 - URL 和工具列表 */}
        {type === AppTypeEnum.mcpToolSet && (
          <>
            <Box mt={5}>
              <HeaderAuthForm
                headerSecretValue={mcpHeaderSecret || {}}
                onChange={(data) => setValue('mcpHeaderSecret', data)}
                bg={'white'}
              />
            </Box>

            <Box mt={5}>
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
                    const headerSecret = headerValue2StoreHeader(mcpHeaderSecret || {});
                    runGetMCPTools({ url: mcpUrl || '', headerSecret });
                  }}
                >
                  {t('common:Parse')}
                </Button>
              </Flex>
            </Box>

            <Box mt={5}>
              <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                {t('app:MCP_tools_list')}
              </Box>
              <Box
                borderRadius={'md'}
                overflow={'hidden'}
                borderWidth={'1px'}
                position={'relative'}
              >
                <TableContainer maxH={260} minH={150} overflowY={'auto'}>
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
      </ModalBody>

      <ModalFooter gap={4}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          variant={'primary'}
          isLoading={isCreating}
          isDisabled={isMcpToolsEmpty}
          onClick={handleSubmit((data) => onClickCreate(data))}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
      <AvatarUploader />
    </MyModal>
  );
};

export default ToolModal;

import React, { useMemo } from 'react';
import { Box, Flex, Button, ModalBody, Input, Grid, Card, ModalFooter } from '@chakra-ui/react';
import MyCard from '@/components/MyCard';
import { useForm } from 'react-hook-form';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { emptyTemplates } from '@/web/core/app/templates';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { TabEnum } from '@/pageComponents/app/detail/context';
import SmartCustomerServiceForm from './SmartCustomerServiceForm';
import type { SmartCustomerServiceFormType } from './SmartCustomerServiceForm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { updateDatasetSearchNodesLimit } from '@/web/core/app/utils';

type FormType = {
  avatar: string;
  name: string;
  smartCustomerService?: SmartCustomerServiceFormType;
};

export type CreateAppType =
  | AppTypeEnum.simple
  | AppTypeEnum.workflow
  | AppTypeEnum.assistant
  | AppTypeEnum.chatAgent;

const CreateModal = ({
  onClose,
  type,
  parentId,
  onSuccess
}: {
  type: CreateAppType;
  onClose: () => void;
  parentId?: string | null;
  onSuccess?: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();

  const typeData = createAppTypeMap[type];
  const shouldRequestTemplates = useMemo(() => {
    return type !== AppTypeEnum.assistant;
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
      smartCustomerService: {
        datasets: []
      }
    }
  });

  const avatar = watch('avatar');
  const smartCustomerService = watch('smartCustomerService');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(avatar) {
        setValue('avatar', avatar);
      }
    });

  const { runAsync: onclickCreate, loading: isCreating } = useRequest(
    async ({ avatar, name, smartCustomerService }: FormType, templateId?: string) => {
      // Handle smart customer service type
      if (type === AppTypeEnum.assistant) {
        const templateDetail = await getTemplateMarketItemDetail('community-assistant');
        const template = templateDetail.workflow;
        const updatedNodes = template.nodes.map((node: StoreNodeItemType) => {
          if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
            node.inputs.forEach((input: FlowNodeInputItemType) => {
              if (input.key === NodeInputKeyEnum.datasetSelectList) {
                input.value = smartCustomerService?.datasets || [];
              }
              // 重置创建模板中的配置的重排模型默认值
              if (input.key === NodeInputKeyEnum.datasetSearchRerankModel) {
                input.value = '';
              }
            });
          }
          return node;
        });

        // Update limit based on the updated nodes
        const finalNodes = updateDatasetSearchNodesLimit(updatedNodes);

        return postCreateApp({
          parentId: parentId as string,
          avatar,
          name,
          type,
          modules: finalNodes,
          edges: template.edges,
          chatConfig: template.chatConfig
        });
      }

      // From template
      if (templateId) {
        const templateDetail = await getTemplateMarketItemDetail(templateId);
        // assistant 类型不会走到这个分支,所以直接使用原始 nodes
        const nodes = templateDetail.workflow.nodes || [];

        return postCreateApp({
          parentId: parentId as string,
          avatar: templateDetail.avatar,
          name,
          type,
          modules: nodes,
          edges: templateDetail.workflow.edges || [],
          chatConfig: templateDetail.workflow.chatConfig || {},
          templateId: templateDetail.templateId
        });
      }

      // From empty template
      const emptyTemplate = emptyTemplates[type as keyof typeof emptyTemplates];
      // assistant 类型不会走到这个分支,所以直接使用原始 nodes
      const nodes = emptyTemplate?.nodes ?? [];

      return postCreateApp({
        parentId: parentId as string,
        avatar,
        name,
        type,
        modules: nodes,
        edges: emptyTemplate?.edges ?? [],
        chatConfig: emptyTemplate?.chatConfig ?? {}
      });
    },
    {
      onSuccess(id: string) {
        if (type === AppTypeEnum.assistant) {
          router.push(`/app/detail?appId=${id}&currentTab=${TabEnum.appEdit}`);
        } else {
          router.push(`/app/detail?appId=${id}`);
        }
        onSuccess?.();
        onClose();
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  // 统一的底部按钮组件
  const renderFooterButtons = () => {
    const isSmartCustomerService = type === AppTypeEnum.assistant;
    const isDatasetsEmpty = isSmartCustomerService && smartCustomerService?.datasets?.length === 0;

    const isDisabled = isDatasetsEmpty;
    const tooltipLabel = isDatasetsEmpty ? t('app:files_cascader_select_first') : '';

    return (
      <ModalFooter gap={4}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        {type === AppTypeEnum.assistant && (
          <MyTooltip label={tooltipLabel} isDisabled={!isDisabled}>
            <Button
              variant={'primary'}
              onClick={handleSubmit((data) => onclickCreate(data))}
              isLoading={isCreating}
              isDisabled={isDisabled}
            >
              {t('common:Confirm')}
            </Button>
          </MyTooltip>
        )}
      </ModalFooter>
    );
  };

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
        {/* 智能客服类型显示特殊表单 */}
        {type === AppTypeEnum.assistant ? (
          <>
            <FormLabel color={'myGray.900'}>{t('common:core.app.Name and avatar')}</FormLabel>
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
                {...register('name', {
                  required: t('common:core.app.error.App name can not be empty')
                })}
              />
            </Flex>
            <SmartCustomerServiceForm
              value={smartCustomerService!}
              onChange={(data) => setValue('smartCustomerService', data)}
            />
          </>
        ) : (
          <>
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
                {...register('name', {
                  required: t('common:core.app.error.App name can not be empty')
                })}
              />
            </Flex>
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
                h="152px"
                boxShadow={'none'}
                display={'flex'}
                flexDirection={'column'}
                alignItems={'center'}
                justifyContent={'center'}
                bg="#FFFFFF"
                border="1px solid"
                borderColor="#DCE0E6"
                borderRadius="8px"
                position="relative"
                overflow="hidden"
                cursor="pointer"
                transition="border-color 0.15s"
                _hover={{ borderColor: '#91BBF2', color: 'primary.700' }}
                onClick={handleSubmit((data) => onclickCreate(data))}
              >
                <MyIcon name={'common/addLight'} w={'1.5rem'} />
                <Box fontSize={'sm'} mt={2}>
                  {t(typeData.intro)}
                </Box>
              </Card>
              {templateList.map((item) => (
                <MyCard
                  key={item.templateId}
                  avatar={item.avatar}
                  name={t(item.name as any)}
                  intro={t(item.intro as any)}
                  author={item.author || feConfigs.systemTitle}
                  onClick={() => {
                    handleSubmit((data) => onclickCreate(data, item.templateId))();
                  }}
                  hoverAction={
                    <Button
                      height="24px"
                      variant="primaryOutline"
                      borderRadius="4px"
                      fontSize="12px"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubmit((data) => onclickCreate(data, item.templateId))();
                      }}
                    >
                      <Flex align="center" color="blue.650">
                        <MyIcon name="common/addLight" w="12px" h="12px" mr="4px" display="block" />
                        {t('app:templateMarket.Use')}
                      </Flex>
                    </Button>
                  }
                />
              ))}
            </Grid>
          </>
        )}
      </ModalBody>
      {/* 统一的底部按钮 */}
      {renderFooterButtons()}
      <AvatarUploader />
    </MyModal>
  );
};

export default CreateModal;

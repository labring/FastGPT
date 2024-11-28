import React, { useCallback, useMemo, useRef } from 'react';
import { Box, Flex, Button, ModalFooter, ModalBody, Input, Grid, Card } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { emptyTemplates } from '@/web/core/app/templates';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type FormType = {
  avatar: string;
  name: string;
};

export type CreateAppType = AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.plugin;

const CreateModal = ({
  onClose,
  type,
  onOpenTemplateModal
}: {
  type: CreateAppType;
  onClose: () => void;
  onOpenTemplateModal: (type: AppTypeEnum) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();

  const typeMap = useRef({
    [AppTypeEnum.simple]: {
      icon: 'core/app/simpleBot',
      title: t('app:type.Create simple bot'),
      avatar: 'core/app/type/simpleFill',
      emptyCreateText: t('app:create_empty_app')
    },
    [AppTypeEnum.workflow]: {
      icon: 'core/app/type/workflowFill',
      avatar: 'core/app/type/workflowFill',
      title: t('app:type.Create workflow bot'),
      emptyCreateText: t('app:create_empty_workflow')
    },
    [AppTypeEnum.plugin]: {
      icon: 'core/app/type/pluginFill',
      avatar: 'core/app/type/pluginFill',
      title: t('app:type.Create plugin bot'),
      emptyCreateText: t('app:create_empty_plugin')
    }
  });
  const typeData = typeMap.current[type];

  const { data: templateList = [] } = useRequest2(getTemplateMarketItemList, {
    manual: false
  });
  const filterTemplates = useMemo(() => {
    return templateList.filter((item) => item.type === type).slice(0, 3);
  }, [templateList, type]);

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: typeData.avatar,
      name: ''
    }
  });
  const avatar = watch('avatar');

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.appAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common:common.error.Select avatar failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const { runAsync: onclickCreate, loading: isCreating } = useRequest2(
    async (data: FormType, templateId?: string) => {
      if (!templateId) {
        return postCreateApp({
          parentId,
          avatar: data.avatar,
          name: data.name,
          type,
          modules: emptyTemplates[type].nodes,
          edges: emptyTemplates[type].edges,
          chatConfig: emptyTemplates[type].chatConfig
        });
      }

      const templateDetail = await getTemplateMarketItemDetail({ templateId: templateId });

      return postCreateApp({
        parentId,
        avatar: data.avatar || templateDetail.avatar,
        name: data.name,
        type: templateDetail.type,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || [],
        chatConfig: templateDetail.workflow.chatConfig
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
        loadMyApps();
        onClose();
      },
      successToast: t('common:common.Create Success'),
      errorToast: t('common:common.Create Failed')
    }
  );

  return (
    <MyModal
      iconSrc={typeData.icon}
      title={typeData.title}
      isOpen
      onClose={onClose}
      isCentered={!isPc}
      maxW={['90vw', '40rem']}
      isLoading={isCreating}
    >
      <ModalBody px={9} pb={8}>
        <Box color={'myGray.800'} fontWeight={'bold'}>
          {t('common:common.Set Name')}
        </Box>
        <Flex mt={2} alignItems={'center'}>
          <MyTooltip label={t('common:common.Set Avatar')}>
            <Avatar
              flexShrink={0}
              src={avatar}
              w={['28px', '36px']}
              h={['28px', '36px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={3}
            autoFocus
            bg={'myWhite.600'}
            {...register('name', {
              required: t('common:core.app.error.App name can not be empty')
            })}
          />
        </Flex>
        <Flex mt={[4, 7]} mb={[0, 3]}>
          <Box color={'myGray.900'} fontWeight={'bold'} fontSize={'sm'}>
            {t('common:core.app.Select app from template')}
          </Box>
          <Box flex={1} />
          <Flex
            onClick={() => onOpenTemplateModal(type)}
            alignItems={'center'}
            cursor={'pointer'}
            color={'myGray.600'}
            fontSize={'xs'}
            _hover={{ color: 'blue.700' }}
          >
            {t('common:core.app.more')}
            <ChevronRightIcon w={4} h={4} />
          </Flex>
        </Flex>
        <Grid
          userSelect={'none'}
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)']}
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
            onClick={handleSubmit((data) => onclickCreate(data))}
          >
            <MyIcon name={'common/addLight'} w={'1.5rem'} />
            <Box fontSize={'sm'} mt={2}>
              {typeData.emptyCreateText}
            </Box>
          </Card>
          {filterTemplates.map((item) => (
            <Card
              key={item.id}
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
                  bottom={0}
                  height={'40px'}
                  bg={'white'}
                  zIndex={1}
                >
                  <Button
                    variant={'whiteBase'}
                    h={'1.75rem'}
                    borderRadius={'xl'}
                    w={'40%'}
                    onClick={handleSubmit((data) => onclickCreate(data, item.id))}
                  >
                    {t('app:templateMarket.Use')}
                  </Button>
                </Box>
              </Box>
            </Card>
          ))}
        </Grid>
      </ModalBody>
      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default CreateModal;

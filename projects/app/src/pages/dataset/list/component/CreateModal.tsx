import React, { useCallback, useMemo } from 'react';
import { Box, Flex, Button, ModalFooter, ModalBody, Input, HStack } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { postCreateDataset } from '@/web/core/dataset/api';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { useTranslation } from 'next-i18next';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDocPath } from '@/web/common/system/doc';

export type CreateDatasetType =
  | DatasetTypeEnum.dataset
  | DatasetTypeEnum.apiDataset
  | DatasetTypeEnum.websiteDataset;

const CreateModal = ({
  onClose,
  parentId,
  type
}: {
  onClose: () => void;
  parentId?: string;
  type: CreateDatasetType;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { vectorModelList, datasetModelList } = useSystemStore();
  const { isPc } = useSystem();

  const databaseNameMap = useMemo(() => {
    return {
      [DatasetTypeEnum.dataset]: t('dataset:common_dataset'),
      [DatasetTypeEnum.apiDataset]: t('dataset:api_file'),
      [DatasetTypeEnum.websiteDataset]: t('dataset:website_dataset')
    };
  }, [t]);

  const iconMap = useMemo(() => {
    return {
      [DatasetTypeEnum.dataset]: 'core/dataset/commonDatasetColor',
      [DatasetTypeEnum.apiDataset]: 'core/dataset/externalDatasetColor',
      [DatasetTypeEnum.websiteDataset]: 'core/dataset/websiteDatasetColor'
    };
  }, []);

  const filterNotHiddenVectorModelList = vectorModelList.filter((item) => !item.hidden);

  const { register, setValue, handleSubmit, watch } = useForm<CreateDatasetParams>({
    defaultValues: {
      parentId,
      type: type || DatasetTypeEnum.dataset,
      avatar: iconMap[type] || 'core/dataset/commonDatasetColor',
      name: '',
      intro: '',
      vectorModel: filterNotHiddenVectorModelList[0].model,
      agentModel: datasetModelList[0].model
    }
  });
  const avatar = watch('avatar');
  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');

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
          type: MongoImageTypeEnum.datasetAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar' as const, src);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common:common.avatar.Select Failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  /* create a new kb and router to it */
  const { run: onclickCreate, loading: creating } = useRequest2(
    async (data: CreateDatasetParams) => await postCreateDataset(data),
    {
      successToast: t('common:common.Create Success'),
      errorToast: t('common:common.Create Failed'),
      onSuccess(id) {
        router.push(`/dataset/detail?datasetId=${id}`);
      }
    }
  );

  return (
    <MyModal
      title={
        <Flex alignItems={'center'} ml={-3}>
          <Avatar w={'20px'} h={'20px'} borderRadius={'xs'} src={iconMap[type]} pr={'10px'} />
          {t('common:core.dataset.Create dataset', { name: databaseNameMap[type] })}
        </Flex>
      }
      isOpen
      onClose={onClose}
      isCentered={!isPc}
      w={'490px'}
    >
      <ModalBody py={6} px={9}>
        <Box>
          <Flex justify={'space-between'}>
            <Box color={'myGray.900'} fontWeight={500} fontSize={'sm'}>
              {t('common:common.Set Name')}
            </Box>
            {type === DatasetTypeEnum.apiDataset && (
              <Flex
                as={'span'}
                alignItems={'center'}
                color={'primary.600'}
                fontSize={'sm'}
                cursor={'pointer'}
                onClick={() =>
                  window.open(getDocPath('/docs/guide/knowledge_base/api_dataset/'), '_blank')
                }
              >
                <MyIcon name={'book'} w={4} mr={0.5} />
                {t('common:Instructions')}
              </Flex>
            )}
          </Flex>
          <Flex mt={'12px'} alignItems={'center'}>
            <MyTooltip label={t('common:common.avatar.Select Avatar')}>
              <Avatar
                flexShrink={0}
                src={avatar}
                w={['28px', '32px']}
                h={['28px', '32px']}
                cursor={'pointer'}
                borderRadius={'md'}
                onClick={onOpenSelectFile}
              />
            </MyTooltip>
            <Input
              ml={3}
              flex={1}
              autoFocus
              bg={'myWhite.600'}
              placeholder={t('common:common.Name')}
              maxLength={30}
              {...register('name', {
                required: true
              })}
            />
          </Flex>
        </Box>
        {filterNotHiddenVectorModelList.length > 1 && (
          <Flex
            mt={6}
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              alignItems={'center'}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <Box>{t('common:core.ai.model.Vector Model')}</Box>
              <QuestionTip label={t('common:core.dataset.embedding model tip')} />
            </HStack>
            <Box w={['100%', '300px']}>
              <AIModelSelector
                w={['100%', '300px']}
                value={vectorModel}
                list={filterNotHiddenVectorModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onchange={(e) => {
                  setValue('vectorModel' as const, e);
                }}
              />
            </Box>
          </Flex>
        )}
        {datasetModelList.length > 1 && (
          <Flex
            mt={6}
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <Box>{t('common:core.ai.model.Dataset Agent Model')}</Box>
              <QuestionTip label={t('dataset:file_model_function_tip')} />
            </HStack>
            <Box w={['100%', '300px']}>
              <AIModelSelector
                w={['100%', '300px']}
                value={agentModel}
                list={datasetModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onchange={(e) => {
                  setValue('agentModel' as const, e);
                }}
              />
            </Box>
          </Flex>
        )}
        {type === DatasetTypeEnum.apiDataset && (
          <>
            <Flex mt={6}>
              <Flex
                alignItems={'center'}
                flex={['', '0 0 110px']}
                color={'myGray.900'}
                fontWeight={500}
                fontSize={'sm'}
              >
                {t('dataset:api_url')}
              </Flex>
              <Input
                bg={'myWhite.600'}
                placeholder={t('dataset:api_url')}
                maxLength={200}
                {...register('apiServer.baseUrl', { required: true })}
              />
            </Flex>
            <Flex mt={6}>
              <Flex
                alignItems={'center'}
                flex={['', '0 0 110px']}
                color={'myGray.900'}
                fontWeight={500}
                fontSize={'sm'}
              >
                Authorization
              </Flex>
              <Input
                bg={'myWhite.600'}
                placeholder={t('dataset:request_headers')}
                maxLength={200}
                {...register('apiServer.authorization')}
              />
            </Flex>
          </>
        )}
      </ModalBody>

      <ModalFooter px={9}>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button isLoading={creating} onClick={handleSubmit((data) => onclickCreate(data))}>
          {t('common:common.Confirm Create')}
        </Button>
      </ModalFooter>

      <ComplianceTip pb={6} pt={0} px={9} type={'dataset'} />

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default CreateModal;

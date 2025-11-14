import React, { useState, useMemo } from 'react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Flex, Input, Button, ModalBody, ModalFooter, Box } from '@chakra-ui/react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { getApiDatasetPaths, getApiDatasetCatalog } from '@/web/core/dataset/api';
import type {
  GetResourceFolderListItemResponse,
  GetResourceFolderListProps,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { GetApiDatasetCataLogProps } from '@/pages/api/core/dataset/apiDataset/getCatalog';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useBoolean, useMemoizedFn, useMount } from 'ahooks';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

const ApiDatasetForm = ({
  type,
  datasetId,
  form
}: {
  type: `${DatasetTypeEnum}`;
  datasetId?: string;
  form: UseFormReturn<
    {
      apiDatasetServer?: ApiDatasetServerType;
    },
    any
  >;
}) => {
  const { t } = useTranslation();
  const { register, setValue, watch } = form;

  const apiDatasetServer = watch('apiDatasetServer');
  const yuqueServer = apiDatasetServer?.yuqueServer;
  const feishuServer = apiDatasetServer?.feishuServer;
  const apiServer = apiDatasetServer?.apiServer;

  const [pathNames, setPathNames] = useState(t('dataset:rootdirectory'));
  const [
    isOpenBaseurlSeletModal,
    { setTrue: openBaseurlSeletModal, setFalse: closeBaseurlSelectModal }
  ] = useBoolean();

  const parentId = yuqueServer?.basePath || apiServer?.basePath;

  const canSelectBaseUrl = useMemo(() => {
    switch (type) {
      case DatasetTypeEnum.yuque:
        return yuqueServer?.userId && yuqueServer?.token;
      case DatasetTypeEnum.feishu:
        return feishuServer?.appId && feishuServer?.appSecret;
      case DatasetTypeEnum.apiDataset:
        return !!apiServer?.baseUrl;
      default:
        return false;
    }
  }, [
    type,
    yuqueServer?.userId,
    yuqueServer?.token,
    feishuServer?.appId,
    feishuServer?.appSecret,
    apiServer?.baseUrl
  ]);

  // Unified function to get the current path
  const { loading: isFetching } = useRequest2(
    async () => {
      if (
        !datasetId &&
        ((yuqueServer && (!yuqueServer.userId || !yuqueServer?.token)) ||
          (apiServer && !apiServer?.baseUrl))
      ) {
        return setPathNames(t('dataset:input_required_field_to_select_baseurl'));
      }
      if (!parentId) {
        return setPathNames(t('dataset:rootdirectory'));
      }

      const path = await getApiDatasetPaths({
        datasetId,
        parentId,
        apiDatasetServer
      });
      setPathNames(path);
    },
    {
      manual: false,
      refreshDeps: [datasetId, parentId]
    }
  );

  // Unified handling of directory selection
  const onSelectBaseUrl = async (id: ParentIdType) => {
    const value = id === 'root' || id === null || id === undefined ? '' : id;
    switch (type) {
      case DatasetTypeEnum.yuque:
        setValue('apiDatasetServer.yuqueServer.basePath', value);
        break;
      case DatasetTypeEnum.feishu:
        setValue('apiDatasetServer.feishuServer.folderToken', value);
        break;
      case DatasetTypeEnum.apiDataset:
        setValue('apiDatasetServer.apiServer.basePath', value);
        break;
    }

    closeBaseurlSelectModal();
  };

  const renderBaseUrlSelector = () => (
    <Flex mt={6} alignItems={'center'}>
      <FormLabel flex={['', '0 0 110px']} fontSize={'sm'}>
        Base URL
      </FormLabel>
      <MyBox py={1} fontSize={'sm'} flex={'1 0 0'} overflow="auto" isLoading={isFetching}>
        {pathNames}
      </MyBox>

      <Button
        ml={2}
        variant={'whiteBase'}
        onClick={openBaseurlSeletModal}
        isDisabled={!canSelectBaseUrl}
      >
        {t('dataset:selectDirectory')}
      </Button>
    </Flex>
  );

  // Render the directory selection modal
  const renderDirectoryModal = () =>
    isOpenBaseurlSeletModal ? (
      <BaseUrlSelector
        selectId={yuqueServer?.basePath || apiServer?.basePath || 'root'}
        server={async (e: GetResourceFolderListProps) => {
          const params: GetApiDatasetCataLogProps = {
            parentId: e.parentId,
            apiDatasetServer
          };

          return getApiDatasetCatalog(params);
        }}
        onConfirm={onSelectBaseUrl}
        onClose={closeBaseurlSelectModal}
      />
    ) : null;

  return (
    <>
      {type === DatasetTypeEnum.apiDataset && (
        <>
          <Flex mt={6} alignItems={'center'}>
            <FormLabel flex={['', '0 0 110px']} fontSize={'sm'} required>
              {t('dataset:api_url')}
            </FormLabel>
            <Input
              bg={'myWhite.600'}
              placeholder={t('dataset:api_url')}
              maxLength={200}
              {...register('apiDatasetServer.apiServer.baseUrl', { required: true })}
            />
          </Flex>
          <Flex mt={6} alignItems={'center'}>
            <FormLabel flex={['', '0 0 110px']} fontSize={'sm'} required>
              Authorization
            </FormLabel>
            <Input
              bg={'myWhite.600'}
              placeholder={t('dataset:request_headers')}
              maxLength={2000}
              {...register('apiDatasetServer.apiServer.authorization')}
            />
          </Flex>
          {renderBaseUrlSelector()}
          {renderDirectoryModal()}
        </>
      )}
      {type === DatasetTypeEnum.feishu && (
        <>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              App ID
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'App ID'}
              maxLength={200}
              {...register('apiDatasetServer.feishuServer.appId', { required: true })}
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
              App Secret
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'App Secret'}
              maxLength={200}
              {...register('apiDatasetServer.feishuServer.appSecret', { required: true })}
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
              Folder Token
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'Folder Token'}
              maxLength={200}
              {...register('apiDatasetServer.feishuServer.folderToken', { required: true })}
            />
          </Flex>
          {/* {renderBaseUrlSelector()}
          {renderDirectoryModal()} */}
        </>
      )}
      {type === DatasetTypeEnum.yuque && (
        <>
          <Flex mt={6} alignItems={'center'}>
            <FormLabel flex={['', '0 0 110px']} fontSize={'sm'} required>
              User ID
            </FormLabel>
            <Input
              bg={'myWhite.600'}
              placeholder={'User ID'}
              maxLength={200}
              {...register('apiDatasetServer.yuqueServer.userId', { required: true })}
            />
          </Flex>
          <Flex mt={6} alignItems={'center'}>
            <FormLabel flex={['', '0 0 110px']} fontSize={'sm'} required>
              Token
            </FormLabel>
            <Input
              bg={'myWhite.600'}
              placeholder={'Token'}
              maxLength={200}
              {...register('apiDatasetServer.yuqueServer.token', { required: true })}
            />
          </Flex>
          {renderBaseUrlSelector()}
          {renderDirectoryModal()}
        </>
      )}
    </>
  );
};

export default ApiDatasetForm;

type FolderItemType = {
  id: string;
  name: string;
  open: boolean;
  children?: FolderItemType[];
};
const rootId = 'root';
type Props = {
  selectId: string;
  server: (e: GetResourceFolderListProps) => Promise<GetResourceFolderListItemResponse[]>;
  onConfirm: (id: ParentIdType) => Promise<any>;
  onClose: () => void;
};
const BaseUrlSelector = ({ selectId, server, onConfirm, onClose }: Props) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = React.useState<string>(selectId);
  const [requestingIdList, setRequestingIdList] = useState<ParentIdType[]>([]);
  const [folderList, setFolderList] = useState<FolderItemType[]>([]);

  const { runAsync: requestServer } = useRequest2(async (e: GetResourceFolderListProps) => {
    if (requestingIdList.includes(e.parentId)) return Promise.reject(null);

    setRequestingIdList((state) => [...state, e.parentId]);
    return server(e).finally(() =>
      setRequestingIdList((state) => state.filter((id) => id !== e.parentId))
    );
  }, {});

  // Initialize the folder list
  useMount(async () => {
    const data = await requestServer({ parentId: null });
    setFolderList([
      {
        id: rootId,
        name: t('common:root_folder'),
        open: true,
        children: data.map((item) => ({
          id: item.id,
          name: item.name,
          open: false
        }))
      }
    ]);
  });

  const RenderList = useMemoizedFn(
    ({ list, index = 0 }: { list: FolderItemType[]; index?: number }) => {
      return (
        <>
          {list.map((item) => (
            <Box key={item.id} _notLast={{ mb: 0.5 }} userSelect={'none'}>
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                py={1}
                pl={index === 0 ? '0.5rem' : `${1.75 * (index - 1) + 0.5}rem`}
                pr={2}
                borderRadius={'md'}
                _hover={{
                  bg: 'myGray.100'
                }}
                {...(item.id === selectedId
                  ? {
                      bg: 'primary.50 !important',
                      onClick: () => setSelectedId('')
                    }
                  : {
                      onClick: () => setSelectedId(item.id)
                    })}
              >
                {index !== 0 && (
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    visibility={!item.children || item.children.length > 0 ? 'visible' : 'hidden'}
                    w={'1.25rem'}
                    h={'1.25rem'}
                    cursor={'pointer'}
                    borderRadius={'xs'}
                    _hover={{
                      bg: 'rgba(31, 35, 41, 0.08)'
                    }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (requestingIdList.includes(item.id)) return;

                      if (!item.children) {
                        const data = await requestServer({ parentId: item.id });
                        item.children = data.map((item) => ({
                          id: item.id,
                          name: item.name,
                          open: false
                        }));
                      }
                      item.open = !item.open;
                      setFolderList([...folderList]);
                    }}
                  >
                    <MyIcon
                      name={
                        requestingIdList.includes(item.id)
                          ? 'common/loading'
                          : 'common/rightArrowFill'
                      }
                      w={'1.25rem'}
                      color={'myGray.500'}
                      transform={item.open ? 'rotate(90deg)' : 'none'}
                    />
                  </Flex>
                )}
                <MyIcon ml={index !== 0 ? '0.5rem' : 0} name={FolderIcon} w={'1.25rem'} />
                <Box fontSize={'sm'} ml={2}>
                  {item.name}
                </Box>
              </Flex>
              {item.children && item.open && (
                <Box mt={0.5}>
                  <RenderList list={item.children} index={index + 1} />
                </Box>
              )}
            </Box>
          ))}
        </>
      );
    }
  );

  const { runAsync: onConfirmSelect, loading: confirming } = useRequest2(
    () => {
      if (selectedId) {
        return onConfirm(selectedId === rootId ? null : selectedId);
      }
      return Promise.reject('');
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isLoading={folderList.length === 0}
      iconSrc="/imgs/modal/move.svg"
      isOpen
      w={'30rem'}
      title={t('dataset:selectRootFolder')}
      onClose={onClose}
    >
      <ModalBody flex={'1 0 0'} overflow={'auto'} minH={'400px'}>
        <RenderList list={folderList} />
      </ModalBody>
      <ModalFooter>
        <Button isLoading={confirming} isDisabled={!selectedId} onClick={onConfirmSelect}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

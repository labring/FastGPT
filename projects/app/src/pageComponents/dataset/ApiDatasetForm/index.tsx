import React, { useState, useEffect, useCallback } from 'react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Flex, Input, Button } from '@chakra-ui/react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { getApiDatasetPaths, getApiDatasetCatalog } from '@/web/core/dataset/api';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useBoolean } from 'ahooks';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import type { PluginDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import PluginDatasetForm from './PluginDatasetForm';
import FolderTreeSelectModal from './FolderTreeSelectModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ApiDatasetForm = ({
  type,
  datasetId,
  form
}: {
  type: DatasetTypeEnum;
  datasetId?: string;
  form: UseFormReturn<{ pluginDatasetServer?: PluginDatasetServerType }, any>;
}) => {
  const { pluginDatasets } = useSystemStore();

  // 第三方知识库，使用动态表单
  if (pluginDatasets.some((dataset) => dataset.sourceId === type)) {
    return <PluginDatasetForm pluginId={type} datasetId={datasetId} form={form} />;
  }

  // 自定义 API 文件库，使用专用表单
  if (type === DatasetTypeEnum.apiDataset) {
    return <CustomApiDatasetForm datasetId={datasetId} form={form} />;
  }

  return null;
};

export default ApiDatasetForm;

// 自定义 API 表单组件
const CustomApiDatasetForm = ({
  datasetId,
  form
}: {
  datasetId?: string;
  form: UseFormReturn<{ pluginDatasetServer?: PluginDatasetServerType }, any>;
}) => {
  const { t } = useTranslation();
  const { setValue, watch, getValues } = form;

  const pluginDatasetServer = watch('pluginDatasetServer');
  const pluginConfig = pluginDatasetServer?.config || {};

  const [pathNames, setPathNames] = useState(t('dataset:rootdirectory'));
  const [isOpenModal, { setTrue: openModal, setFalse: closeModal }] = useBoolean();

  // 初始化
  useEffect(() => {
    if (!pluginDatasetServer?.pluginId) {
      setValue('pluginDatasetServer', { pluginId: 'custom-api', config: {} });
    }
  }, [pluginDatasetServer?.pluginId, setValue]);

  const updatePluginConfig = useCallback(
    (key: string, value: any) => {
      const currentServer = getValues('pluginDatasetServer');
      setValue('pluginDatasetServer', {
        pluginId: currentServer?.pluginId || 'custom-api',
        config: { ...(currentServer?.config || {}), [key]: value }
      });
    },
    [getValues, setValue]
  );

  // 获取路径名称
  const { loading: isFetching } = useRequest2(
    async () => {
      if (!datasetId && !pluginConfig.baseUrl) {
        return setPathNames(t('dataset:input_required_field_to_select_baseurl'));
      }
      if (!pluginConfig.basePath) {
        return setPathNames(t('dataset:rootdirectory'));
      }
      const path = await getApiDatasetPaths({
        datasetId,
        parentId: pluginConfig.basePath,
        pluginDatasetServer
      });
      setPathNames(path);
    },
    { manual: false, refreshDeps: [datasetId, pluginConfig.basePath] }
  );

  const handleSelectConfirm = useCallback(
    async (id: ParentIdType) => {
      updatePluginConfig('basePath', id === 'root' || !id ? '' : id);
      closeModal();
    },
    [updatePluginConfig, closeModal]
  );

  return (
    <>
      <Flex mt={6} alignItems={'center'}>
        <FormLabel flex={['', '0 0 110px']} fontSize={'sm'} required>
          {t('dataset:api_url')}
        </FormLabel>
        <Input
          bg={'myWhite.600'}
          placeholder={t('dataset:api_url')}
          maxLength={200}
          value={pluginConfig.baseUrl || ''}
          onChange={(e) => updatePluginConfig('baseUrl', e.target.value)}
        />
      </Flex>

      <Flex mt={6} alignItems={'center'}>
        <FormLabel flex={['', '0 0 110px']} fontSize={'sm'}>
          Authorization
        </FormLabel>
        <Input
          bg={'myWhite.600'}
          placeholder={t('dataset:request_headers')}
          maxLength={2000}
          value={pluginConfig.authorization || ''}
          onChange={(e) => updatePluginConfig('authorization', e.target.value)}
        />
      </Flex>

      <Flex mt={6} alignItems={'center'}>
        <FormLabel flex={['', '0 0 110px']} fontSize={'sm'}>
          Base URL
        </FormLabel>
        <MyBox py={1} fontSize={'sm'} flex={'1 0 0'} overflow="auto" isLoading={isFetching}>
          {pathNames}
        </MyBox>
        <Button ml={2} variant={'whiteBase'} onClick={openModal} isDisabled={!pluginConfig.baseUrl}>
          {t('dataset:selectDirectory')}
        </Button>
      </Flex>

      {isOpenModal && (
        <FolderTreeSelectModal
          selectId={pluginConfig.basePath || 'root'}
          server={(e) => getApiDatasetCatalog({ parentId: e.parentId, pluginDatasetServer })}
          onConfirm={handleSelectConfirm}
          onClose={closeModal}
        />
      )}
    </>
  );
};

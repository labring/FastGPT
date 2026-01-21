import React, { useState, useEffect, useCallback } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useBoolean } from 'ahooks';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type {
  PluginDatasetServerType,
  PluginFormFieldConfig
} from '@fastgpt/global/core/dataset/apiDataset/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  getApiDatasetPaths,
  getApiDatasetCatalog,
  getPluginDatasetSourceConfig
} from '@/web/core/dataset/api';
import FormFieldRenderer from './FormFieldRenderer';
import FolderTreeSelectModal from './FolderTreeSelectModal';

type PluginDatasetFormProps = {
  pluginId: string;
  datasetId?: string;
  form: UseFormReturn<{ pluginDatasetServer?: PluginDatasetServerType }, any>;
};

const PluginDatasetForm = ({ pluginId, datasetId, form }: PluginDatasetFormProps) => {
  const { t } = useTranslation();
  const { setValue, watch, getValues } = form;

  const pluginDatasetServer = watch('pluginDatasetServer');
  const pluginConfig = pluginDatasetServer?.config || {};

  const [formFields, setFormFields] = useState<PluginFormFieldConfig[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [currentTreeSelectField, setCurrentTreeSelectField] = useState<string | null>(null);
  const [pathNames, setPathNames] = useState<Record<string, string>>({});
  const [isOpenModal, { setTrue: openModal, setFalse: closeModal }] = useBoolean();

  // 初始化 pluginDatasetServer
  useEffect(() => {
    if (!pluginDatasetServer?.pluginId || pluginDatasetServer.pluginId !== pluginId) {
      setValue('pluginDatasetServer', { pluginId, config: {} });
    }
  }, [pluginId, pluginDatasetServer?.pluginId, setValue]);

  // 加载插件配置
  useEffect(() => {
    if (!pluginId) return;
    setLoadingConfig(true);
    getPluginDatasetSourceConfig(pluginId)
      .then((config) => setFormFields((config?.formFields as PluginFormFieldConfig[]) || []))
      .catch(() => setFormFields([]))
      .finally(() => setLoadingConfig(false));
  }, [pluginId]);

  const updatePluginConfig = useCallback(
    (key: string, value: any) => {
      const currentServer = getValues('pluginDatasetServer');
      setValue('pluginDatasetServer', {
        pluginId: currentServer?.pluginId || pluginId,
        config: { ...(currentServer?.config || {}), [key]: value }
      });
    },
    [getValues, setValue, pluginId]
  );

  // 获取路径名称
  const { loading: isFetchingPath, runAsync: fetchPathNames } = useRequest2(
    async (fieldKey: string) => {
      const parentId = pluginConfig[fieldKey];
      if (!parentId) return t('dataset:rootdirectory');
      try {
        return await getApiDatasetPaths({ datasetId, parentId, pluginDatasetServer });
      } catch {
        return t('dataset:rootdirectory');
      }
    },
    { manual: true }
  );

  const updateFieldPathName = useCallback(
    async (fieldKey: string) => {
      const pathName = await fetchPathNames(fieldKey);
      setPathNames((prev) => ({ ...prev, [fieldKey]: pathName }));
    },
    [fetchPathNames]
  );

  // 监听 tree-select 字段值变化
  useEffect(() => {
    formFields
      .filter((f) => f.type === 'tree-select' && pluginConfig[f.key] !== undefined)
      .forEach((f) => updateFieldPathName(f.key));
  }, [formFields, pluginConfig, updateFieldPathName]);

  const canOpenTreeSelect = useCallback(
    () =>
      formFields
        .filter((f) => f.required && f.type !== 'tree-select')
        .every((f) => !!pluginConfig[f.key]),
    [formFields, pluginConfig]
  );

  const handleOpenTreeSelect = useCallback(
    (fieldKey: string) => {
      setCurrentTreeSelectField(fieldKey);
      openModal();
    },
    [openModal]
  );

  const handleTreeSelectConfirm = useCallback(
    async (id: ParentIdType) => {
      if (!currentTreeSelectField) return;
      updatePluginConfig(currentTreeSelectField, id === 'root' || !id ? '' : id);
      closeModal();
      setCurrentTreeSelectField(null);
    },
    [currentTreeSelectField, updatePluginConfig, closeModal]
  );

  if (loadingConfig) {
    return <MyBox py={6} minH={'120px'} isLoading={true} />;
  }

  if (formFields.length === 0) {
    return null;
  }

  return (
    <>
      {formFields.map((field) => (
        <FormFieldRenderer
          key={field.key}
          field={field}
          value={pluginConfig[field.key]}
          onChange={(value) => updatePluginConfig(field.key, value)}
          onOpenTreeSelect={
            field.type === 'tree-select' ? () => handleOpenTreeSelect(field.key) : undefined
          }
          treeSelectLoading={isFetchingPath && currentTreeSelectField === field.key}
          treeSelectDisplayValue={pathNames[field.key]}
          canOpenTreeSelect={canOpenTreeSelect()}
        />
      ))}

      {isOpenModal && currentTreeSelectField && (
        <FolderTreeSelectModal
          selectId={pluginConfig[currentTreeSelectField] || 'root'}
          server={(e) => getApiDatasetCatalog({ parentId: e.parentId, pluginDatasetServer })}
          onConfirm={handleTreeSelectConfirm}
          onClose={() => {
            closeModal();
            setCurrentTreeSelectField(null);
          }}
        />
      )}
    </>
  );
};

export default PluginDatasetForm;

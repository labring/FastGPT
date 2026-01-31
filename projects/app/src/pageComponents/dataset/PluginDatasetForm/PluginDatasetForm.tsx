import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type {
  PluginDatasetServerType,
  PluginFormFieldConfig
} from '@fastgpt/global/core/dataset/pluginDataset/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  getPluginDatasetPaths,
  getPluginDatasetCatalog,
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
  const { setValue, watch, getValues, register } = form;

  const pluginDatasetServer = watch('pluginDatasetServer');
  const pluginConfig = pluginDatasetServer?.config || {};

  const [formFields, setFormFields] = useState<PluginFormFieldConfig[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [currentTreeSelectField, setCurrentTreeSelectField] = useState<string | null>(null);
  const [pathNames, setPathNames] = useState<Record<string, string>>({});

  const prevTreeSelectValuesRef = useRef<Record<string, string>>({});

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

  const { loading: isFetchingPath, runAsync: fetchPathNames } = useRequest(
    async (fieldKey: string, parentIdOverride?: string) => {
      const parentId = parentIdOverride ?? pluginConfig[fieldKey];
      if (!parentId) return t('dataset:rootdirectory');

      const currentServer = getValues('pluginDatasetServer');
      if (!currentServer?.pluginId) return t('dataset:rootdirectory');

      return getPluginDatasetPaths({
        datasetId,
        parentId,
        pluginDatasetServer: currentServer
      }).catch(() => t('dataset:rootdirectory'));
    },
    { manual: true }
  );

  const updateFieldPathName = useCallback(
    async (fieldKey: string, parentIdOverride?: string) => {
      const pathName = await fetchPathNames(fieldKey, parentIdOverride);
      setPathNames((prev) => ({ ...prev, [fieldKey]: pathName }));
    },
    [fetchPathNames]
  );

  const isConfigComplete = useCallback(() => {
    return formFields
      .filter((f) => f.required && f.type !== 'tree-select')
      .every((f) => !!pluginConfig[f.key]);
  }, [formFields, pluginConfig]);

  const treeSelectValues = useMemo(() => {
    return formFields
      .filter((f) => f.type === 'tree-select')
      .reduce(
        (acc, f) => {
          acc[f.key] = pluginConfig[f.key] || '';
          return acc;
        },
        {} as Record<string, string>
      );
  }, [formFields, pluginConfig]);

  useEffect(() => {
    if (!isConfigComplete()) return;

    const prevValues = prevTreeSelectValuesRef.current;
    Object.entries(treeSelectValues).forEach(([fieldKey, value]) => {
      if (value && prevValues[fieldKey] !== value) {
        updateFieldPathName(fieldKey);
      }
    });
    prevTreeSelectValuesRef.current = treeSelectValues;
  }, [treeSelectValues, isConfigComplete, updateFieldPathName]);

  const closeTreeSelect = useCallback(() => setCurrentTreeSelectField(null), []);

  const handleTreeSelectConfirm = useCallback(
    async (id: ParentIdType) => {
      if (!currentTreeSelectField) return;
      const newValue = id === 'root' || !id ? '' : id;
      updatePluginConfig(currentTreeSelectField, newValue);
      updateFieldPathName(currentTreeSelectField, newValue);
      closeTreeSelect();
    },
    [currentTreeSelectField, updatePluginConfig, updateFieldPathName, closeTreeSelect]
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
            field.type === 'tree-select' ? () => setCurrentTreeSelectField(field.key) : undefined
          }
          treeSelectLoading={isFetchingPath && currentTreeSelectField === field.key}
          treeSelectDisplayValue={pathNames[field.key]}
          canOpenTreeSelect={isConfigComplete()}
          register={register}
          fieldPath={`pluginDatasetServer.config.${field.key}`}
        />
      ))}

      {currentTreeSelectField && pluginDatasetServer && (
        <FolderTreeSelectModal
          selectId={pluginConfig[currentTreeSelectField] || 'root'}
          server={(e) => {
            const { basePath, folderToken, ...restConfig } = pluginDatasetServer.config;
            return getPluginDatasetCatalog({
              parentId: e.parentId,
              pluginDatasetServer: { ...pluginDatasetServer, config: restConfig }
            });
          }}
          onConfirm={handleTreeSelectConfirm}
          onClose={closeTreeSelect}
        />
      )}
    </>
  );
};

export default PluginDatasetForm;

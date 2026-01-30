import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { PluginDatasetServerType } from '@fastgpt/global/core/dataset/pluginDataset/type';
import type { PluginDatasetSourceId } from '@fastgpt/global/sdk/fastgpt-plugin';
import PluginDatasetFormContent from './PluginDatasetForm';
import { usePluginStore } from '@/web/core/plugin/store/plugin';

const PluginDatasetForm = ({
  type,
  datasetId,
  form
}: {
  type: PluginDatasetSourceId;
  datasetId?: string;
  form: UseFormReturn<{ pluginDatasetServer?: PluginDatasetServerType }, any>;
}) => {
  const { pluginDatasets } = usePluginStore();

  const isPluginSource = pluginDatasets.some((dataset) => dataset.sourceId === type);

  if (!isPluginSource) {
    return null;
  }

  return <PluginDatasetFormContent pluginId={type} datasetId={datasetId} form={form} />;
};

export default PluginDatasetForm;

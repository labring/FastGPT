import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { PluginDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { PluginDatasetSourceId } from '@fastgpt/global/sdk/fastgpt-plugin';
import PluginDatasetForm from './PluginDatasetForm';
import { usePluginStore } from '@/web/core/plugin/store/plugin';

const ApiDatasetForm = ({
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

  return <PluginDatasetForm pluginId={type} datasetId={datasetId} form={form} />;
};

export default ApiDatasetForm;

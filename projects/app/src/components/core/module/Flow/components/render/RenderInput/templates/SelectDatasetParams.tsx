import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { getFlowStore, onChangeNode, useFlowProviderStoreType } from '../../../../FlowProvider';
import { Button, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { chatModelList } from '@/web/common/system/staticData';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DatasetParamsModal from '@/components/core/module/DatasetParamsModal';

const SelectDatasetParam = ({ inputs = [], moduleId }: RenderInputProps) => {
  const [nodes, setNodes] = useState<useFlowProviderStoreType['nodes']>([]);

  const { t } = useTranslation();
  const [data, setData] = useState({
    searchMode: DatasetSearchModeEnum.embedding,
    limit: 5,
    similarity: 0.5,
    usingReRank: false
  });

  const tokenLimit = useMemo(() => {
    let maxTokens = 3000;

    nodes.forEach((item) => {
      if (item.type === FlowNodeTypeEnum.chatNode) {
        const model =
          item.data.inputs.find((item) => item.key === ModuleInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken =
          chatModelList.find((item) => item.model === model)?.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens;
  }, [nodes]);

  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    inputs.forEach((input) => {
      // @ts-ignore
      if (data[input.key] !== undefined) {
        setData((state) => ({
          ...state,
          [input.key]: input.value
        }));
      }
    });
  }, [inputs]);

  useEffect(() => {
    async () => {
      const { nodes } = await getFlowStore();
      setNodes(nodes);
    };
  }, []);

  return (
    <>
      <Button
        variant={'whitePrimary'}
        leftIcon={<MyIcon name={'common/settingLight'} w={'14px'} />}
        onClick={onOpen}
      >
        {t('core.dataset.search.Params Setting')}
      </Button>
      {isOpen && (
        <DatasetParamsModal
          {...data}
          maxTokens={tokenLimit}
          onClose={onClose}
          onSuccess={(e) => {
            for (let key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                moduleId,
                type: 'updateInput',
                key,
                value: {
                  ...item,
                  //@ts-ignore
                  value: e[key]
                }
              });
            }
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectDatasetParam);

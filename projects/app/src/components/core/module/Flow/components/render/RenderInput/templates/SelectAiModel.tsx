import React, { useCallback, useEffect } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import MySelect from '@/components/Select';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { chatModelList, cqModelList, extractModelList } from '@/web/common/system/staticData';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';

const SelectAiModelRender = ({ item, inputs = [], moduleId }: RenderInputProps) => {
  const modelList = (() => {
    if (item.type === FlowNodeInputTypeEnum.selectChatModel) return chatModelList;
    if (item.type === FlowNodeInputTypeEnum.selectCQModel) return cqModelList;
    if (item.type === FlowNodeInputTypeEnum.selectExtractModel) return extractModelList;

    return [];
  })().map((item) => ({
    model: item.model,
    name: item.name,
    maxResponse: item.maxResponse,
    price: item.price
  }));

  const onChangeModel = useCallback(
    (e: string) => {
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });

      // update max tokens
      const model = modelList.find((item) => item.model === e) || modelList[0];
      if (!model) return;

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: 'maxToken',
        value: {
          ...inputs.find((input) => input.key === 'maxToken'),
          markList: [
            { label: '100', value: 100 },
            { label: `${model.maxResponse}`, value: model.maxResponse }
          ],
          max: model.maxResponse,
          value: model.maxResponse / 2
        }
      });
    },
    [inputs, item, modelList, moduleId]
  );

  const list = modelList.map((item) => {
    const priceStr = `(${formatPrice(item.price, 1000)}元/1k Tokens)`;

    return {
      value: item.model,
      label: `${item.name}${priceStr}`
    };
  });

  useEffect(() => {
    if (!item.value && list.length > 0) {
      onChangeModel(list[0].value);
    }
  }, [item.value, list, onChangeModel]);

  return (
    <MySelect
      minW={'350px'}
      width={'100%'}
      value={item.value}
      list={list}
      onchange={onChangeModel}
    />
  );
};

export default React.memo(SelectAiModelRender);

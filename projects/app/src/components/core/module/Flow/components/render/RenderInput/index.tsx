import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { Box } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import dynamic from 'next/dynamic';
import type { EditFieldModeType } from '../../modules/FieldEditModal';
import { feConfigs } from '@/web/common/system/staticData';

import InputLabel from './Label';
import type { RenderInputProps } from './type.d';

const RenderList: {
  types: `${FlowNodeInputTypeEnum}`[];
  Component: React.ComponentType<RenderInputProps>;
}[] = [
  {
    types: [FlowNodeInputTypeEnum.input],
    Component: dynamic(() => import('./templates/TextInput'))
  },
  {
    types: [FlowNodeInputTypeEnum.numberInput],
    Component: dynamic(() => import('./templates/NumberInput'))
  },
  {
    types: [FlowNodeInputTypeEnum.switch],
    Component: dynamic(() => import('./templates/Switch'))
  },
  {
    types: [FlowNodeInputTypeEnum.textarea],
    Component: dynamic(() => import('./templates/Textarea'))
  },
  {
    types: [FlowNodeInputTypeEnum.select],
    Component: dynamic(() => import('./templates/Select'))
  },
  {
    types: [FlowNodeInputTypeEnum.slider],
    Component: dynamic(() => import('./templates/Slider'))
  },
  {
    types: [FlowNodeInputTypeEnum.selectApp],
    Component: dynamic(() => import('./templates/SelectApp'))
  },
  {
    types: [FlowNodeInputTypeEnum.aiSettings],
    Component: dynamic(() => import('./templates/AiSetting'))
  },
  {
    types: [
      FlowNodeInputTypeEnum.selectChatModel,
      FlowNodeInputTypeEnum.selectCQModel,
      FlowNodeInputTypeEnum.selectExtractModel
    ],
    Component: dynamic(() => import('./templates/SelectAiModel'))
  },
  {
    types: [FlowNodeInputTypeEnum.selectDataset],
    Component: dynamic(() => import('./templates/SelectDataset'))
  },
  {
    types: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
    Component: dynamic(() => import('./templates/SelectDatasetParams'))
  },
  {
    types: [FlowNodeInputTypeEnum.addInputParam],
    Component: dynamic(() => import('./templates/AddInputParam'))
  }
];

const RenderInput = ({
  flowInputList,
  moduleId,
  CustomComponent = {},
  editFiledType
}: {
  flowInputList: FlowNodeInputItemType[];
  moduleId: string;
  CustomComponent?: Record<string, (e: FlowNodeInputItemType) => React.ReactNode>;
  editFiledType?: EditFieldModeType;
}) => {
  const sortInputs = useMemo(
    () =>
      flowInputList
        .filter((item) => !item.plusField || feConfigs.isPlus)
        .sort((a, b) => {
          if (a.type === FlowNodeInputTypeEnum.addInputParam) {
            return 1;
          }
          if (b.type === FlowNodeInputTypeEnum.addInputParam) {
            return -1;
          }

          if (a.type === FlowNodeInputTypeEnum.switch) {
            return -1;
          }

          return 0;
        }),
    [flowInputList]
  );

  return (
    <>
      {sortInputs.map((input) => {
        const RenderComponent = (() => {
          if (input.type === FlowNodeInputTypeEnum.custom && CustomComponent[input.key]) {
            return <>{CustomComponent[input.key]({ ...input })}</>;
          }
          const Component = RenderList.find((item) => item.types.includes(input.type))?.Component;

          if (!Component) return null;
          return <Component inputs={sortInputs} item={input} moduleId={moduleId} />;
        })();

        return (
          input.type !== FlowNodeInputTypeEnum.hidden && (
            <Box key={input.key} _notLast={{ mb: 7 }} position={'relative'}>
              {!!input.label && (
                <InputLabel
                  editFiledType={editFiledType}
                  moduleId={moduleId}
                  inputKey={input.key}
                  {...input}
                />
              )}
              {!!RenderComponent && (
                <Box mt={2} className={'nodrag'}>
                  {RenderComponent}
                </Box>
              )}
            </Box>
          )
        );
      })}
    </>
  );
};

export default React.memo(RenderInput);

import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { Box } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import dynamic from 'next/dynamic';

import InputLabel from './Label';
import type { RenderInputProps } from './type.d';
import { useFlowProviderStore } from '../../../FlowProvider';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';

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
    types: [FlowNodeInputTypeEnum.selectLLMModel],
    Component: dynamic(() => import('./templates/SelectLLMModel'))
  },
  {
    types: [FlowNodeInputTypeEnum.settingLLMModel],
    Component: dynamic(() => import('./templates/SettingLLMModel'))
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
  },
  {
    types: [FlowNodeInputTypeEnum.JSONEditor],
    Component: dynamic(() => import('./templates/JsonEditor'))
  },
  {
    types: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
    Component: dynamic(() => import('./templates/SettingQuotePrompt'))
  }
];
const UserChatInput = dynamic(() => import('./templates/UserChatInput'));

type Props = {
  flowInputList: FlowNodeInputItemType[];
  moduleId: string;
  CustomComponent?: Record<string, (e: FlowNodeInputItemType) => React.ReactNode>;
};
const RenderInput = ({ flowInputList, moduleId, CustomComponent }: Props) => {
  const { mode } = useFlowProviderStore();

  const sortInputs = useMemo(
    () =>
      JSON.stringify(
        [...flowInputList].sort((a, b) => {
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
        })
      ),
    [flowInputList]
  );
  const filterInputs = useMemo(() => {
    const parseSortInputs = JSON.parse(sortInputs) as FlowNodeInputItemType[];
    return parseSortInputs.filter((input) => {
      if (mode === 'app' && input.hideInApp) return false;
      if (mode === 'plugin' && input.hideInPlugin) return false;

      return true;
    });
  }, [mode, sortInputs]);

  const memoCustomComponent = useMemo(() => CustomComponent || {}, [CustomComponent]);

  const Render = useMemo(() => {
    return filterInputs.map((input) => {
      const RenderComponent = (() => {
        if (input.type === FlowNodeInputTypeEnum.custom && memoCustomComponent[input.key]) {
          return <>{memoCustomComponent[input.key]({ ...input })}</>;
        }
        const Component = RenderList.find((item) => item.types.includes(input.type))?.Component;

        if (!Component) return null;
        return <Component inputs={filterInputs} item={input} moduleId={moduleId} />;
      })();

      return input.type !== FlowNodeInputTypeEnum.hidden ? (
        <Box key={input.key} _notLast={{ mb: 7 }} position={'relative'}>
          {input.key === ModuleInputKeyEnum.userChatInput && (
            <UserChatInput inputs={filterInputs} item={input} moduleId={moduleId} />
          )}
          {!!input.label && (
            <InputLabel moduleId={moduleId} inputKey={input.key} mode={mode} {...input} />
          )}
          {!!RenderComponent && (
            <Box mt={2} className={'nodrag'}>
              {RenderComponent}
            </Box>
          )}
        </Box>
      ) : null;
    });
  }, [filterInputs, memoCustomComponent, mode, moduleId]);

  return <>{Render}</>;
};

export default React.memo(RenderInput);

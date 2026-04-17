import React, { useMemo } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import OutputLabel from './Label';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import DynamicOutputs from './DynamicOutputs';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const RenderOutput = ({
  nodeId,
  flowOutputList
}: {
  nodeId: string;
  flowOutputList: FlowNodeOutputItemType[];
}) => {
  const dynamicOutputs = useMemoEnhance(
    () => flowOutputList.filter((item) => item.type === FlowNodeOutputTypeEnum.dynamic),
    [flowOutputList]
  );
  const addOutput = useMemo(
    () => dynamicOutputs.find((item) => item.key === NodeOutputKeyEnum.addOutputParam),
    [dynamicOutputs]
  );
  const filterAddOutput = useMemo(
    () => dynamicOutputs.filter((item) => item.key !== NodeOutputKeyEnum.addOutputParam),
    [dynamicOutputs]
  );

  return (
    <>
      {addOutput && (
        <DynamicOutputs nodeId={nodeId} outputs={filterAddOutput} addOutput={addOutput} />
      )}
      <>
        {flowOutputList.map((output, i) => {
          if (
            output.type === FlowNodeOutputTypeEnum.dynamic ||
            output.type === FlowNodeOutputTypeEnum.hidden
          )
            return null;
          if (!output.label || output.invalid === true) return null;

          return (
            <FormLabel
              key={output.key}
              required={output.required}
              position={'relative'}
              _notLast={{
                mb: i !== flowOutputList.length - 1 ? 4 : 0
              }}
            >
              <OutputLabel nodeId={nodeId} output={output} />
            </FormLabel>
          );
        })}
      </>
    </>
  );
};

export default React.memo(RenderOutput);

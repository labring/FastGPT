import React, { useMemo, useState } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { Box, Button, Flex } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import OutputLabel from './Label';
import { RenderOutputProps } from './type';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import VariableTable from '../VariableTable';
import { EditNodeFieldType } from '@fastgpt/global/core/workflow/node/type';
import { FlowValueTypeMap } from '@/web/core/workflow/constants/dataType';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const RenderList: {
  types: FlowNodeOutputTypeEnum[];
  Component: React.ComponentType<RenderOutputProps>;
}[] = [];

const RenderOutput = ({
  nodeId,
  flowOutputList
}: {
  nodeId: string;
  flowOutputList: FlowNodeOutputItemType[];
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const outputString = useMemo(() => JSON.stringify(flowOutputList), [flowOutputList]);
  const copyOutputs = useMemo(() => {
    const parseOutputs = JSON.parse(outputString) as FlowNodeOutputItemType[];

    return parseOutputs;
  }, [outputString]);

  const [createField, setCreateField] = useState<EditNodeFieldType>();
  const [editField, setEditField] = useState<EditNodeFieldType>();

  const RenderDynamicOutputs = useMemo(() => {
    const dynamicOutputs = copyOutputs.filter(
      (item) => item.type === FlowNodeOutputTypeEnum.dynamic
    );

    const addOutput = dynamicOutputs.find((item) => item.key === NodeOutputKeyEnum.addOutputParam);
    const filterAddOutput = dynamicOutputs.filter(
      (item) => item.key !== NodeOutputKeyEnum.addOutputParam
    );

    return dynamicOutputs.length === 0 || !addOutput ? null : (
      <Box mb={5}>
        <Flex
          mb={2}
          className="nodrag"
          cursor={'default'}
          alignItems={'center'}
          position={'relative'}
        >
          <Box position={'relative'} fontWeight={'medium'}>
            {t('core.workflow.Custom outputs')}
          </Box>
          <QuestionTip ml={1} label={addOutput.description} />
          <Box flex={'1 0 0'} />
          <Button
            variant={'whitePrimary'}
            leftIcon={<SmallAddIcon />}
            iconSpacing={1}
            size={'sm'}
            onClick={() => {
              setCreateField({});
            }}
          >
            {t('common.Add New')}
          </Button>
        </Flex>
        <VariableTable
          fieldEditType={addOutput.editField}
          keys={copyOutputs.map((output) => output.key)}
          onCloseFieldEdit={() => {
            setCreateField(undefined);
            setEditField(undefined);
          }}
          variables={filterAddOutput.map((output) => ({
            label: output.label || '-',
            type: output.valueType ? t(FlowValueTypeMap[output.valueType]?.label) : '-',
            key: output.key
          }))}
          createField={createField}
          onCreate={({ data }) => {
            if (!data.key) {
              return;
            }

            const newOutput: FlowNodeOutputItemType = {
              id: getNanoid(),
              type: FlowNodeOutputTypeEnum.dynamic,
              key: data.key,
              valueType: data.valueType,
              label: data.key
            };

            onChangeNode({
              nodeId,
              type: 'addOutput',
              value: newOutput
            });
            setCreateField(undefined);
          }}
          editField={editField}
          onStartEdit={(e) => {
            const output = copyOutputs.find((output) => output.key === e);
            if (!output) return;
            setEditField({
              valueType: output.valueType,
              required: output.required,
              key: output.key,
              label: output.label,
              description: output.description
            });
          }}
          onEdit={({ data, changeKey }) => {
            if (!data.key || !editField?.key) return;

            const output = copyOutputs.find((output) => output.key === editField.key);

            const newOutput: FlowNodeOutputItemType = {
              ...(output as FlowNodeOutputItemType),
              valueType: data.valueType,
              key: data.key,
              label: data.label,
              description: data.description
            };

            if (changeKey) {
              onChangeNode({
                nodeId,
                type: 'replaceOutput',
                key: editField.key,
                value: newOutput
              });
            } else {
              onChangeNode({
                nodeId,
                type: 'updateOutput',
                key: newOutput.key,
                value: newOutput
              });
            }
            setEditField(undefined);
          }}
          onDelete={(key) => {
            onChangeNode({
              nodeId,
              type: 'delOutput',
              key
            });
          }}
        />
      </Box>
    );
  }, [copyOutputs, createField, editField, nodeId, onChangeNode, t]);

  const RenderCommonOutputs = useMemo(() => {
    const renderOutputs = copyOutputs.filter(
      (item) =>
        item.type !== FlowNodeOutputTypeEnum.dynamic && item.type !== FlowNodeOutputTypeEnum.hidden
    );
    return (
      <>
        {renderOutputs.map((output) => {
          return output.label ? (
            <Box key={output.key} _notLast={{ mb: 5 }} position={'relative'}>
              {output.required && (
                <Box position={'absolute'} left={'-6px'} top={-1} color={'red.600'}>
                  *
                </Box>
              )}
              <OutputLabel nodeId={nodeId} output={output} />
            </Box>
          ) : null;
        })}
      </>
    );
  }, [copyOutputs, nodeId]);

  return (
    <>
      {RenderDynamicOutputs}
      {RenderCommonOutputs}
    </>
  );
};

export default React.memo(RenderOutput);

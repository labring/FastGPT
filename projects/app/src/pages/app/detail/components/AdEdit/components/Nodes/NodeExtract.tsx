import React, { useState } from 'react';
import { Box, Button, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import { NodeProps } from 'reactflow';
import { FlowModuleItemType } from '@/types/core/app/flow';
import { useTranslation } from 'next-i18next';
import NodeCard from '../modules/NodeCard';
import Container from '../modules/Container';
import { AddIcon } from '@chakra-ui/icons';
import RenderInput from '../render/RenderInput';
import Divider from '../modules/Divider';
import { ContextExtractAgentItemType } from '@/types/app';
import RenderOutput from '../render/RenderOutput';
import MyIcon from '@/components/Icon';
import ExtractFieldModal from '../modules/ExtractFieldModal';
import { ContextExtractEnum } from '@/constants/flow/flowField';
import { FlowOutputItemTypeEnum, FlowValueTypeEnum } from '@/constants/flow';
import { useFlowStore } from '../Provider';

const NodeExtract = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { inputs, outputs, moduleId } = data;
  const { t } = useTranslation();
  const [editExtractFiled, setEditExtractField] = useState<ContextExtractAgentItemType>();
  const { onChangeNode, onDelEdge } = useFlowStore();

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={{
            [ContextExtractEnum.extractKeys]: ({
              value: extractKeys = [],
              ...props
            }: {
              value?: ContextExtractAgentItemType[];
            }) => (
              <Box pt={2}>
                <Box position={'absolute'} top={0} right={0}>
                  <Button
                    variant={'base'}
                    leftIcon={<AddIcon fontSize={'10px'} />}
                    onClick={() =>
                      setEditExtractField({
                        desc: '',
                        key: '',
                        required: true
                      })
                    }
                  >
                    新增字段
                  </Button>
                </Box>
                <TableContainer>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>字段 key</Th>
                        <Th>字段描述</Th>
                        <Th>必须</Th>
                        <Th></Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {extractKeys.map((item, index) => (
                        <Tr
                          key={index}
                          position={'relative'}
                          whiteSpace={'pre-wrap'}
                          wordBreak={'break-all'}
                        >
                          <Td>{item.key}</Td>
                          <Td>{item.desc}</Td>
                          <Td>{item.required ? '✔' : ''}</Td>
                          <Td whiteSpace={'nowrap'}>
                            <MyIcon
                              mr={3}
                              name={'settingLight'}
                              w={'16px'}
                              cursor={'pointer'}
                              onClick={() => {
                                setEditExtractField(item);
                              }}
                            />
                            <MyIcon
                              name={'delete'}
                              w={'16px'}
                              cursor={'pointer'}
                              onClick={() => {
                                const newInputValue = extractKeys.filter(
                                  (extract) => item.key !== extract.key
                                );
                                const newOutputVal = outputs.filter(
                                  (output) => output.key !== item.key
                                );

                                onChangeNode({
                                  moduleId,
                                  type: 'inputs',
                                  key: ContextExtractEnum.extractKeys,
                                  value: {
                                    ...props,
                                    value: newInputValue
                                  }
                                });
                                onChangeNode({
                                  moduleId,
                                  type: 'outputs',
                                  key: '',
                                  value: newOutputVal
                                });
                                onDelEdge({ moduleId, sourceHandle: item.key });
                              }}
                            />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </Box>
            )
          }}
        />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>

      {!!editExtractFiled && (
        <ExtractFieldModal
          defaultField={editExtractFiled}
          onClose={() => setEditExtractField(undefined)}
          onSubmit={(data) => {
            const extracts: ContextExtractAgentItemType[] =
              inputs.find((item) => item.key === ContextExtractEnum.extractKeys)?.value || [];

            const exists = extracts.find((item) => item.key === editExtractFiled.key);

            const newInputs = exists
              ? extracts.map((item) => (item.key === editExtractFiled.key ? data : item))
              : extracts.concat(data);

            onChangeNode({
              moduleId,
              type: 'inputs',
              key: ContextExtractEnum.extractKeys,
              value: {
                ...inputs.find((input) => input.key === ContextExtractEnum.extractKeys),
                value: newInputs
              }
            });

            if (!exists) {
              onChangeNode({
                moduleId,
                type: 'outputs',
                key: '',
                value: outputs.concat({
                  key: data.key,
                  label: `提取结果-${data.desc}`,
                  description: '无法提取时不会返回',
                  valueType: FlowValueTypeEnum.string,
                  type: FlowOutputItemTypeEnum.source,
                  targets: []
                })
              });
            } else {
              if (editExtractFiled.key === data.key) {
                // update
                onChangeNode({
                  moduleId,
                  type: 'outputs',
                  key: '',
                  value: outputs.map((output) =>
                    output.key === data.key
                      ? {
                          ...output,
                          label: `提取结果-${data.desc}`
                        }
                      : output
                  )
                });
              } else {
                // del and push
                const newOutputs = outputs.filter((output) => output.key !== editExtractFiled.key);

                onChangeNode({
                  moduleId,
                  type: 'outputs',
                  key: '',
                  value: newOutputs
                });
                setTimeout(() => {
                  onChangeNode({
                    moduleId,
                    type: 'outputs',
                    key: '',
                    value: newOutputs.concat({
                      key: data.key,
                      label: `提取结果-${data.desc}`,
                      description: '无法提取时不会返回',
                      valueType: FlowValueTypeEnum.string,
                      type: FlowOutputItemTypeEnum.source,
                      targets: []
                    })
                  });
                }, 10);
              }
            }

            setEditExtractField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeExtract);

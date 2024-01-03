import React, { useState } from 'react';
import { Box, Button, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import { NodeProps } from 'reactflow';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import { useTranslation } from 'next-i18next';
import NodeCard from '../../render/NodeCard';
import Container from '../../modules/Container';
import { AddIcon } from '@chakra-ui/icons';
import RenderInput from '../../render/RenderInput';
import Divider from '../../modules/Divider';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/module/type';
import RenderOutput from '../../render/RenderOutput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ExtractFieldModal, { defaultField } from './ExtractFieldModal';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';
import { onChangeNode } from '../../../FlowProvider';

const NodeExtract = React.memo(function NodeExtract({ data }: { data: FlowModuleItemType }) {
  const { inputs, outputs, moduleId } = data;
  const { t } = useTranslation();
  const [editExtractFiled, setEditExtractField] = useState<ContextExtractAgentItemType>();

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={{
            [ModuleInputKeyEnum.extractKeys]: ({
              value: extractKeys = [],
              ...props
            }: {
              value?: ContextExtractAgentItemType[];
            }) => (
              <Box pt={2}>
                <Box position={'absolute'} top={0} right={0}>
                  <Button
                    variant={'whitePrimary'}
                    leftIcon={<AddIcon fontSize={'10px'} />}
                    onClick={() => setEditExtractField(defaultField)}
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
                              name={'common/settingLight'}
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
                                onChangeNode({
                                  moduleId,
                                  type: 'updateInput',
                                  key: ModuleInputKeyEnum.extractKeys,
                                  value: {
                                    ...props,
                                    value: extractKeys.filter((extract) => item.key !== extract.key)
                                  }
                                });

                                onChangeNode({
                                  moduleId,
                                  type: 'delOutput',
                                  key: item.key
                                });
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
              inputs.find((item) => item.key === ModuleInputKeyEnum.extractKeys)?.value || [];

            const exists = extracts.find((item) => item.key === editExtractFiled.key);

            const newInputs = exists
              ? extracts.map((item) => (item.key === editExtractFiled.key ? data : item))
              : extracts.concat(data);

            onChangeNode({
              moduleId,
              type: 'updateInput',
              key: ModuleInputKeyEnum.extractKeys,
              value: {
                ...inputs.find((input) => input.key === ModuleInputKeyEnum.extractKeys),
                value: newInputs
              }
            });

            const newOutput = {
              key: data.key,
              label: `提取结果-${data.desc}`,
              description: '无法提取时不会返回',
              valueType: ModuleIOValueTypeEnum.string,
              type: FlowNodeOutputTypeEnum.source,
              targets: []
            };

            if (exists) {
              if (editExtractFiled.key === data.key) {
                const output = outputs.find((output) => output.key === data.key);
                // update
                onChangeNode({
                  moduleId,
                  type: 'updateOutput',
                  key: data.key,
                  value: {
                    ...output,
                    label: `提取结果-${data.desc}`
                  }
                });
              } else {
                onChangeNode({
                  moduleId,
                  type: 'replaceOutput',
                  key: editExtractFiled.key,
                  value: newOutput
                });
              }
            } else {
              onChangeNode({
                moduleId,
                type: 'addOutput',
                value: newOutput
              });
            }

            setEditExtractField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
});

export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <NodeExtract data={data} />;
}

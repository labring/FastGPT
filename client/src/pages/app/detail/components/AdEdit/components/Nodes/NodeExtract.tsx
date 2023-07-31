import React, { useState } from 'react';
import { Box, Button, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import { NodeProps } from 'reactflow';
import { FlowModuleItemType } from '@/types/flow';
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

const NodeExtract = ({
  data: { inputs, outputs, moduleId, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const [editExtractFiled, setEditExtractField] = useState<ContextExtractAgentItemType>();

  return (
    <NodeCard minW={'380px'} moduleId={moduleId} {...props}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          onChangeNode={onChangeNode}
          flowInputList={inputs}
          CustomComponent={{
            [ContextExtractEnum.extractKeys]: ({
              key,
              value: extractKeys = []
            }: {
              key: string;
              value?: ContextExtractAgentItemType[];
            }) => (
              <Box>
                <TableContainer>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>字段 key</Th>
                        <Th>字段描述</Th>
                        <Th>必填</Th>
                        <Th></Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {extractKeys.map((item, index) => (
                        <Tr key={index}>
                          <Td>{item.key}</Td>
                          <Td whiteSpace={'pre-line'} wordBreak={'break-all'}>
                            {item.desc}{' '}
                          </Td>
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
                                onChangeNode({
                                  moduleId,
                                  type: 'inputs',
                                  key: ContextExtractEnum.extractKeys,
                                  value: extractKeys.filter((extract) => item.key !== extract.key)
                                });
                              }}
                            />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
                <Box mt={2} textAlign={'right'}>
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
              </Box>
            )
          }}
        />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput flowOutputList={outputs} />
      </Container>

      {!!editExtractFiled && (
        <ExtractFieldModal
          defaultField={editExtractFiled}
          onClose={() => setEditExtractField(undefined)}
          onSubmit={(data) => {
            const extracts: ContextExtractAgentItemType[] =
              inputs.find((item) => item.key === ContextExtractEnum.extractKeys)?.value || [];

            const exists = extracts.find((item) => item.key === editExtractFiled.key);

            if (exists) {
              onChangeNode({
                moduleId,
                type: 'inputs',
                key: ContextExtractEnum.extractKeys,
                value: extracts.map((item) => (item.key === editExtractFiled.key ? data : item))
              });
            } else {
              onChangeNode({
                moduleId,
                type: 'inputs',
                key: ContextExtractEnum.extractKeys,
                value: extracts.concat(data)
              });
            }

            setEditExtractField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};

export default NodeExtract;

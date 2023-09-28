import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import { FlowModuleItemType } from '@/types/core/app/flow';
import { Flex, Box, Button, useTheme, useDisclosure, Grid } from '@chakra-ui/react';
import { useDatasetStore } from '@/store/dataset';
import { useQuery } from '@tanstack/react-query';
import NodeCard from '../modules/NodeCard';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import { DatasetSelectModal } from '../../../DatasetSelectModal';
import type { SelectedDatasetType } from '@/types/core/dataset';
import Avatar from '@/components/Avatar';
import { useFlowStore } from '../Provider';

const KBSelect = ({
  activeKbs = [],
  onChange
}: {
  activeKbs: SelectedDatasetType;
  onChange: (e: SelectedDatasetType) => void;
}) => {
  const theme = useTheme();
  const { allDatasets, loadAllDatasets } = useDatasetStore();
  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const showKbList = useMemo(
    () => allDatasets.filter((item) => activeKbs.find((kb) => kb.kbId === item._id)),
    [allDatasets, activeKbs]
  );

  useQuery(['loadAllDatasets'], loadAllDatasets);

  return (
    <>
      <Grid gridTemplateColumns={'1fr 1fr'} gridGap={4}>
        <Button h={'36px'} onClick={onOpenKbSelect}>
          选择知识库
        </Button>
        {showKbList.map((item) => (
          <Flex
            key={item._id}
            alignItems={'center'}
            h={'36px'}
            border={theme.borders.base}
            px={2}
            borderRadius={'md'}
          >
            <Avatar src={item.avatar} w={'24px'}></Avatar>
            <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
              {item.name}
            </Box>
          </Flex>
        ))}
      </Grid>
      <DatasetSelectModal
        isOpen={isOpenKbSelect}
        activeKbs={activeKbs}
        onChange={onChange}
        onClose={onCloseKbSelect}
      />
    </>
  );
};

const NodeKbSearch = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs } = data;
  const { onChangeNode } = useFlowStore();

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={{
            kbList: ({ key, value, ...props }) => (
              <KBSelect
                activeKbs={value}
                onChange={(e) => {
                  onChangeNode({
                    moduleId,
                    key,
                    type: 'inputs',
                    value: {
                      ...props,
                      key,
                      value: e
                    }
                  });
                }}
              />
            )
          }}
        />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeKbSearch);

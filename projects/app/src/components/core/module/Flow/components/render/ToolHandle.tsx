import MyTooltip from '@/components/MyTooltip';
import { FlowValueTypeMap } from '@/web/core/workflow/constants/dataType';
import { Box, BoxProps } from '@chakra-ui/react';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum
} from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';
import { Connection, Handle, Position } from 'reactflow';
import { useFlowProviderStore } from '../../FlowProvider';
import { useCallback } from 'react';

type ToolHandleProps = BoxProps & {
  moduleId: string;
};
export const ToolTargetHandle = ({ moduleId }: ToolHandleProps) => {
  const { t } = useTranslation();

  const valueTypeMap = FlowValueTypeMap[ModuleIOValueTypeEnum.tools];

  return (
    <MyTooltip
      label={t('app.module.type', {
        type: t(valueTypeMap?.label),
        description: valueTypeMap?.description
      })}
      shouldWrapChildren={false}
    >
      <Handle
        style={{
          borderRadius: '0',
          backgroundColor: 'transparent'
        }}
        type="target"
        id={ModuleOutputKeyEnum.selectedTools}
        position={Position.Top}
      >
        <Box
          w={'14px'}
          h={'14px'}
          border={'4px solid #5E8FFF'}
          transform={'translate(-40%,-30%) rotate(45deg)'}
          pointerEvents={'none'}
        />
      </Handle>
    </MyTooltip>
  );
};

export const ToolSourceHandle = ({ moduleId }: ToolHandleProps) => {
  const { t } = useTranslation();
  const { setEdges, nodes } = useFlowProviderStore();

  const valueTypeMap = FlowValueTypeMap[ModuleIOValueTypeEnum.tools];

  /* onConnect edge, delete tool input and switch */
  const onConnect = useCallback(
    (e: Connection) => {
      const node = nodes.find((node) => node.id === e.target);
      if (!node) return;
      const inputs = node.data.inputs;
      setEdges((edges) =>
        edges.filter((edge) => {
          const input = inputs.find((input) => input.key === edge.targetHandle);
          if (
            edge.target === node.id &&
            (!!input?.toolDescription || input?.key === ModuleInputKeyEnum.switch)
          ) {
            return false;
          }
          return true;
        })
      );
    },
    [nodes, setEdges]
  );

  return (
    <MyTooltip
      label={t('app.module.type', {
        type: t(valueTypeMap?.label),
        description: valueTypeMap?.description
      })}
      shouldWrapChildren={false}
    >
      <Handle
        style={{
          borderRadius: '0',
          backgroundColor: 'transparent'
        }}
        type="source"
        id={ModuleOutputKeyEnum.selectedTools}
        position={Position.Bottom}
        onConnect={onConnect}
      >
        <Box
          w={'14px'}
          h={'14px'}
          border={'4px solid #5E8FFF'}
          transform={'translate(-40%,-30%) rotate(45deg)'}
          pointerEvents={'none'}
        />
      </Handle>
    </MyTooltip>
  );
};

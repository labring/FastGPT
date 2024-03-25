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
export const ToolTargetHandle = ({ moduleId, ...props }: ToolHandleProps) => {
  const { t } = useTranslation();

  const valueTypeMap = FlowValueTypeMap[ModuleIOValueTypeEnum.tools];

  return (
    <Box position={'absolute'} left={'50%'} transform={'translate(-17px,-10px)'} {...props}>
      <MyTooltip
        label={t('app.module.type', {
          type: t(valueTypeMap?.label),
          description: valueTypeMap?.description
        })}
      >
        <Handle
          style={{
            width: '14px',
            height: '14px',
            border: '4px solid #5E8FFF',
            borderRadius: '0',
            backgroundColor: 'transparent',
            transformOrigin: 'center',
            transform: 'rotate(45deg)'
          }}
          type="target"
          id={ModuleOutputKeyEnum.selectedTools}
          position={Position.Top}
        />
      </MyTooltip>
    </Box>
  );
};

export const ToolSourceHandle = ({ moduleId, ...props }: ToolHandleProps) => {
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
    <Box position={'absolute'} left={'50%'} transform={'translate(-16px,-14px)'} {...props}>
      <MyTooltip
        label={t('app.module.type', {
          type: t(valueTypeMap?.label),
          description: valueTypeMap?.description
        })}
      >
        <Handle
          style={{
            width: '14px',
            height: '14px',
            border: '4px solid #5E8FFF',
            borderRadius: '0',
            backgroundColor: 'transparent',
            transformOrigin: 'center',
            transform: 'rotate(45deg)'
          }}
          type="source"
          id={ModuleOutputKeyEnum.selectedTools}
          position={Position.Bottom}
          onConnect={onConnect}
        />
      </MyTooltip>
    </Box>
  );
};

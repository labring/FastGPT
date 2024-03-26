import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import TargetHandle from '../../TargetHandle';
import SourceHandle from '../../SourceHandle';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useFlowProviderStore } from '../../../../FlowProvider';

const TriggerAndFinish = ({ moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  const { nodes } = useFlowProviderStore();

  const outputs = useMemo(
    () => nodes.find((node) => node.data.moduleId === moduleId)?.data?.outputs || [],
    [moduleId, nodes]
  );
  const hasFinishOutput = useMemo(
    () => outputs.some((output) => output.key === ModuleOutputKeyEnum.finish),
    [outputs]
  );

  const Render = useMemo(
    () => (
      <Flex
        className="nodrag"
        cursor={'default'}
        alignItems={'center'}
        justifyContent={'space-between'}
        position={'relative'}
      >
        <Box position={'relative'}>
          <TargetHandle handleKey={ModuleInputKeyEnum.switch} valueType={'any'} />
          {t('core.module.input.label.switch')}
        </Box>
        {hasFinishOutput && (
          <Box position={'relative'}>
            {t('core.module.output.label.running done')}
            <SourceHandle handleKey={ModuleOutputKeyEnum.finish} valueType={'boolean'} />
          </Box>
        )}
      </Flex>
    ),
    [hasFinishOutput, t]
  );

  return Render;
};

export default React.memo(TriggerAndFinish);

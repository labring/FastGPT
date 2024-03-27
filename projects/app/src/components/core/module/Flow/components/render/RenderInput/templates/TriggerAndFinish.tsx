import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import TargetHandle from '../../TargetHandle';
import SourceHandle from '../../SourceHandle';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useFlowProviderStore } from '../../../../FlowProvider';

const TriggerAndFinish = ({ moduleId, isTool }: { moduleId: string; isTool: boolean }) => {
  const { t } = useTranslation();
  const { nodes } = useFlowProviderStore();

  const inputs = useMemo(
    () => nodes.find((node) => node.data.moduleId === moduleId)?.data?.inputs || [],
    [moduleId, nodes]
  );
  const hasSwitch = useMemo(
    () => inputs.some((input) => input.key === ModuleInputKeyEnum.switch),
    [inputs]
  );
  const outputs = useMemo(
    () => nodes.find((node) => node.data.moduleId === moduleId)?.data?.outputs || [],
    [moduleId, nodes]
  );
  const hasFinishOutput = useMemo(
    () => outputs.some((output) => output.key === ModuleOutputKeyEnum.finish),
    [outputs]
  );

  const Render = useMemo(() => {
    return (
      <Flex
        className="nodrag"
        cursor={'default'}
        alignItems={'center'}
        justifyContent={'space-between'}
        position={'relative'}
      >
        <Box position={'relative'}>
          {!isTool && (
            <Box mt={2}>
              <TargetHandle handleKey={ModuleInputKeyEnum.switch} valueType={'any'} />
              {t('core.module.input.label.switch')}
            </Box>
          )}
        </Box>
        {hasFinishOutput && (
          <Box position={'relative'} mt={2}>
            {t('core.module.output.label.running done')}
            <SourceHandle handleKey={ModuleOutputKeyEnum.finish} valueType={'boolean'} />
          </Box>
        )}
      </Flex>
    );
  }, [hasFinishOutput, isTool, t]);

  return hasSwitch ? Render : null;
};

export default React.memo(TriggerAndFinish);

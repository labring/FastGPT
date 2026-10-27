import { Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import React, { useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { SmallAddIcon } from '@chakra-ui/icons';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type {
  AppFormEditFormType,
  SelectedToolItemType
} from '@fastgpt/global/core/app/formEdit/type';
import ToolSelectModal from './ToolSelectModal';
import ConfigToolModal from '../../component/ConfigToolModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { getToolIdentityKey, normalizeToolIdentity } from '@fastgpt/global/core/app/tool/utils';
import SelectedToolCard from '@/components/core/app/SelectedToolCard';

const ToolSelect = ({
  generatedSelectedTools,
  selectedModel,
  selectedTools = [],
  fileSelectConfig = {},
  onAddTool,
  onUpdateTool,
  onRemoveTool
}: {
  generatedSelectedTools?: SelectedToolItemType[];
  selectedModel?: MyLLMModelItemType;
  selectedTools?: SelectedToolItemType[];
  fileSelectConfig?: AppFileSelectConfigType;
  onAddTool: (tool: SelectedToolItemType) => void;
  onUpdateTool: (tool: SelectedToolItemType) => void;
  onRemoveTool: (id: string, source?: string) => void;
}) => {
  const { t } = useTranslation();

  const [configTool, setConfigTool] = useState<AppFormEditFormType['selectedTools'][number] | null>(
    null
  );

  const {
    isOpen: isOpenToolsSelect,
    onOpen: onOpenToolsSelect,
    onClose: onCloseToolsSelect
  } = useDisclosure();

  return (
    <>
      <Flex alignItems={'center'}>
        <Flex alignItems={'center'} flex={1}>
          <MyIcon name={'core/app/toolCall'} w={'20px'} />
          <FormLabel ml={2}>{t('app:tools')}</FormLabel>
          <QuestionTip ml={1} label={t('app:tools_tip')} />
        </Flex>
        <Button
          variant={'transparentBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          mr={'-5px'}
          size={'sm'}
          fontSize={'sm'}
          onClick={onOpenToolsSelect}
          isDisabled={!selectedModel}
        >
          {t('common:Choose')}
        </Button>
      </Flex>
      <Grid
        mt={selectedTools.length > 0 ? 2 : 0}
        gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
        gridGap={[2, 4]}
      >
        {selectedTools.map((item) => (
          <SelectedToolCard
            key={getToolIdentityKey(item.pluginId || item.id, item.source)}
            tool={item}
            onConfig={(tool) => setConfigTool(normalizeToolIdentity(tool))}
            onDelete={(tool) => onRemoveTool(tool.pluginId ?? tool.id, tool.source)}
          />
        ))}
      </Grid>

      {isOpenToolsSelect && selectedModel && (
        <ToolSelectModal
          generatedSelectedTools={generatedSelectedTools}
          selectedTools={selectedTools}
          fileSelectConfig={fileSelectConfig}
          onAddTool={onAddTool}
          onRemoveTool={(e) => {
            onRemoveTool(e.id, e.source);
          }}
          onClose={onCloseToolsSelect}
        />
      )}
      {configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={() => setConfigTool(null)}
          onAddTool={(e) => {
            onUpdateTool({
              ...e,
              configStatus: 'configured'
            });
          }}
        />
      )}
    </>
  );
};

export default React.memo(ToolSelect);

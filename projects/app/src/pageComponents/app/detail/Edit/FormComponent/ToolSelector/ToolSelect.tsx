import { Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { SmallAddIcon } from '@chakra-ui/icons';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import SelectedToolCardList from '@/components/core/app/SelectedToolCardList';
import ToolSelectModal from './ToolSelectModal';

const ToolSelect = ({
  generatedSelectedTools,
  selectedModel,
  selectedTools = [],
  fileSelectConfig = {},
  onAddTool,
  onConfigTool,
  onRemoveTool
}: {
  generatedSelectedTools?: SelectedToolItemType[];
  selectedModel?: MyLLMModelItemType;
  selectedTools?: SelectedToolItemType[];
  fileSelectConfig?: AppFileSelectConfigType;
  onAddTool: (tool: SelectedToolItemType) => void;
  onConfigTool: (tool: SelectedToolItemType) => void;
  onRemoveTool: (id: string, source?: string) => void;
}) => {
  const { t } = useTranslation();

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
        <SelectedToolCardList
          selectedTools={selectedTools}
          onConfigTool={onConfigTool}
          onRemoveTool={onRemoveTool}
        />
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
    </>
  );
};

export default React.memo(ToolSelect);

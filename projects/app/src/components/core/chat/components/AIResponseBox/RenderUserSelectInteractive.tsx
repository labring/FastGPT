import { Box } from '@chakra-ui/react';
import type { UserSelectInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import React from 'react';
import { SelectOptionsComponent } from '../Interactive/InteractiveComponents';
import {
  ChoiceCollapseToggleButton,
  SelectedAnswerText,
  useInteractiveChoiceCollapse
} from '../Interactive/InteractiveChoiceCollapse';
import InteractiveCard from './InteractiveCard';
import { onSendPrompt } from './utils';

const RenderUserSelectInteractive = React.memo(function RenderUserSelectInteractive({
  interactive
}: {
  interactive: UserSelectInteractive;
}) {
  const [submittedAnswer, setSubmittedAnswer] = React.useState('');
  const effectiveAnswer = interactive.params.userSelectedVal || submittedAnswer;
  const {
    isOptionsExpanded,
    selectedAnswerPlacement,
    shouldShowOptions,
    collapseOptions,
    toggleOptionsExpanded
  } = useInteractiveChoiceCollapse(effectiveAnswer);

  return (
    <InteractiveCard>
      {selectedAnswerPlacement === 'above' && (
        <Box mb={3}>
          <SelectedAnswerText answer={effectiveAnswer} />
        </Box>
      )}
      {shouldShowOptions && (
        <SelectOptionsComponent
          interactiveParams={{
            ...interactive.params,
            userSelectedVal: effectiveAnswer
          }}
          onSelect={(value) => {
            setSubmittedAnswer(value);
            collapseOptions();
            onSendPrompt(value);
          }}
        />
      )}
      {selectedAnswerPlacement === 'below' && (
        <Box mt={3}>
          <SelectedAnswerText answer={effectiveAnswer} />
        </Box>
      )}
      <ChoiceCollapseToggleButton
        answer={effectiveAnswer}
        isOptionsExpanded={isOptionsExpanded}
        onToggle={toggleOptionsExpanded}
        mt={selectedAnswerPlacement === 'above' && !shouldShowOptions ? 0 : 3}
      />
    </InteractiveCard>
  );
});

export default RenderUserSelectInteractive;

import type { UserSelectInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import React from 'react';
import { SelectOptionsComponent } from '../Interactive/InteractiveComponents';
import InteractiveCard from './InteractiveCard';
import { onSendPrompt } from './utils';

const RenderUserSelectInteractive = React.memo(function RenderUserSelectInteractive({
  interactive
}: {
  interactive: UserSelectInteractive;
}) {
  return (
    <InteractiveCard>
      <SelectOptionsComponent
        interactiveParams={interactive.params}
        onSelect={(value) => {
          onSendPrompt(value);
        }}
      />
    </InteractiveCard>
  );
});

export default RenderUserSelectInteractive;

import type { UserSelectInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import React from 'react';
import { SelectOptionsComponent } from '../Interactive/InteractiveComponents';
import { onSendPrompt } from './utils';

const RenderUserSelectInteractive = React.memo(function RenderUserSelectInteractive({
  interactive
}: {
  interactive: UserSelectInteractive;
}) {
  return (
    <SelectOptionsComponent
      interactiveParams={interactive.params}
      onSelect={(value) => {
        onSendPrompt(value);
      }}
    />
  );
});

export default RenderUserSelectInteractive;

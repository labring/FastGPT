import React from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';

const SandboxIframe = () => {
  const sandboxEndpointUrl = useContextSelector(SkillDetailContext, (v) => v.sandboxEndpointUrl);

  if (!sandboxEndpointUrl) return null;

  return (
    <Box w={'100%'} h={'100%'}>
      <iframe
        src={sandboxEndpointUrl}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-presentation allow-same-origin"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: '100%',
          border: 'none'
        }}
      />
    </Box>
  );
};

export default React.memo(SandboxIframe);

import dynamic from 'next/dynamic';

const InteractiveTerminal = dynamic(() => import('./InteractiveTerminalCore'), {
  ssr: false
});

export default InteractiveTerminal;

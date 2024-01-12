import { generateQA } from '../events/generateQA';
import { generateVector } from '../events/generateVector';

/* start task */
export const startQueue = () => {
  if (!global.systemEnv) return;

  generateQA();
  generateVector();
};

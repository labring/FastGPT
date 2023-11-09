import { generateQA } from '../events/generateQA';
import { generateVector } from '../events/generateVector';

/* start task */
export const startQueue = (limit?: number) => {
  if (!global.systemEnv) return;

  if (limit) {
    for (let i = 0; i < limit; i++) {
      generateVector();
      generateQA();
    }
    return;
  }
  for (let i = 0; i < global.systemEnv.qaMaxProcess; i++) {
    generateQA();
  }
  for (let i = 0; i < global.systemEnv.vectorMaxProcess; i++) {
    generateVector();
  }
};

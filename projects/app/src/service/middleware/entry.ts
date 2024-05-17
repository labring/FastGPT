import { connectToDatabase } from '../mongo';
import { NextEntry } from '@fastgpt/service/common/middle/entry';

export const NextAPI = NextEntry({
  beforeCallback: [connectToDatabase()]
});

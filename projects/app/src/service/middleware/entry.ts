import { NextEntry } from '@fastgpt/service/common/middle/entry';
import { useTeamFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';

export const NextAPI = NextEntry({
  beforeCallback: [useTeamFrequencyLimit()]
});

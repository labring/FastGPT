import { ReadPreference } from './index';

export const readFromSecondary = {
  readPreference: ReadPreference.SECONDARY_PREFERRED, // primary | primaryPreferred | secondary | secondaryPreferred | nearest
  readConcern: 'local' as any // local | majority | linearizable | available
};

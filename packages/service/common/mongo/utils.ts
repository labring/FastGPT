import { ReadPreference } from './index';

export const readFromSecondary = {
  readPreference: ReadPreference.SECONDARY_PREFERRED, // primary | primaryPreferred | secondary | secondaryPreferred | nearest
  readConcern: {
    level: 'local' as any
  } // local | majority | linearizable | available
};

export const writePrimary = {
  writeConcern: {
    w: 1,
    journal: false
  }
};

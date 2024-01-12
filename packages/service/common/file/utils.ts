import fs from 'fs';
import { tmpFileDirPath } from './constants';

export const removeFilesByPaths = (paths: string[]) => {
  paths.forEach((path) => {
    fs.unlink(path, (err) => {
      if (err) {
        console.error(err);
      }
    });
  });
};

/* cron job.  check expired tmp files */
export const checkExpiredTmpFiles = () => {
  // get all file name
  const files = fs.readdirSync(tmpFileDirPath).map((name) => {
    const timestampStr = name.split('-')[0];
    const expiredTimestamp = timestampStr ? Number(timestampStr) : 0;

    return {
      filename: name,
      expiredTimestamp,
      path: `${tmpFileDirPath}/${name}`
    };
  });

  // count expiredFiles
  const expiredFiles = files.filter((item) => item.expiredTimestamp < Date.now());

  // remove expiredFiles
  removeFilesByPaths(expiredFiles.map((item) => item.path));
};

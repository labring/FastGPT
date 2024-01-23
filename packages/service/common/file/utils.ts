import fs from 'fs';

export const removeFilesByPaths = (paths: string[]) => {
  paths.forEach((path) => {
    fs.unlink(path, (err) => {
      if (err) {
        // console.error(err);
      }
    });
  });
};

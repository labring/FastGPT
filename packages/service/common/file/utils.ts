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

export const guessBase64ImageType = (str: string) => {
  const imageTypeMap: Record<string, string> = {
    '/': 'image/jpeg',
    i: 'image/png',
    R: 'image/gif',
    U: 'image/webp',
    Q: 'image/bmp'
  };

  const defaultType = 'image/jpeg';
  if (typeof str !== 'string' || str.length === 0) {
    return defaultType;
  }

  const firstChar = str.charAt(0);
  return imageTypeMap[firstChar] || defaultType;
};

export const clearDirFiles = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  fs.readdirSync(dirPath).forEach((file) => {
    const curPath = `${dirPath}/${file}`;
    if (fs.lstatSync(curPath).isDirectory()) {
      clearDirFiles(curPath);
    } else {
      fs.unlinkSync(curPath);
    }
  });
};

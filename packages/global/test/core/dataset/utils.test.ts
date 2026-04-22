import { describe, it, expect } from 'vitest';
import {
  getCollectionIcon,
  getSourceNameIcon,
  predictDataLimitLength
} from '@fastgpt/global/core/dataset/utils';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';

describe('getCollectionIcon', () => {
  it('should return folder icon when type is folder', () => {
    const result = getCollectionIcon({ type: DatasetCollectionTypeEnum.folder });
    expect(result).toBe('common/folderFill');
  });

  it('should return link icon when type is link', () => {
    const result = getCollectionIcon({ type: DatasetCollectionTypeEnum.link });
    expect(result).toBe('common/linkBlue');
  });

  it('should return virtual/manual icon when type is virtual', () => {
    const result = getCollectionIcon({ type: DatasetCollectionTypeEnum.virtual });
    expect(result).toBe('file/fill/manual');
  });

  it('should return images icon when type is images', () => {
    const result = getCollectionIcon({ type: DatasetCollectionTypeEnum.images });
    expect(result).toBe('core/dataset/imageFill');
  });

  it('should call getSourceNameIcon for file type with name', () => {
    const result = getCollectionIcon({
      type: DatasetCollectionTypeEnum.file,
      name: 'document.pdf'
    });
    expect(result).toBe('file/fill/pdf');
  });

  it('should use default type (file) when type is not provided', () => {
    const result = getCollectionIcon({ name: 'test.txt' });
    expect(result).toBe('file/fill/txt');
  });

  it('should use default name (empty string) when name is not provided', () => {
    const result = getCollectionIcon({ type: DatasetCollectionTypeEnum.file });
    expect(result).toBe('file/fill/file');
  });

  it('should handle empty object', () => {
    const result = getCollectionIcon({});
    expect(result).toBe('file/fill/file');
  });

  it('should handle externalFile type', () => {
    const result = getCollectionIcon({
      type: DatasetCollectionTypeEnum.externalFile,
      name: 'data.xlsx'
    });
    expect(result).toBe('file/fill/xlsx');
  });

  it('should handle apiFile type', () => {
    const result = getCollectionIcon({
      type: DatasetCollectionTypeEnum.apiFile,
      name: 'report.csv'
    });
    expect(result).toBe('file/fill/csv');
  });

  it('should pass sourceId to getSourceNameIcon', () => {
    const result = getCollectionIcon({
      type: DatasetCollectionTypeEnum.file,
      name: 'unknown',
      sourceId: 'https://example.com/file'
    });
    expect(result).toBe('common/linkBlue');
  });
});

describe('getSourceNameIcon', () => {
  describe('file extension recognition', () => {
    it('should return pdf icon for .pdf files', () => {
      const result = getSourceNameIcon({ sourceName: 'document.pdf' });
      expect(result).toBe('file/fill/pdf');
    });

    it('should return ppt icon for .ppt files', () => {
      const result = getSourceNameIcon({ sourceName: 'presentation.ppt' });
      expect(result).toBe('file/fill/ppt');
    });

    it('should return xlsx icon for .xlsx files', () => {
      const result = getSourceNameIcon({ sourceName: 'spreadsheet.xlsx' });
      expect(result).toBe('file/fill/xlsx');
    });

    it('should return csv icon for .csv files', () => {
      const result = getSourceNameIcon({ sourceName: 'data.csv' });
      expect(result).toBe('file/fill/csv');
    });

    it('should return doc icon for .doc files', () => {
      const result = getSourceNameIcon({ sourceName: 'document.doc' });
      expect(result).toBe('file/fill/doc');
    });

    it('should return doc icon for .docs files', () => {
      const result = getSourceNameIcon({ sourceName: 'document.docs' });
      expect(result).toBe('file/fill/doc');
    });

    it('should return txt icon for .txt files', () => {
      const result = getSourceNameIcon({ sourceName: 'readme.txt' });
      expect(result).toBe('file/fill/txt');
    });

    it('should return markdown icon for .md files', () => {
      const result = getSourceNameIcon({ sourceName: 'README.md' });
      expect(result).toBe('file/fill/markdown');
    });

    it('should return html icon for .html files', () => {
      const result = getSourceNameIcon({ sourceName: 'index.html' });
      expect(result).toBe('file/fill/html');
    });
  });

  describe('image file recognition', () => {
    it('should return image icon for .jpg files', () => {
      const result = getSourceNameIcon({ sourceName: 'photo.jpg' });
      expect(result).toBe('image');
    });

    it('should return image icon for .jpeg files', () => {
      const result = getSourceNameIcon({ sourceName: 'photo.jpeg' });
      expect(result).toBe('image');
    });

    it('should return image icon for .png files', () => {
      const result = getSourceNameIcon({ sourceName: 'image.png' });
      expect(result).toBe('image');
    });

    it('should return image icon for .gif files', () => {
      const result = getSourceNameIcon({ sourceName: 'animation.gif' });
      expect(result).toBe('image');
    });

    it('should return image icon for .webp files', () => {
      const result = getSourceNameIcon({ sourceName: 'image.webp' });
      expect(result).toBe('image');
    });

    it('should return image icon for .svg files', () => {
      const result = getSourceNameIcon({ sourceName: 'icon.svg' });
      expect(result).toBe('image');
    });
  });

  describe('audio file recognition', () => {
    it('should return audio icon for .mp3 files', () => {
      const result = getSourceNameIcon({ sourceName: 'audio.mp3' });
      expect(result).toBe('file/fill/audio');
    });

    it('should return audio icon for .wav files', () => {
      const result = getSourceNameIcon({ sourceName: 'sound.wav' });
      expect(result).toBe('file/fill/audio');
    });

    it('should return audio icon for .ogg files', () => {
      const result = getSourceNameIcon({ sourceName: 'music.ogg' });
      expect(result).toBe('file/fill/audio');
    });
  });

  describe('video file recognition', () => {
    it('should return video icon for .mp4 files', () => {
      const result = getSourceNameIcon({ sourceName: 'video.mp4' });
      expect(result).toBe('file/fill/video');
    });

    it('should return video icon for .mov files', () => {
      const result = getSourceNameIcon({ sourceName: 'clip.mov' });
      expect(result).toBe('file/fill/video');
    });

    it('should return video icon for .avi files', () => {
      const result = getSourceNameIcon({ sourceName: 'movie.avi' });
      expect(result).toBe('file/fill/video');
    });
  });

  describe('sourceId link detection', () => {
    it('should return link icon when sourceId is http link and no file extension', () => {
      const result = getSourceNameIcon({
        sourceName: 'unknown',
        sourceId: 'http://example.com/resource'
      });
      expect(result).toBe('common/linkBlue');
    });

    it('should return link icon when sourceId is https link and no file extension', () => {
      const result = getSourceNameIcon({
        sourceName: 'noextension',
        sourceId: 'https://example.com/api/data'
      });
      expect(result).toBe('common/linkBlue');
    });

    it('should return link icon when sourceId starts with www', () => {
      const result = getSourceNameIcon({
        sourceName: 'file',
        sourceId: 'www.example.com/page'
      });
      expect(result).toBe('common/linkBlue');
    });

    it('should return link icon when sourceId starts with /', () => {
      const result = getSourceNameIcon({
        sourceName: 'file',
        sourceId: '/api/resource'
      });
      expect(result).toBe('common/linkBlue');
    });

    it('should prioritize file icon over sourceId link', () => {
      const result = getSourceNameIcon({
        sourceName: 'document.pdf',
        sourceId: 'https://example.com/document.pdf'
      });
      expect(result).toBe('file/fill/pdf');
    });
  });

  describe('default and edge cases', () => {
    it('should return default file icon for unknown extension', () => {
      const result = getSourceNameIcon({ sourceName: 'file.xyz' });
      expect(result).toBe('file/fill/file');
    });

    it('should return default file icon for file without extension', () => {
      const result = getSourceNameIcon({ sourceName: 'noextension' });
      expect(result).toBe('file/fill/file');
    });

    it('should return default file icon for empty sourceName', () => {
      const result = getSourceNameIcon({ sourceName: '' });
      expect(result).toBe('file/fill/file');
    });

    it('should handle URL encoded sourceName', () => {
      const result = getSourceNameIcon({ sourceName: 'document%20file.pdf' });
      expect(result).toBe('file/fill/pdf');
    });

    it('should handle sourceName with special characters', () => {
      const result = getSourceNameIcon({ sourceName: 'my-file_v2.0.txt' });
      expect(result).toBe('file/fill/txt');
    });

    it('should handle case insensitive file extensions', () => {
      const result = getSourceNameIcon({ sourceName: 'DOCUMENT.PDF' });
      expect(result).toBe('file/fill/pdf');
    });

    it('should return default icon when sourceId is undefined', () => {
      const result = getSourceNameIcon({ sourceName: 'unknown', sourceId: undefined });
      expect(result).toBe('file/fill/file');
    });

    it('should return default icon when sourceId is empty string', () => {
      const result = getSourceNameIcon({ sourceName: 'unknown', sourceId: '' });
      expect(result).toBe('file/fill/file');
    });

    it('should return default icon when sourceId is not a valid link', () => {
      const result = getSourceNameIcon({ sourceName: 'unknown', sourceId: 'not-a-link' });
      expect(result).toBe('file/fill/file');
    });
  });

  describe('error handling', () => {
    it('should catch decodeURIComponent errors and return default icon', () => {
      // Invalid percent encoding that would cause decodeURIComponent to throw
      const result = getSourceNameIcon({ sourceName: '%E0%A4%A' });
      expect(result).toBe('file/fill/file');
    });
  });
});

describe('predictDataLimitLength', () => {
  describe('qa mode', () => {
    it('should return data.length * 20 for qa mode', () => {
      const data = [1, 2, 3, 4, 5];
      const result = predictDataLimitLength(TrainingModeEnum.qa, data);
      expect(result).toBe(100);
    });

    it('should return 0 for qa mode with empty array', () => {
      const result = predictDataLimitLength(TrainingModeEnum.qa, []);
      expect(result).toBe(0);
    });

    it('should handle single item array for qa mode', () => {
      const result = predictDataLimitLength(TrainingModeEnum.qa, [1]);
      expect(result).toBe(20);
    });
  });

  describe('auto mode', () => {
    it('should return data.length * 5 for auto mode', () => {
      const data = [1, 2, 3, 4, 5];
      const result = predictDataLimitLength(TrainingModeEnum.auto, data);
      expect(result).toBe(25);
    });

    it('should return 0 for auto mode with empty array', () => {
      const result = predictDataLimitLength(TrainingModeEnum.auto, []);
      expect(result).toBe(0);
    });

    it('should handle single item array for auto mode', () => {
      const result = predictDataLimitLength(TrainingModeEnum.auto, [1]);
      expect(result).toBe(5);
    });
  });

  describe('image mode', () => {
    it('should return data.length * 2 for image mode', () => {
      const data = [1, 2, 3, 4, 5];
      const result = predictDataLimitLength(TrainingModeEnum.image, data);
      expect(result).toBe(10);
    });

    it('should return 0 for image mode with empty array', () => {
      const result = predictDataLimitLength(TrainingModeEnum.image, []);
      expect(result).toBe(0);
    });

    it('should handle single item array for image mode', () => {
      const result = predictDataLimitLength(TrainingModeEnum.image, [1]);
      expect(result).toBe(2);
    });
  });

  describe('default modes (chunk, parse, imageParse)', () => {
    it('should return data.length for chunk mode', () => {
      const data = [1, 2, 3, 4, 5];
      const result = predictDataLimitLength(TrainingModeEnum.chunk, data);
      expect(result).toBe(5);
    });

    it('should return data.length for parse mode', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = predictDataLimitLength(TrainingModeEnum.parse, data);
      expect(result).toBe(10);
    });

    it('should return data.length for imageParse mode', () => {
      const data = [1, 2, 3];
      const result = predictDataLimitLength(TrainingModeEnum.imageParse, data);
      expect(result).toBe(3);
    });

    it('should return 0 for chunk mode with empty array', () => {
      const result = predictDataLimitLength(TrainingModeEnum.chunk, []);
      expect(result).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle large arrays', () => {
      const data = new Array(1000).fill(1);
      expect(predictDataLimitLength(TrainingModeEnum.qa, data)).toBe(20000);
      expect(predictDataLimitLength(TrainingModeEnum.auto, data)).toBe(5000);
      expect(predictDataLimitLength(TrainingModeEnum.image, data)).toBe(2000);
      expect(predictDataLimitLength(TrainingModeEnum.chunk, data)).toBe(1000);
    });

    it('should handle arrays with different data types', () => {
      const data = ['a', 'b', 'c', { key: 'value' }, null];
      const result = predictDataLimitLength(TrainingModeEnum.qa, data);
      expect(result).toBe(100);
    });
  });
});

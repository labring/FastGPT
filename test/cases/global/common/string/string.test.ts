import { describe, expect, it } from 'vitest';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';

describe('parseFileExtensionFromUrl', () => {
  it('should parse extension from simple URL', () => {
    expect(parseFileExtensionFromUrl('http://example.com/file.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('https://example.com/document.docx')).toBe('docx');
    expect(parseFileExtensionFromUrl('http://example.com/image.jpg')).toBe('jpg');
  });

  it('should parse extension from URL with query parameters', () => {
    expect(parseFileExtensionFromUrl('http://example.com/file.pdf?download=true')).toBe('pdf');
    expect(parseFileExtensionFromUrl('https://example.com/image.png?size=large&quality=high')).toBe(
      'png'
    );
    expect(parseFileExtensionFromUrl('http://example.com/doc.txt?v=1.2.3&auth=token123')).toBe(
      'txt'
    );
  });

  it('should not handle hash in URL (returns extension with hash)', () => {
    expect(parseFileExtensionFromUrl('http://example.com/file.pdf#page=1')).toBe('pdf');
    expect(parseFileExtensionFromUrl('https://example.com/image.jpg#section')).toBe('jpg');
  });

  it('should parse extension from URL with query but not hash', () => {
    expect(parseFileExtensionFromUrl('http://example.com/file.pdf?download=true#page=1')).toBe(
      'pdf'
    );
    expect(parseFileExtensionFromUrl('https://example.com/image.png?v=1#top')).toBe('png');
  });

  it('should parse extension from nested path URL', () => {
    expect(parseFileExtensionFromUrl('http://example.com/path/to/file.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('https://cdn.example.com/assets/images/photo.jpg')).toBe(
      'jpg'
    );
    expect(parseFileExtensionFromUrl('http://example.com/a/b/c/d/e/document.docx')).toBe('docx');
  });

  it('should return lowercase extension', () => {
    expect(parseFileExtensionFromUrl('http://example.com/file.PDF')).toBe('pdf');
    expect(parseFileExtensionFromUrl('http://example.com/image.JPG')).toBe('jpg');
    expect(parseFileExtensionFromUrl('http://example.com/document.DOCX')).toBe('docx');
    expect(parseFileExtensionFromUrl('http://example.com/MixedCase.TxT')).toBe('txt');
  });

  it('should parse extension from relative URLs', () => {
    expect(parseFileExtensionFromUrl('/static/file.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('./images/photo.png')).toBe('png');
    expect(parseFileExtensionFromUrl('../documents/report.xlsx')).toBe('xlsx');
  });

  it('should handle S3-style URLs', () => {
    expect(parseFileExtensionFromUrl('chat/image.png')).toBe('png');
    expect(parseFileExtensionFromUrl('dataset/document.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('uploads/2024/01/file.txt')).toBe('txt');
  });

  it('should handle file with multiple dots', () => {
    expect(parseFileExtensionFromUrl('http://example.com/my.file.name.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('http://example.com/archive.tar.gz')).toBe('gz');
    expect(parseFileExtensionFromUrl('http://example.com/config.backup.json')).toBe('json');
  });

  it('should handle special characters in URL', () => {
    expect(parseFileExtensionFromUrl('http://example.com/file%20name.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('http://example.com/file-name.jpg')).toBe('jpg');
    expect(parseFileExtensionFromUrl('http://example.com/file_name.png')).toBe('png');
  });

  it('should return empty string for URL without extension', () => {
    // Note: path.extname returns '' when no extension exists
    expect(parseFileExtensionFromUrl('http://example.com/file')).toBe('');
    expect(parseFileExtensionFromUrl('http://example.com/path/to/file')).toBe('');
    expect(parseFileExtensionFromUrl('http://example.com/download')).toBe('');
  });

  it('should handle URL ending with slash', () => {
    // Note: path.extname may treat domain extension as file extension for root URLs
    expect(parseFileExtensionFromUrl('http://example.com/')).toBe('com');
    expect(parseFileExtensionFromUrl('http://example.com/path/')).toBe('');
    expect(parseFileExtensionFromUrl('http://example.com/path/to/folder/')).toBe('');
  });

  it('should return domain extension for root URL', () => {
    // Note: The function treats domain as filename when no path exists
    expect(parseFileExtensionFromUrl('http://example.com')).toBe('com');
    expect(parseFileExtensionFromUrl('https://example.com')).toBe('com');
  });

  it('should handle empty string input', () => {
    expect(parseFileExtensionFromUrl('')).toBe('');
  });

  it('should handle undefined input', () => {
    expect(parseFileExtensionFromUrl()).toBe('');
  });

  it('should handle URLs with port numbers', () => {
    expect(parseFileExtensionFromUrl('http://example.com:8080/file.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('https://localhost:3000/image.png')).toBe('png');
  });

  it('should handle data URLs correctly', () => {
    // Note: path.extname doesn't handle data URLs specially, returns empty
    expect(parseFileExtensionFromUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('');
    expect(parseFileExtensionFromUrl('data:application/pdf;base64,JVBERi0=')).toBe('');
  });

  it('should handle common file extensions', () => {
    // Documents
    expect(parseFileExtensionFromUrl('http://example.com/file.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('http://example.com/file.docx')).toBe('docx');
    expect(parseFileExtensionFromUrl('http://example.com/file.xlsx')).toBe('xlsx');
    expect(parseFileExtensionFromUrl('http://example.com/file.pptx')).toBe('pptx');

    // Images
    expect(parseFileExtensionFromUrl('http://example.com/file.jpg')).toBe('jpg');
    expect(parseFileExtensionFromUrl('http://example.com/file.jpeg')).toBe('jpeg');
    expect(parseFileExtensionFromUrl('http://example.com/file.png')).toBe('png');
    expect(parseFileExtensionFromUrl('http://example.com/file.gif')).toBe('gif');
    expect(parseFileExtensionFromUrl('http://example.com/file.webp')).toBe('webp');
    expect(parseFileExtensionFromUrl('http://example.com/file.svg')).toBe('svg');

    // Text
    expect(parseFileExtensionFromUrl('http://example.com/file.txt')).toBe('txt');
    expect(parseFileExtensionFromUrl('http://example.com/file.md')).toBe('md');
    expect(parseFileExtensionFromUrl('http://example.com/file.csv')).toBe('csv');
    expect(parseFileExtensionFromUrl('http://example.com/file.json')).toBe('json');

    // Archives
    expect(parseFileExtensionFromUrl('http://example.com/file.zip')).toBe('zip');
    expect(parseFileExtensionFromUrl('http://example.com/file.tar')).toBe('tar');
    expect(parseFileExtensionFromUrl('http://example.com/file.gz')).toBe('gz');

    // Code
    expect(parseFileExtensionFromUrl('http://example.com/file.js')).toBe('js');
    expect(parseFileExtensionFromUrl('http://example.com/file.ts')).toBe('ts');
    expect(parseFileExtensionFromUrl('http://example.com/file.py')).toBe('py');
  });

  it('should handle Chinese characters in URL', () => {
    expect(parseFileExtensionFromUrl('http://example.com/文件.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('http://example.com/测试/图片.jpg')).toBe('jpg');
  });

  it('should handle filename with only dot prefix (hidden files)', () => {
    // Note: path.extname treats the entire name after dot as extension for files starting with dot
    expect(parseFileExtensionFromUrl('http://example.com/.gitignore')).toBe('');
    expect(parseFileExtensionFromUrl('http://example.com/.env')).toBe('');
    expect(parseFileExtensionFromUrl('http://example.com/path/.htaccess')).toBe('');
  });

  it('should handle filename starting with dot and having extension', () => {
    expect(parseFileExtensionFromUrl('http://example.com/.config.json')).toBe('json');
    expect(parseFileExtensionFromUrl('http://example.com/.eslintrc.js')).toBe('js');
  });

  it('should handle direct filename input (not URL)', () => {
    // Test simple filenames
    expect(parseFileExtensionFromUrl('document.pdf')).toBe('pdf');
    expect(parseFileExtensionFromUrl('image.jpg')).toBe('jpg');
    expect(parseFileExtensionFromUrl('data.json')).toBe('json');
    expect(parseFileExtensionFromUrl('script.js')).toBe('js');
    expect(parseFileExtensionFromUrl('style.css')).toBe('css');

    // Test filenames with multiple dots
    expect(parseFileExtensionFromUrl('archive.tar.gz')).toBe('gz');
    expect(parseFileExtensionFromUrl('config.backup.json')).toBe('json');

    // Test filenames with uppercase extensions
    expect(parseFileExtensionFromUrl('FILE.PDF')).toBe('pdf');
    expect(parseFileExtensionFromUrl('Image.JPG')).toBe('jpg');

    // Test filename without extension
    expect(parseFileExtensionFromUrl('README')).toBe('');
    expect(parseFileExtensionFromUrl('Makefile')).toBe('');

    // Test hidden files (starting with dot)
    expect(parseFileExtensionFromUrl('.gitignore')).toBe('');
    expect(parseFileExtensionFromUrl('.env')).toBe('');
    expect(parseFileExtensionFromUrl('.eslintrc.js')).toBe('js');

    // Test filenames with special characters
    expect(parseFileExtensionFromUrl('my-file.txt')).toBe('txt');
    expect(parseFileExtensionFromUrl('my_file.txt')).toBe('txt');
    expect(parseFileExtensionFromUrl('file name.txt')).toBe('txt');
    expect(parseFileExtensionFromUrl('文件.pdf')).toBe('pdf');
  });
});

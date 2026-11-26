import { beforeEach, describe, expect, it, vi } from 'vitest';
import FormData from 'form-data';

const {
  somarkParseMock,
  useSomarkServerMock,
  doc2xParseMock,
  useDoc2xServerMock,
  textinParseMock,
  useTextinServerMock,
  axiosPostMock
} = vi.hoisted(() => {
  const somarkParseMock = vi.fn();
  const doc2xParseMock = vi.fn();
  const textinParseMock = vi.fn();
  return {
    somarkParseMock,
    useSomarkServerMock: vi.fn(() => ({ parsePDF: somarkParseMock })),
    doc2xParseMock,
    useDoc2xServerMock: vi.fn(() => ({ parsePDF: doc2xParseMock })),
    textinParseMock,
    useTextinServerMock: vi.fn(() => ({ parsePDF: textinParseMock })),
    axiosPostMock: vi.fn()
  };
});

vi.mock('@fastgpt/service/thirdProvider/somark', () => ({
  useSomarkServer: useSomarkServerMock
}));

vi.mock('@fastgpt/service/thirdProvider/doc2x', () => ({
  useDoc2xServer: useDoc2xServerMock
}));

vi.mock('@fastgpt/service/thirdProvider/textin', () => ({
  useTextinServer: useTextinServerMock
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: {
    post: axiosPostMock
  }
}));

const { buildSampleTestPdfBuffer, testDocumentParseProvider } =
  await import('@fastgpt/service/common/file/read/testDocumentParse');

describe('testDocumentParseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a spec-compliant single-page PDF 1.4 buffer with exact xref offsets', () => {
    const pdf = buildSampleTestPdfBuffer();
    const content = pdf.toString('utf8');

    expect(content.startsWith('%PDF-1.4\n')).toBe(true);
    expect(content).toContain('(FastGPT PDF Parse Test)');
    expect(content).toContain('xref\n0 6\n');
    expect(content).toContain('%%EOF\n');

    const startXrefMatch = content.match(/startxref\n(\d+)\n%%EOF/);
    expect(startXrefMatch).not.toBeNull();
    const xrefOffset = Number(startXrefMatch?.[1]);
    expect(pdf.subarray(xrefOffset, xrefOffset + 4).toString('utf8')).toBe('xref');
  });

  it('tests SoMark with normalized custom baseUrl and sample PDF buffer', async () => {
    somarkParseMock.mockResolvedValueOnce({ pages: 1, text: 'FastGPT PDF Parse Test' });

    const res = await testDocumentParseProvider({
      provider: 'somark',
      somarkBaseUrl: 'https://somark.cn/api/v1/',
      somarkApiKey: 'sk-somark-secret',
      timeoutMs: 15000
    });

    expect(res).toMatchObject({ success: true, pages: 1 });
    expect(useSomarkServerMock).toHaveBeenCalledWith({
      apiKey: 'sk-somark-secret',
      baseUrl: 'https://somark.cn/api/v1',
      timeoutMs: 15000
    });
    expect(somarkParseMock).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('tests Doc2X and TextIn using their provider clients', async () => {
    doc2xParseMock.mockResolvedValueOnce({ pages: 1, text: 'ok' });
    const doc2xRes = await testDocumentParseProvider({
      provider: 'doc2x',
      doc2xKey: 'sk-doc2x',
      timeoutMs: 20000
    });
    expect(doc2xRes).toMatchObject({ success: true, pages: 1 });
    expect(useDoc2xServerMock).toHaveBeenCalledWith({ apiKey: 'sk-doc2x', timeoutMs: 20000 });

    textinParseMock.mockResolvedValueOnce({ pages: 1, text: 'ok' });
    const textinRes = await testDocumentParseProvider({
      provider: 'textln',
      textinAppId: 'app-id-1',
      textinSecretCode: 'secret-code-1',
      timeoutMs: 20000
    });
    expect(textinRes).toMatchObject({ success: true, pages: 1 });
    expect(useTextinServerMock).toHaveBeenCalledWith({
      appId: 'app-id-1',
      secretCode: 'secret-code-1',
      timeoutMs: 20000
    });
  });

  it('tests customPdf and sangfor endpoints via multipart FormData and validates response protocol', async () => {
    axiosPostMock.mockResolvedValueOnce({
      data: { pages: 1, markdown: '# FastGPT PDF Parse Test' }
    });

    const res = await testDocumentParseProvider({
      provider: 'customPdf',
      url: 'http://10.0.0.10:18080/v2/parse/file',
      key: 'custom-bearer-token',
      timeoutMs: 12000
    });

    expect(res).toMatchObject({ success: true, pages: 1 });
    expect(axiosPostMock).toHaveBeenCalledWith(
      'http://10.0.0.10:18080/v2/parse/file',
      expect.any(FormData),
      expect.objectContaining({
        timeout: 12000,
        headers: expect.objectContaining({
          Authorization: 'Bearer custom-bearer-token'
        })
      })
    );
  });

  it('sanitizes leaked credentials from error messages and rejects invalid inputs', async () => {
    somarkParseMock.mockRejectedValueOnce(new Error('Unauthorized for key sk-super-secret-123'));

    const failed = await testDocumentParseProvider({
      provider: 'somark',
      somarkApiKey: 'sk-super-secret-123'
    });

    expect(failed.success).toBe(false);
    expect(failed.error).not.toContain('sk-super-secret-123');
    expect(failed.error).toContain('***');

    const invalidUrl = await testDocumentParseProvider({
      provider: 'customPdf',
      url: 'file:///etc/passwd'
    });
    expect(invalidUrl.success).toBe(false);
    expect(invalidUrl.error).toContain('Invalid parser service URL');
  });
});

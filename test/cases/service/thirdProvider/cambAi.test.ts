import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/*
  CAMB AI Comprehensive Tests

  Unit tests run without API key.
  Integration tests require CAMB_API_KEY env var and call real CAMB APIs.
  Audio playback uses macOS `afplay` — tests won't fail if unavailable.

  Run: CAMB_API_KEY=... pnpm vitest run test/cases/service/thirdProvider/cambAi.test.ts
*/

const CAMB_API_KEY = process.env.CAMB_API_KEY;
const skipIfNoKey = CAMB_API_KEY ? describe : describe.skip;

const TMP_DIR = '/tmp';
const TTS_EN_FILE = path.join(TMP_DIR, 'camb_tts_en.mp3');
const TTS_CN_FILE = path.join(TMP_DIR, 'camb_tts_cn.mp3');

/** Try to play an audio file with afplay (macOS). Non-blocking, won't fail tests. */
function tryPlayAudio(filePath: string): void {
  try {
    console.log(`  🔊 Playing audio: ${filePath}`);
    execSync(`afplay "${filePath}"`, { timeout: 30000 });
    console.log(`  ✅ Playback finished.`);
  } catch {
    console.log(`  ⚠️  Could not play audio (no afplay or no audio device).`);
  }
}

// ============================================================
// Unit Tests (always run, no API key needed)
// ============================================================

describe('CAMB AI - Unit Tests', () => {
  describe('Language codes', () => {
    it('should export valid language codes', async () => {
      const { CambLanguageCodes, cambLanguageSelectOptions } = await import(
        '@fastgpt/service/thirdProvider/cambAi/languages'
      );

      expect(CambLanguageCodes.en_us).toBe(1);
      expect(CambLanguageCodes.zh_cn).toBe(139);
      expect(CambLanguageCodes.ja_jp).toBe(88);
      expect(CambLanguageCodes.fr_fr).toBe(76);
      expect(CambLanguageCodes.de_de).toBe(31);
      expect(CambLanguageCodes.es_es).toBe(54);

      expect(cambLanguageSelectOptions.length).toBeGreaterThan(100);
      expect(cambLanguageSelectOptions[0]).toHaveProperty('label');
      expect(cambLanguageSelectOptions[0]).toHaveProperty('value');
    });

    it('should have language labels for all codes', async () => {
      const { CambLanguageCodes, CambLanguageLabels } = await import(
        '@fastgpt/service/thirdProvider/cambAi/languages'
      );

      const codes = Object.values(CambLanguageCodes);
      for (const code of codes) {
        expect(CambLanguageLabels[code]).toBeDefined();
        expect(typeof CambLanguageLabels[code]).toBe('string');
      }
    });
  });

  describe('Types', () => {
    it('should export all required types', async () => {
      const types = await import('@fastgpt/service/thirdProvider/cambAi/types');
      expect(types).toBeDefined();
    });
  });

  describe('Workflow node enums', () => {
    it('should have CAMB node types in FlowNodeTypeEnum', async () => {
      const { FlowNodeTypeEnum } = await import('@fastgpt/global/core/workflow/node/constant');

      expect(FlowNodeTypeEnum.cambTranslation).toBe('cambTranslation');
      expect(FlowNodeTypeEnum.cambVoiceClone).toBe('cambVoiceClone');
      expect(FlowNodeTypeEnum.cambTranslatedTTS).toBe('cambTranslatedTTS');
    });

    it('should have CAMB input keys in NodeInputKeyEnum', async () => {
      const { NodeInputKeyEnum } = await import('@fastgpt/global/core/workflow/constants');

      expect(NodeInputKeyEnum.cambSourceText).toBe('cambSourceText');
      expect(NodeInputKeyEnum.cambSourceLanguage).toBe('cambSourceLanguage');
      expect(NodeInputKeyEnum.cambTargetLanguage).toBe('cambTargetLanguage');
      expect(NodeInputKeyEnum.cambVoiceName).toBe('cambVoiceName');
      expect(NodeInputKeyEnum.cambAudioUrl).toBe('cambAudioUrl');
      expect(NodeInputKeyEnum.cambGender).toBe('cambGender');
      expect(NodeInputKeyEnum.cambVoiceId).toBe('cambVoiceId');
      expect(NodeInputKeyEnum.cambSpeed).toBe('cambSpeed');
    });

    it('should have CAMB output keys in NodeOutputKeyEnum', async () => {
      const { NodeOutputKeyEnum } = await import('@fastgpt/global/core/workflow/constants');

      expect(NodeOutputKeyEnum.cambTranslatedText).toBe('cambTranslatedText');
      expect(NodeOutputKeyEnum.cambVoiceId).toBe('cambVoiceId');
      expect(NodeOutputKeyEnum.cambAudioUrl).toBe('cambAudioUrl');
    });
  });

  describe('Workflow node templates', () => {
    it('should have valid translation node template', async () => {
      const { CambTranslationNode } = await import(
        '@fastgpt/global/core/workflow/template/system/cambTranslation'
      );

      expect(CambTranslationNode.flowNodeType).toBe('cambTranslation');
      expect(CambTranslationNode.inputs.length).toBe(3);
      expect(CambTranslationNode.outputs.length).toBe(1);
      expect(CambTranslationNode.showSourceHandle).toBe(true);
      expect(CambTranslationNode.showTargetHandle).toBe(true);
    });

    it('should have valid voice clone node template', async () => {
      const { CambVoiceCloneNode } = await import(
        '@fastgpt/global/core/workflow/template/system/cambVoiceClone'
      );

      expect(CambVoiceCloneNode.flowNodeType).toBe('cambVoiceClone');
      expect(CambVoiceCloneNode.inputs.length).toBe(3);
      expect(CambVoiceCloneNode.outputs.length).toBe(1);
    });

    it('should have valid translated TTS node template', async () => {
      const { CambTranslatedTTSNode } = await import(
        '@fastgpt/global/core/workflow/template/system/cambTranslatedTTS'
      );

      expect(CambTranslatedTTSNode.flowNodeType).toBe('cambTranslatedTTS');
      expect(CambTranslatedTTSNode.inputs.length).toBe(5);
      expect(CambTranslatedTTSNode.outputs.length).toBe(2);
    });

    it('should register CAMB nodes in system module templates', async () => {
      const { moduleTemplatesFlat } = await import(
        '@fastgpt/global/core/workflow/template/constants'
      );

      const cambNodeIds = ['cambTranslation', 'cambVoiceClone', 'cambTranslatedTTS'];

      for (const nodeId of cambNodeIds) {
        expect(moduleTemplatesFlat.some((t) => t.id === nodeId)).toBe(true);
      }
    });
  });

  describe('Service layer exports', () => {
    it('should export ttsStream and transcribe methods', async () => {
      const { useCambAiServer } = await import('@fastgpt/service/thirdProvider/cambAi/index');
      const server = useCambAiServer({ apiKey: 'fake-key' });

      expect(typeof server.ttsStream).toBe('function');
      expect(typeof server.translate).toBe('function');
      expect(typeof server.listVoices).toBe('function');
      expect(typeof server.createCustomVoice).toBe('function');
      expect(typeof server.translatedTTS).toBe('function');
    });
  });
});

// ============================================================
// Integration Tests (require CAMB_API_KEY)
// ============================================================

skipIfNoKey('CAMB AI - Integration Tests', () => {
  type CambServer = Awaited<
    ReturnType<(typeof import('@fastgpt/service/thirdProvider/cambAi/index'))['useCambAiServer']>
  >;

  let cambServer: CambServer;
  let pickedVoiceId: number = 146274; // fallback voice_id

  beforeAll(async () => {
    const { useCambAiServer } = await import('@fastgpt/service/thirdProvider/cambAi/index');
    cambServer = useCambAiServer({ apiKey: CAMB_API_KEY! });
  });

  // --- Translation ---

  describe('Translation', () => {
    it('should translate English to Chinese', async () => {
      const result = await cambServer.translate({
        texts: ['Hello, how are you?'],
        source_language: 1,
        target_language: 139
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].length).toBeGreaterThan(0);
      console.log(`  EN→CN: "${result[0]}"`);
    }, 60000);

    it('should translate Chinese to English', async () => {
      const result = await cambServer.translate({
        texts: ['你好，世界！'],
        source_language: 139,
        target_language: 1
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].length).toBeGreaterThan(0);
      console.log(`  CN→EN: "${result[0]}"`);
    }, 60000);

    it('should translate English to Japanese', async () => {
      const result = await cambServer.translate({
        texts: ['Good morning'],
        source_language: 1,
        target_language: 88
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].length).toBeGreaterThan(0);
      console.log(`  EN→JP: "${result[0]}"`);
    }, 60000);

    it('should handle batch translation (multiple texts)', async () => {
      const texts = [
        'The weather is nice today.',
        'I love programming.',
        'FastGPT is a great AI platform.'
      ];
      const result = await cambServer.translate({
        texts,
        source_language: 1,
        target_language: 139
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(texts.length);
      for (let i = 0; i < result.length; i++) {
        expect(result[i].length).toBeGreaterThan(0);
        console.log(`  Batch[${i}]: "${texts[i]}" → "${result[i]}"`);
      }
    }, 60000);
  });

  // --- List Voices ---

  describe('List Voices', () => {
    it('should list available voices and pick one for TTS', async () => {
      const voices = await cambServer.listVoices();

      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0]).toHaveProperty('id');
      expect(voices[0]).toHaveProperty('voice_name');
      expect(voices[0]).toHaveProperty('gender');

      // Pick a voice for subsequent TTS tests
      const englishVoice = voices.find((v) => v.language === 1);
      if (englishVoice) {
        pickedVoiceId = englishVoice.id;
        console.log(
          `  Picked voice: ${englishVoice.voice_name} (id=${englishVoice.id}, lang=${englishVoice.language})`
        );
      } else {
        pickedVoiceId = voices[0].id;
        console.log(
          `  No English voice found, using: ${voices[0].voice_name} (id=${voices[0].id})`
        );
      }

      console.log(`  Total voices available: ${voices.length}`);
    }, 30000);
  });

  // --- TTS Streaming (direct API) ---

  describe('TTS Streaming', () => {
    it('should generate English TTS audio via ttsStream', async () => {
      const audioBuffer = await cambServer.ttsStream({
        text: 'Hello, this is a test of the CAMB AI text to speech system.',
        voice_id: pickedVoiceId,
        language: 'en-us'
      });

      expect(Buffer.isBuffer(audioBuffer)).toBe(true);
      expect(audioBuffer.length).toBeGreaterThan(1000);

      fs.writeFileSync(TTS_EN_FILE, audioBuffer);
      const stat = fs.statSync(TTS_EN_FILE);
      expect(stat.size).toBeGreaterThan(1000);
      console.log(`  Saved English TTS: ${TTS_EN_FILE} (${stat.size} bytes)`);

      tryPlayAudio(TTS_EN_FILE);
    }, 60000);

    it('should generate Chinese TTS audio via ttsStream', async () => {
      const audioBuffer = await cambServer.ttsStream({
        text: '你好，这是 CAMB AI 语音合成的测试。',
        voice_id: pickedVoiceId,
        language: 'zh-cn'
      });

      expect(Buffer.isBuffer(audioBuffer)).toBe(true);
      expect(audioBuffer.length).toBeGreaterThan(1000);

      fs.writeFileSync(TTS_CN_FILE, audioBuffer);
      const stat = fs.statSync(TTS_CN_FILE);
      expect(stat.size).toBeGreaterThan(1000);
      console.log(`  Saved Chinese TTS: ${TTS_CN_FILE} (${stat.size} bytes)`);

      tryPlayAudio(TTS_CN_FILE);
    }, 60000);
  });

  // --- E2E: Translate → TTS → Play ---

  describe('E2E: Translate → TTS → Play', () => {
    it('should translate EN→CN then TTS the Chinese text', async () => {
      // Step 1: Translate
      const translated = await cambServer.translate({
        texts: ['Hello, how are you today?'],
        source_language: 1,
        target_language: 139
      });

      expect(translated.length).toBe(1);
      const chineseText = translated[0];
      expect(chineseText.length).toBeGreaterThan(0);
      console.log(`  Translated: "${chineseText}"`);

      // Step 2: TTS the Chinese text
      const audioBuffer = await cambServer.ttsStream({
        text: chineseText,
        voice_id: pickedVoiceId,
        language: 'zh-cn'
      });

      expect(Buffer.isBuffer(audioBuffer)).toBe(true);
      expect(audioBuffer.length).toBeGreaterThan(1000);

      const outFile = path.join(TMP_DIR, 'camb_e2e_translate_tts.mp3');
      fs.writeFileSync(outFile, audioBuffer);
      console.log(`  Saved: ${outFile} (${audioBuffer.length} bytes)`);

      tryPlayAudio(outFile);
    }, 120000);
  });
});

// ============================================================
// Dispatch Handler Tests (always run)
// ============================================================

describe('CAMB AI - Dispatch Handlers', () => {
  describe('Translation dispatch', () => {
    it('should reject when source text is empty', async () => {
      const { dispatchCambTranslation } = await import(
        '@fastgpt/service/core/workflow/dispatch/tools/cambTranslation'
      );

      await expect(
        dispatchCambTranslation({
          params: {
            cambSourceText: '',
            cambSourceLanguage: '1',
            cambTargetLanguage: '139'
          }
        })
      ).rejects.toMatchObject({ message: expect.stringContaining('Source text is required') });
    });

    it('should reject when CAMB_API_KEY is not set', async () => {
      const originalKey = process.env.CAMB_API_KEY;
      delete process.env.CAMB_API_KEY;

      const { dispatchCambTranslation } = await import(
        '@fastgpt/service/core/workflow/dispatch/tools/cambTranslation'
      );

      await expect(
        dispatchCambTranslation({
          params: {
            cambSourceText: 'Hello',
            cambSourceLanguage: '1',
            cambTargetLanguage: '139'
          }
        })
      ).rejects.toMatchObject({ message: expect.stringContaining('CAMB_API_KEY') });

      if (originalKey) {
        process.env.CAMB_API_KEY = originalKey;
      }
    });
  });

  describe('Voice clone dispatch', () => {
    it('should reject when voice name or audio URL is missing', async () => {
      const { dispatchCambVoiceClone } = await import(
        '@fastgpt/service/core/workflow/dispatch/tools/cambVoiceClone'
      );

      await expect(
        dispatchCambVoiceClone({
          params: {
            cambVoiceName: '',
            cambAudioUrl: ''
          }
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Voice name and audio URL are required')
      });
    });
  });

  describe('Translated TTS dispatch', () => {
    it('should reject when source text or voice ID is missing', async () => {
      const { dispatchCambTranslatedTTS } = await import(
        '@fastgpt/service/core/workflow/dispatch/tools/cambTranslatedTTS'
      );

      await expect(
        dispatchCambTranslatedTTS({
          params: {
            cambSourceText: '',
            cambSourceLanguage: '1',
            cambTargetLanguage: '139',
            cambVoiceId: '',
            cambSpeed: 1.0
          }
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Source text and voice ID are required')
      });
    });
  });

  describe('Callback map registration', () => {
    it('should register all CAMB dispatch handlers', async () => {
      const { callbackMap } = await import('@fastgpt/service/core/workflow/dispatch/constants');
      const { FlowNodeTypeEnum } = await import('@fastgpt/global/core/workflow/node/constant');

      expect(typeof callbackMap[FlowNodeTypeEnum.cambTranslation]).toBe('function');
      expect(typeof callbackMap[FlowNodeTypeEnum.cambVoiceClone]).toBe('function');
      expect(typeof callbackMap[FlowNodeTypeEnum.cambTranslatedTTS]).toBe('function');
    });
  });
});

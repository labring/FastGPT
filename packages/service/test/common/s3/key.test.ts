import { describe, expect, it } from 'vitest';
import {
  isAuthorizedChatFileS3Key,
  parseChatFileS3Key
} from '@fastgpt/service/common/s3/sources/chat/key';
import {
  isAuthorizedDatasetFileS3Key,
  parseDatasetFileS3Key
} from '@fastgpt/service/common/s3/sources/dataset/key';
import { isAuthorizedTempFileS3Key } from '@fastgpt/service/common/s3/sources/temp/key';

describe('authorized S3 object key helpers', () => {
  it('parses and authorizes legacy chat file keys by app source and uid', () => {
    const key = 'chat/app-1/user-1/chat-1/folder/demo.pdf';

    expect(parseChatFileS3Key(key)).toEqual({
      sourceType: 'app',
      sourceId: 'app-1',
      uid: 'user-1',
      chatId: 'chat-1',
      filename: 'folder/demo.pdf',
      legacyAppKey: true
    });
    expect(
      isAuthorizedChatFileS3Key({
        key,
        sourceType: 'app',
        sourceId: 'app-1',
        uid: 'user-1',
        chatId: 'chat-1'
      })
    ).toBe(true);
    expect(
      isAuthorizedChatFileS3Key({
        key,
        sourceType: 'app',
        sourceId: 'app-2',
        uid: 'user-1',
        chatId: 'chat-1'
      })
    ).toBe(false);
    expect(
      isAuthorizedChatFileS3Key({
        key,
        sourceType: 'app',
        sourceId: 'app-1',
        uid: 'user-2',
        chatId: 'chat-1'
      })
    ).toBe(false);
    expect(
      isAuthorizedChatFileS3Key({
        key,
        sourceType: 'app',
        sourceId: 'app-1',
        uid: 'user-1',
        chatId: 'chat-2'
      })
    ).toBe(false);
    expect(parseChatFileS3Key('temp/app-1/user-1/chat-1/demo.pdf')).toBeNull();
  });

  it('parses and authorizes source-aware chat file keys by source and uid', () => {
    const appKey = 'chat/app/app-1/user-1/chat-1/demo.pdf';
    const skillKey = 'chat/skillEdit/skill-1/user-1/chat-1/folder/demo.pdf';

    expect(parseChatFileS3Key(appKey)).toEqual({
      sourceType: 'app',
      sourceId: 'app-1',
      uid: 'user-1',
      chatId: 'chat-1',
      filename: 'demo.pdf',
      legacyAppKey: false
    });
    expect(parseChatFileS3Key(skillKey)).toEqual({
      sourceType: 'skillEdit',
      sourceId: 'skill-1',
      uid: 'user-1',
      chatId: 'chat-1',
      filename: 'folder/demo.pdf',
      legacyAppKey: false
    });
    expect(
      isAuthorizedChatFileS3Key({
        key: skillKey,
        sourceType: 'skillEdit',
        sourceId: 'skill-1',
        uid: 'user-1',
        chatId: 'chat-1'
      })
    ).toBe(true);
    expect(
      isAuthorizedChatFileS3Key({
        key: skillKey,
        sourceType: 'app',
        sourceId: 'skill-1',
        uid: 'user-1',
        chatId: 'chat-1'
      })
    ).toBe(false);
    expect(
      isAuthorizedChatFileS3Key({
        key: skillKey,
        sourceType: 'skillEdit',
        sourceId: 'skill-1',
        uid: 'user-1',
        chatId: 'chat-2'
      })
    ).toBe(false);
  });

  it('parses and authorizes dataset file keys by datasetId', () => {
    const key = 'dataset/dataset-1/folder/demo.pdf';

    expect(parseDatasetFileS3Key(key)).toEqual({
      datasetId: 'dataset-1',
      filename: 'folder/demo.pdf'
    });
    expect(isAuthorizedDatasetFileS3Key({ key, datasetId: 'dataset-1' })).toBe(true);
    expect(isAuthorizedDatasetFileS3Key({ key, datasetId: 'dataset-2' })).toBe(false);
    expect(parseDatasetFileS3Key('dataset/dataset-1')).toBeNull();
  });

  it('authorizes temp file keys by exact team path segment', () => {
    expect(isAuthorizedTempFileS3Key({ key: 'temp/team-1/demo.pdf', teamId: 'team-1' })).toBe(true);
    expect(isAuthorizedTempFileS3Key({ key: 'temp/team-11/demo.pdf', teamId: 'team-1' })).toBe(
      false
    );
    expect(isAuthorizedTempFileS3Key({ key: 'dataset/team-1/demo.pdf', teamId: 'team-1' })).toBe(
      false
    );
  });
});

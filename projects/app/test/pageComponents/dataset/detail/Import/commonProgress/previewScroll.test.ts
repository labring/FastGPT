import { describe, expect, it } from 'vitest';
import { resetPreviewScroll } from '@/pageComponents/dataset/detail/Import/commonProgress/previewScroll';

describe('resetPreviewScroll', () => {
  it('resets the preview container to the top', () => {
    const container = { scrollTop: 320 };

    resetPreviewScroll(container);

    expect(container.scrollTop).toBe(0);
  });

  it('ignores an unavailable preview container', () => {
    expect(() => resetPreviewScroll(null)).not.toThrow();
  });
});

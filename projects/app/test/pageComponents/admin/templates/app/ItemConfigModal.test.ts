import { describe, expect, it } from 'vitest';
import { resolveTemplateExperienceUrlPatch } from '@/pageComponents/admin/templates/app/components/ItemConfigModal';

describe('resolveTemplateExperienceUrlPatch', () => {
  it.each([
    [
      'create empty -> omit',
      { isEdit: false, inputExperienceUrl: '  ' },
      { valid: true, include: false }
    ],
    [
      'create valid -> trim & include',
      { isEdit: false, inputExperienceUrl: ' https://demo.example.com/a ' },
      { valid: true, include: true, value: 'https://demo.example.com/a' }
    ],
    [
      'create invalid -> reject',
      { isEdit: false, inputExperienceUrl: 'javascript:alert(1)' },
      { valid: false }
    ],
    [
      'edit unchanged inherited url -> omit',
      {
        isEdit: true,
        initialExperienceUrl: 'https://plugin-v1.example.com',
        inputExperienceUrl: '  https://plugin-v1.example.com  '
      },
      { valid: true, include: false }
    ],
    [
      'edit unchanged legacy invalid url -> omit without blocking',
      {
        isEdit: true,
        initialExperienceUrl: 'demo.fastgpt.io',
        inputExperienceUrl: 'demo.fastgpt.io'
      },
      { valid: true, include: false }
    ],
    [
      'edit changed to valid url -> include',
      {
        isEdit: true,
        initialExperienceUrl: 'https://plugin-v1.example.com',
        inputExperienceUrl: 'https://custom.example.com'
      },
      { valid: true, include: true, value: 'https://custom.example.com' }
    ],
    [
      'edit changed to invalid url -> reject',
      {
        isEdit: true,
        initialExperienceUrl: 'https://plugin-v1.example.com',
        inputExperienceUrl: 'ftp://a.com'
      },
      { valid: false }
    ],
    [
      'edit explicitly cleared -> send empty string',
      {
        isEdit: true,
        initialExperienceUrl: 'https://plugin-v1.example.com',
        inputExperienceUrl: ' '
      },
      { valid: true, include: true, value: '' }
    ]
  ])('%s', (_label, input, expected) => {
    expect(resolveTemplateExperienceUrlPatch(input)).toEqual(expected);
  });
});

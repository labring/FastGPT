import { describe, expect, it } from 'vitest';
import { generateCNAMEDomain } from '@fastgpt/global/support/customDomain/utils';

describe('generateCNAMEDomain', () => {
  it('should generate CNAME domain with correct format', () => {
    const domain = 'sealosbja.site';
    const result = generateCNAMEDomain(domain);

    // Check format: fastgpt-<8_lowercase_letters>.<domain>
    expect(result).toMatch(/^fastgpt-[a-z]{8}\.sealosbja\.site$/);
  });

  it('should generate CNAME domain with fastgpt prefix', () => {
    const domain = 'example.com';
    const result = generateCNAMEDomain(domain);

    expect(result).toContain('fastgpt-');
  });

  it('should append the provided domain correctly', () => {
    const domain = 'test.example.com';
    const result = generateCNAMEDomain(domain);

    expect(result).toContain(`.${domain}`);
    expect(result.endsWith(domain)).toBe(true);
  });

  it('should generate random string with exactly 8 lowercase letters', () => {
    const domain = 'example.com';
    const result = generateCNAMEDomain(domain);

    // Extract the random part between 'fastgpt-' and '.'
    const randomPart = result.split('fastgpt-')[1].split('.')[0];

    expect(randomPart).toHaveLength(8);
    expect(randomPart).toMatch(/^[a-z]{8}$/);
  });

  it('should generate different domains on multiple calls', () => {
    const domain = 'example.com';
    const results = new Set<string>();

    // Generate 10 domains
    for (let i = 0; i < 10; i++) {
      results.add(generateCNAMEDomain(domain));
    }

    // All should be unique (very high probability with 8-char random string)
    expect(results.size).toBe(10);
  });

  it('should handle domain with multiple subdomains', () => {
    const domain = 'sub1.sub2.example.com';
    const result = generateCNAMEDomain(domain);

    expect(result).toMatch(/^fastgpt-[a-z]{8}\.sub1\.sub2\.example\.com$/);
  });

  it('should handle short domain names', () => {
    const domain = 'a.b';
    const result = generateCNAMEDomain(domain);

    expect(result).toMatch(/^fastgpt-[a-z]{8}\.a\.b$/);
  });

  it('should handle domain with numbers', () => {
    const domain = 'example123.com';
    const result = generateCNAMEDomain(domain);

    expect(result).toMatch(/^fastgpt-[a-z]{8}\.example123\.com$/);
  });

  it('should handle domain with hyphens', () => {
    const domain = 'my-example.com';
    const result = generateCNAMEDomain(domain);

    expect(result).toMatch(/^fastgpt-[a-z]{8}\.my-example\.com$/);
  });

  it('should handle empty string domain', () => {
    const domain = '';
    const result = generateCNAMEDomain(domain);

    // Should still generate the prefix and random string
    expect(result).toMatch(/^fastgpt-[a-z]{8}\.$/);
  });

  it('should only use lowercase letters in random part', () => {
    const domain = 'example.com';

    // Test multiple times to ensure consistency
    for (let i = 0; i < 20; i++) {
      const result = generateCNAMEDomain(domain);
      const randomPart = result.split('fastgpt-')[1].split('.')[0];

      // Should not contain uppercase letters or numbers
      expect(randomPart).not.toMatch(/[A-Z0-9]/);
      expect(randomPart).toMatch(/^[a-z]+$/);
    }
  });

  it('should maintain consistent structure across different domains', () => {
    const domains = ['example.com', 'test.org', 'my-site.net', 'sub.domain.co.uk'];

    domains.forEach((domain) => {
      const result = generateCNAMEDomain(domain);

      // All should follow the same pattern
      expect(result).toMatch(/^fastgpt-[a-z]{8}\./);
      expect(result.endsWith(domain)).toBe(true);
    });
  });

  it('should generate statistically unique random strings', () => {
    const domain = 'example.com';
    const results: string[] = [];

    // Generate 100 domains
    for (let i = 0; i < 100; i++) {
      results.push(generateCNAMEDomain(domain));
    }

    // Extract random parts
    const randomParts = results.map((r) => r.split('fastgpt-')[1].split('.')[0]);
    const uniqueRandomParts = new Set(randomParts);

    // Should have very high uniqueness (allowing for extremely rare collisions)
    expect(uniqueRandomParts.size).toBeGreaterThan(95);
  });
});

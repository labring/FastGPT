import { describe, expect, it } from 'vitest';
import {
  createScopedSvgIdMap,
  scopeSpaceSeparatedSvgReferenceValue,
  scopeSvgElementIds,
  scopeSvgReferenceValue
} from '@fastgpt/web/components/common/Icon/svgScope';

class FakeSvgElement {
  public attributes: { name: string; value: string }[];
  public dataset: Record<string, string> = {};

  constructor(
    attrs: Record<string, string>,
    private readonly children: FakeSvgElement[] = []
  ) {
    this.attributes = Object.entries(attrs).map(([name, value]) => ({ name, value }));
  }

  getAttribute(name: string) {
    return this.attributes.find((attr) => attr.name === name)?.value ?? null;
  }

  setAttribute(name: string, value: string) {
    const attr = this.attributes.find((attr) => attr.name === name);
    if (attr) {
      attr.value = value;
      return;
    }

    this.attributes.push({ name, value });
  }

  querySelectorAll() {
    return this.children;
  }
}

describe('svgScope', () => {
  it('scopes url and hash references with the generated id map', () => {
    const idMap = createScopedSvgIdMap(['paint0', 'clip0'], 'scope-a');

    expect(scopeSvgReferenceValue('url(#paint0)', idMap)).toBe('url(#scope-a__paint0)');
    expect(scopeSvgReferenceValue('url("#paint0")', idMap)).toBe('url("#scope-a__paint0")');
    expect(scopeSvgReferenceValue('#clip0', idMap)).toBe('#scope-a__clip0');
    expect(scopeSvgReferenceValue('url(#missing)', idMap)).toBe('url(#missing)');
  });

  it('scopes space-separated aria references', () => {
    const idMap = createScopedSvgIdMap(['title-id', 'desc-id'], 'scope-a');

    expect(scopeSpaceSeparatedSvgReferenceValue('title-id desc-id missing', idMap)).toBe(
      'scope-a__title-id scope-a__desc-id missing'
    );
  });

  it('scopes ids and references inside one svg instance only once', () => {
    const gradient = new FakeSvgElement({ id: 'paint0' });
    const title = new FakeSvgElement({ id: 'title-id' });
    const rect = new FakeSvgElement({
      fill: 'url(#paint0)',
      'clip-path': 'url("#paint0")',
      href: '#paint0',
      'aria-labelledby': 'title-id missing'
    });
    const svg = new FakeSvgElement({ id: 'root' }, [gradient, title, rect]);

    scopeSvgElementIds(svg as unknown as SVGSVGElement, 'scope-a');

    expect(svg.getAttribute('id')).toBe('scope-a__root');
    expect(gradient.getAttribute('id')).toBe('scope-a__paint0');
    expect(title.getAttribute('id')).toBe('scope-a__title-id');
    expect(rect.getAttribute('fill')).toBe('url(#scope-a__paint0)');
    expect(rect.getAttribute('clip-path')).toBe('url("#scope-a__paint0")');
    expect(rect.getAttribute('href')).toBe('#scope-a__paint0');
    expect(rect.getAttribute('aria-labelledby')).toBe('scope-a__title-id missing');

    scopeSvgElementIds(svg as unknown as SVGSVGElement, 'scope-a');

    expect(gradient.getAttribute('id')).toBe('scope-a__paint0');
    expect(rect.getAttribute('fill')).toBe('url(#scope-a__paint0)');
  });
});

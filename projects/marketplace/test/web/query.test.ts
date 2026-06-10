import { describe, expect, it } from 'vitest';
import {
  buildMarketplacePageUrl,
  buildMarketplaceQueryString,
  getMarketplaceDetailQueryFromSearch,
  getSingleQueryValue
} from '../../src/web/query';

describe('marketplace page query helpers', () => {
  it('builds query string with search, tags, plugin id and version', () => {
    expect(
      buildMarketplaceQueryString({
        search: 'weather tool',
        tags: ['ai', 'search'],
        pluginId: 'tool/set child',
        version: '1.0.0 beta'
      })
    ).toBe(
      'search=weather%20tool&tags=ai%2Csearch&pluginId=tool%2Fset%20child&version=1.0.0%20beta'
    );
  });

  it('omits version when pluginId is empty', () => {
    expect(
      buildMarketplaceQueryString({
        version: '1.0.0'
      })
    ).toBe('');
  });

  it('builds page URL without empty query params', () => {
    expect(
      buildMarketplacePageUrl({
        pathname: '/',
        search: '',
        tags: [],
        pluginId: 'tool-a'
      })
    ).toBe('/?pluginId=tool-a');
  });

  it('normalizes next query values', () => {
    expect(getSingleQueryValue([' tool-a ', 'tool-b'])).toBe('tool-a');
    expect(getSingleQueryValue('')).toBeUndefined();
    expect(getSingleQueryValue(undefined)).toBeUndefined();
  });

  it('reads detail query from browser search string', () => {
    expect(
      getMarketplaceDetailQueryFromSearch('?search=tool&pluginId=tool%2Fset&version=1.0.0%20beta')
    ).toEqual({
      pluginId: 'tool/set',
      version: '1.0.0 beta'
    });
    expect(getMarketplaceDetailQueryFromSearch('?version=1.0.0')).toEqual({});
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScalarOpenApiReferenceConfig } from '../../openapi/reference';

describe('Scalar default expansion', () => {
  let plugin = getScalarOpenApiReferenceConfig('/api/apidoc/devapi.json').plugins[0]();

  /** 保留 Scalar 的列表、按钮及展开标记，点击后模拟其延迟渲染的剩余选项。 */
  const createEnum = (expanded = false) => {
    const list = document.createElement('ul');
    list.className = 'property-enum-values';
    const button = document.createElement('button');
    button.className = 'enum-toggle-button';
    const icon = document.createElement('span');
    if (expanded) icon.className = 'rotate-45';
    button.append(icon);
    const toggle = document.createElement('li');
    toggle.append(button);
    list.append(toggle);
    const showValues = (start: number, end: number) => {
      for (let index = start; index < end; index++) {
        const item = document.createElement('li');
        item.className = 'property-enum-value';
        item.textContent = `value-${index}`;
        list.insertBefore(item, toggle);
      }
    };
    showValues(0, expanded ? 12 : 5);
    const expand = vi.fn(() => {
      showValues(5, 12);
      icon.classList.add('rotate-45');
    });
    button.addEventListener('click', expand);
    return { list, expand };
  };

  /** 模拟 Scalar 的响应列表和 Disclosure 状态，保留单条响应仍可手动收起的行为。 */
  const createResponses = (statuses: string[], expanded = false) => {
    const list = document.createElement('ul');
    list.setAttribute('aria-label', '响应');
    const responses = statuses.map((status) => {
      const item = document.createElement('li');
      item.className = 'parameter-item';
      const button = document.createElement('button');
      button.className = 'parameter-item-trigger';
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = status;
      const toggle = vi.fn(() => {
        button.setAttribute(
          'aria-expanded',
          String(button.getAttribute('aria-expanded') !== 'true')
        );
      });
      button.addEventListener('click', toggle);
      item.append(button);
      list.append(item);
      return { button, toggle };
    });
    return { list, responses };
  };

  beforeEach(() => {
    document.body.innerHTML = '<div class="scalar-app"></div>';
    plugin = getScalarOpenApiReferenceConfig('/api/apidoc/devapi.json').plugins[0]();
  });

  afterEach(() => {
    plugin.hooks.onDestroy();
    document.body.replaceChildren();
  });

  it('shows all initial values without collapsing already expanded lists', () => {
    const collapsed = createEnum();
    const expanded = createEnum(true);
    document.querySelector('.scalar-app')!.append(collapsed.list, expanded.list);

    plugin.hooks.onInit();

    expect(collapsed.list.querySelectorAll('.property-enum-value')).toHaveLength(12);
    expect(collapsed.expand).toHaveBeenCalledTimes(1);
    expect(expanded.expand).not.toHaveBeenCalled();
  });

  it('expands later document content once and stops observing after destruction', async () => {
    plugin.hooks.onInit();
    const later = createEnum();
    const outside = createEnum();
    document.querySelector('.scalar-app')!.append(later.list);
    document.body.append(outside.list);

    await vi.waitFor(() => {
      expect(later.list.querySelectorAll('.property-enum-value')).toHaveLength(12);
    });
    expect(later.expand).toHaveBeenCalledTimes(1);
    expect(outside.expand).not.toHaveBeenCalled();

    plugin.hooks.onDestroy();
    const afterDestroy = createEnum();
    document.querySelector('.scalar-app')!.append(afterDestroy.list);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(afterDestroy.expand).not.toHaveBeenCalled();
  });

  it('opens a single response without toggling multiple responses, parameters or open responses', () => {
    const single = createResponses(['200']);
    const multiple = createResponses(['200', '400']);
    const expanded = createResponses(['200'], true);
    const parameters = createResponses(['query']);
    parameters.list.removeAttribute('aria-label');
    parameters.list.setAttribute('aria-labelledby', 'query-heading');
    const outside = createResponses(['200']);
    document
      .querySelector('.scalar-app')!
      .append(single.list, multiple.list, expanded.list, parameters.list);
    document.body.append(outside.list);

    plugin.hooks.onInit();

    expect(single.responses[0].button.getAttribute('aria-expanded')).toBe('true');
    expect(single.responses[0].toggle).toHaveBeenCalledTimes(1);
    for (const { toggle } of [
      ...multiple.responses,
      ...expanded.responses,
      ...parameters.responses,
      ...outside.responses
    ]) {
      expect(toggle).not.toHaveBeenCalled();
    }
  });

  it('applies the default to later responses once and preserves manual collapse', async () => {
    plugin.hooks.onInit();
    const single = createResponses(['200']);
    const multiple = createResponses(['200', '400']);
    const expanded = createResponses(['200'], true);
    document.querySelector('.scalar-app')!.append(single.list, multiple.list, expanded.list);

    await vi.waitFor(() => {
      expect(single.responses[0].button.getAttribute('aria-expanded')).toBe('true');
    });
    expect(single.responses[0].toggle).toHaveBeenCalledTimes(1);
    multiple.responses.forEach(({ toggle }) => expect(toggle).not.toHaveBeenCalled());

    single.responses[0].button.click();
    expanded.responses[0].button.click();
    single.list.remove();
    expanded.list.remove();
    document.querySelector('.scalar-app')!.append(single.list, expanded.list);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(single.responses[0].button.getAttribute('aria-expanded')).toBe('false');
    expect(single.responses[0].toggle).toHaveBeenCalledTimes(2);
    expect(expanded.responses[0].button.getAttribute('aria-expanded')).toBe('false');
    expect(expanded.responses[0].toggle).toHaveBeenCalledTimes(1);
  });
});

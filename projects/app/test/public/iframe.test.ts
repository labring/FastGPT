// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, '../../public/js/iframe.js'), 'utf8');

describe('floating chat window resizing', () => {
  let resizeCallback: ResizeObserverCallback;
  let listeners: [
    string,
    EventListenerOrEventListenerObject,
    boolean | AddEventListenerOptions | undefined
  ][];

  const iframe = () => document.getElementById('fastgpt-chatbot-window') as HTMLIFrameElement;
  const handle = () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Resize chat window"]')!;

  const pointer = ({
    type,
    x,
    y,
    button = 0,
    pointerId = 1,
    isPrimary = true
  }: {
    type: string;
    x: number;
    y: number;
    button?: number;
    pointerId?: number;
    isPrimary?: boolean;
  }) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });
    Object.defineProperties(event, {
      isPrimary: { value: isPrimary },
      pointerId: { value: pointerId }
    });
    handle().dispatchEvent(event);
  };

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1400);
    vi.stubGlobal('innerHeight', 1000);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe() {}
      }
    );
    listeners = [];
    const addEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      listeners.push([type, listener, options]);
      addEventListener(type, listener, options);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return parseFloat(this.style.width) || 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return parseFloat(this.style.height) || 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const width = this.offsetWidth;
      const height = this.offsetHeight;
      const right = window.innerWidth - (parseFloat(this.style.right) || 0);
      const bottom = window.innerHeight - (parseFloat(this.style.bottom) || 0);
      return {
        x: right - width,
        y: bottom - height,
        left: right - width,
        top: bottom - height,
        right,
        bottom,
        width,
        height,
        toJSON: () => ({})
      };
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn()
    });
    document.body.innerHTML =
      '<script id="chatbot-iframe" data-bot-src="https://chat.example.com/"></script>';
    new Function(`${source}\nembedChatbot();`)();
  });

  afterEach(() => {
    listeners.forEach(([type, listener, options]) =>
      window.removeEventListener(type, listener, options)
    );
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps the window and resize handle hidden until opened', () => {
    expect(iframe().style.visibility).toBe('hidden');
    expect(handle().style.visibility).toBe('hidden');
    document.getElementById('fastgpt-chatbot-button')!.click();
    expect(iframe().style.visibility).toBe('unset');
    expect(handle().style.visibility).toBe('unset');
    expect(iframe().allow).toBe('microphone *; *');
    expect(iframe().referrerPolicy).toBe('no-referrer');
  });

  it('enlarges from the top left while retaining the opposite corner', () => {
    const before = iframe().getBoundingClientRect();
    pointer({ type: 'pointerdown', x: before.left + 8, y: before.top + 8 });
    pointer({ type: 'pointermove', x: before.left - 192, y: before.top - 142 });
    const after = iframe().getBoundingClientRect();
    expect(after.width).toBe(before.width + 200);
    expect(after.height).toBe(before.height + 150);
    expect(after.right).toBe(before.right);
    expect(after.bottom).toBe(before.bottom);
    expect(handle().style.left).toBe(`${after.left}px`);
    expect(handle().style.top).toBe(`${after.top}px`);
    expect(handle().setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('limits resizing to usable minimum dimensions and the viewport', () => {
    pointer({ type: 'pointerdown', x: 1000, y: 500 });
    pointer({ type: 'pointermove', x: -1000, y: -1000 });
    expect(iframe().offsetWidth).toBe(1260);
    expect(iframe().offsetHeight).toBe(850);
    pointer({ type: 'pointermove', x: 3000, y: 3000 });
    expect(iframe().offsetWidth).toBe(240);
    expect(iframe().offsetHeight).toBe(240);
  });

  it('stops resizing when pointer capture is lost and ignores secondary buttons', () => {
    pointer({ type: 'pointerdown', x: 1000, y: 500, button: 2 });
    pointer({ type: 'pointermove', x: 800, y: 300 });
    expect(iframe().offsetWidth).toBe(375);
    pointer({ type: 'pointerdown', x: 1000, y: 500 });
    pointer({ type: 'lostpointercapture', x: 0, y: 0 });
    pointer({ type: 'pointermove', x: 800, y: 300 });
    expect(iframe().offsetWidth).toBe(375);
  });

  it('supports keyboard resizing without changing size on unrelated keys', () => {
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(iframe().offsetWidth).toBe(395);
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(iframe().offsetHeight).toBe(687);
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(iframe().offsetWidth).toBe(395);
  });

  it('hides the handle safely when the host removes the iframe', () => {
    iframe().remove();
    expect(() => resizeCallback([], {} as ResizeObserver)).not.toThrow();
    expect(handle().style.visibility).toBe('hidden');
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });

  it('limits growth to the available space above and left of the anchored corner', () => {
    iframe().style.right = '900px';
    iframe().style.bottom = '500px';
    iframe().style.height = '375px';
    pointer({ type: 'pointerdown', x: 130, y: 130 });
    pointer({ type: 'pointermove', x: -100, y: -100 });
    expect(iframe().offsetWidth).toBe(500);
    expect(iframe().offsetHeight).toBe(500);
    expect(handle().style.left).toBe('0px');
    expect(handle().style.top).toBe('0px');
  });

  it('ignores other pointers during an active gesture', () => {
    pointer({ type: 'pointerdown', x: 1000, y: 500, isPrimary: false });
    pointer({ type: 'pointermove', x: 800, y: 300 });
    expect(iframe().offsetWidth).toBe(375);
    pointer({ type: 'pointerdown', x: 1000, y: 500 });
    pointer({ type: 'pointermove', x: 800, y: 300, pointerId: 2 });
    pointer({ type: 'lostpointercapture', x: 0, y: 0, pointerId: 2 });
    expect(iframe().offsetWidth).toBe(375);
    pointer({ type: 'pointermove', x: 800, y: 300 });
    expect(iframe().offsetWidth).toBe(575);
  });

  it('does not start a gesture when pointer capture fails', () => {
    vi.mocked(handle().setPointerCapture).mockImplementationOnce(() => {
      throw new DOMException('Pointer is inactive', 'NotFoundError');
    });
    pointer({ type: 'pointerdown', x: 1000, y: 500 });
    pointer({ type: 'pointermove', x: 800, y: 300 });
    expect(iframe().offsetWidth).toBe(375);
  });

  it.each(['altKey', 'ctrlKey', 'metaKey'])('preserves %s keyboard shortcuts', (modifier) => {
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      [modifier]: true,
      cancelable: true
    });
    handle().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(iframe().offsetWidth).toBe(375);
  });

  it('repositions after host resizing and cancels the active gesture', () => {
    pointer({ type: 'pointerdown', x: 1000, y: 500 });
    vi.stubGlobal('innerWidth', 500);
    iframe().style.width = '450px';
    document.getElementById('fastgpt-chatbot-button')!.style.right = '5px';
    window.dispatchEvent(new Event('resize'));
    expect(iframe().style.right).toBe('50px');
    expect(iframe().getBoundingClientRect().left).toBe(0);
    pointer({ type: 'pointermove', x: 800, y: 300 });
    expect(iframe().offsetWidth).toBe(450);
    expect(iframe().offsetHeight).toBe(667);
  });

  it('hides the handle when the connected iframe has no rendered box', () => {
    iframe().style.visibility = 'unset';
    vi.spyOn(iframe(), 'getBoundingClientRect').mockReturnValue(new DOMRect());
    resizeCallback([], {} as ResizeObserver);
    expect(handle().style.visibility).toBe('hidden');
  });
});

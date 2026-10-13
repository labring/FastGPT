import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, '../../public/js/iframe.js'), 'utf8');

describe('floating chat window resizing', () => {
  let dom: JSDOM;
  let resizeCallback: ResizeObserverCallback;
  let listeners: [
    string,
    EventListenerOrEventListenerObject,
    boolean | AddEventListenerOptions | undefined
  ][];
  let documentListeners: [
    string,
    EventListenerOrEventListenerObject,
    boolean | AddEventListenerOptions | undefined
  ][];

  const iframe = () =>
    dom.window.document.getElementById('fastgpt-chatbot-window') as HTMLIFrameElement;
  const handle = () =>
    dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Resize chat window"]')!;

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
    const event = new dom.window.MouseEvent(type, {
      clientX: x,
      clientY: y,
      button,
      bubbles: true
    });
    Object.defineProperties(event, {
      isPrimary: { value: isPrimary },
      pointerId: { value: pointerId }
    });
    handle().dispatchEvent(event);
  };

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><body><script id="chatbot-iframe" data-bot-src="https://chat.example.com/"></script></body>',
      {
        url: 'https://host.example.com/'
      }
    );
    Object.defineProperties(dom.window, {
      innerWidth: { configurable: true, writable: true, value: 1400 },
      innerHeight: { configurable: true, writable: true, value: 1000 }
    });
    const IntersectionObserverMock = class {
      observe() {}
      disconnect() {}
    };
    const ResizeObserverMock = class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    };
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    listeners = [];
    documentListeners = [];
    const addEventListener = dom.window.addEventListener.bind(dom.window);
    vi.spyOn(dom.window, 'addEventListener').mockImplementation((type, listener, options) => {
      listeners.push([type, listener, options]);
      addEventListener(type, listener, options);
    });
    const addDocumentListener = dom.window.document.addEventListener.bind(dom.window.document);
    vi.spyOn(dom.window.document, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        documentListeners.push([type, listener, options]);
        addDocumentListener(type, listener, options);
      }
    );
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return parseFloat(this.style.width) || 0;
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return parseFloat(this.style.height) || 0;
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const width = this.offsetWidth;
        const height = this.offsetHeight;
        const right = dom.window.innerWidth - (parseFloat(this.style.right) || 0);
        const bottom = dom.window.innerHeight - (parseFloat(this.style.bottom) || 0);
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
      }
    );
    Object.defineProperty(dom.window.HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn()
    });
    new Function(`${source}\nembedChatbot();`)();
  });

  afterEach(() => {
    listeners.forEach(([type, listener, options]) =>
      dom.window.removeEventListener(type, listener, options)
    );
    documentListeners.forEach(([type, listener, options]) =>
      dom.window.document.removeEventListener(type, listener, options)
    );
    delete (dom.window.HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the window and resize handle hidden until opened', () => {
    expect(iframe().style.visibility).toBe('hidden');
    expect(handle().style.visibility).toBe('hidden');
    dom.window.document.getElementById('fastgpt-chatbot-button')!.click();
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
    handle().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(iframe().offsetWidth).toBe(395);
    handle().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(iframe().offsetHeight).toBe(687);
    handle().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(iframe().offsetWidth).toBe(395);
  });

  it('hides the handle safely when the host removes the iframe', () => {
    iframe().remove();
    expect(() => resizeCallback([], {} as ResizeObserver)).not.toThrow();
    expect(handle().style.visibility).toBe('hidden');
    expect(() => dom.window.dispatchEvent(new dom.window.Event('resize'))).not.toThrow();
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
    const event = new dom.window.KeyboardEvent('keydown', {
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
    Object.defineProperty(dom.window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 500
    });
    iframe().style.width = '450px';
    dom.window.document.getElementById('fastgpt-chatbot-button')!.style.right = '5px';
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    expect(iframe().style.right).toBe('50px');
    expect(iframe().getBoundingClientRect().left).toBe(0);
    pointer({ type: 'pointermove', x: 800, y: 300 });
    expect(iframe().offsetWidth).toBe(450);
    expect(iframe().offsetHeight).toBe(667);
  });

  it('hides the handle when the connected iframe has no rendered box', () => {
    iframe().style.visibility = 'unset';
    vi.spyOn(iframe(), 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({})
    });
    resizeCallback([], {} as ResizeObserver);
    expect(handle().style.visibility).toBe('hidden');
  });
});

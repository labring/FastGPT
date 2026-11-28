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
        const viewportEl =
          dom.window.document.compatMode === 'BackCompat'
            ? dom.window.document.body
            : dom.window.document.documentElement;
        const viewportWidth = viewportEl?.clientWidth || dom.window.innerWidth;
        const viewportHeight = viewportEl?.clientHeight || dom.window.innerHeight;
        const hasLeft =
          Boolean(this.style.left) && this.style.left !== 'unset' && this.style.left !== 'auto';
        const hasTop =
          Boolean(this.style.top) && this.style.top !== 'unset' && this.style.top !== 'auto';
        const left = hasLeft
          ? parseFloat(this.style.left) || 0
          : viewportWidth - (parseFloat(this.style.right) || 0) - width;
        const top = hasTop
          ? parseFloat(this.style.top) || 0
          : viewportHeight - (parseFloat(this.style.bottom) || 0) - height;
        const right = left + width;
        const bottom = top + height;
        return {
          x: left,
          y: top,
          left,
          top,
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

  it('limits resizing to usable minimum dimensions and symmetric vertical viewport bounds', () => {
    pointer({ type: 'pointerdown', x: 1000, y: 500 });
    pointer({ type: 'pointermove', x: -1000, y: -1000 });
    expect(iframe().offsetWidth).toBe(1260);
    expect(iframe().offsetHeight).toBe(940);
    const maxRect = iframe().getBoundingClientRect();
    expect(maxRect.top).toBe(30);
    expect(dom.window.innerHeight - maxRect.bottom).toBe(30);
    pointer({ type: 'pointermove', x: 3000, y: 3000 });
    expect(iframe().offsetWidth).toBe(375);
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
    expect(iframe().offsetHeight).toBe(470);
    expect(handle().style.left).toBe('0px');
    expect(handle().style.top).toBe('30px');
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

  it('keeps enlarged window and handle inside viewport when host shrinks with a classic scrollbar', () => {
    const setViewport = ({
      innerWidth,
      clientWidth
    }: {
      innerWidth: number;
      clientWidth: number;
    }) => {
      Object.defineProperties(dom.window, {
        innerWidth: { configurable: true, writable: true, value: innerWidth },
        innerHeight: { configurable: true, writable: true, value: 1000 }
      });
      Object.defineProperties(dom.window.document.documentElement, {
        clientWidth: { configurable: true, writable: true, value: clientWidth },
        clientHeight: { configurable: true, writable: true, value: 1000 }
      });
    };

    setViewport({ innerWidth: 1400, clientWidth: 1383 });
    dom.window.dispatchEvent(new dom.window.Event('resize'));

    const before = iframe().getBoundingClientRect();
    pointer({ type: 'pointerdown', x: before.left + 8, y: before.top + 8 });
    pointer({ type: 'pointermove', x: before.left - 112, y: before.top + 8 });
    pointer({ type: 'lostpointercapture', x: 0, y: 0 });
    expect(iframe().offsetWidth).toBe(495);

    setViewport({ innerWidth: 620, clientWidth: 603 });
    dom.window.dispatchEvent(new dom.window.Event('resize'));

    expect(iframe().style.right).toBe('108px');
    expect(iframe().getBoundingClientRect().left).toBe(0);
    expect(handle().style.left).toBe('0px');
  });

  it('uses body viewport metrics in BackCompat mode on tall pages without a doctype', () => {
    Object.defineProperty(dom.window.document, 'compatMode', {
      configurable: true,
      value: 'BackCompat'
    });
    Object.defineProperties(dom.window, {
      innerWidth: { configurable: true, writable: true, value: 1200 },
      innerHeight: { configurable: true, writable: true, value: 835 }
    });
    Object.defineProperties(dom.window.document.documentElement, {
      clientWidth: { configurable: true, writable: true, value: 1183 },
      clientHeight: { configurable: true, writable: true, value: 2082 }
    });
    Object.defineProperties(dom.window.document.body, {
      clientWidth: { configurable: true, writable: true, value: 1183 },
      clientHeight: { configurable: true, writable: true, value: 835 }
    });

    dom.window.dispatchEvent(new dom.window.Event('resize'));

    expect(iframe().style.bottom).toBe('30px');
    const rect = iframe().getBoundingClientRect();
    expect(rect.top).toBe(138);
    expect(rect.bottom).toBe(805);
    expect(handle().style.top).toBe('138px');

    pointer({ type: 'pointerdown', x: rect.left + 8, y: rect.top + 8 });
    pointer({ type: 'pointermove', x: rect.left + 8, y: -500 });
    pointer({ type: 'lostpointercapture', x: 0, y: 0 });
    expect(iframe().offsetHeight).toBe(775);
    expect(iframe().getBoundingClientRect().top).toBe(30);
  });

  it('adapts window anchor and resize handle across top-left, top-right, and bottom-left quadrants', () => {
    const btn = dom.window.document.getElementById('fastgpt-chatbot-button')!;
    iframe().style.height = '400px';

    // Top-left quadrant: button near top-left -> window opens right & down, handle at bottom-right
    btn.style.right = '1340px';
    btn.style.bottom = '920px';
    dom.window.dispatchEvent(new dom.window.Event('resize'));

    const tlRect = iframe().getBoundingClientRect();
    expect(iframe().style.left).toBe('70px');
    expect(iframe().style.top).toBe('40px');
    expect(iframe().style.right).toBe('unset');
    expect(iframe().style.bottom).toBe('unset');
    expect(handle().style.left).toBe(`${tlRect.right - 18}px`);
    expect(handle().style.top).toBe(`${tlRect.bottom - 18}px`);
    expect(handle().style.cursor).toBe('nwse-resize');

    pointer({ type: 'pointerdown', x: tlRect.right - 9, y: tlRect.bottom - 9 });
    pointer({ type: 'pointermove', x: tlRect.right + 141, y: tlRect.bottom + 91 });
    pointer({ type: 'lostpointercapture', x: 0, y: 0 });
    expect(iframe().offsetWidth).toBe(525);
    expect(iframe().offsetHeight).toBe(500);
    expect(iframe().getBoundingClientRect().left).toBe(tlRect.left);
    expect(iframe().getBoundingClientRect().top).toBe(tlRect.top);

    handle().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
    handle().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(iframe().offsetWidth).toBe(545);
    expect(iframe().offsetHeight).toBe(520);

    // Top-right quadrant: button near upper-right -> window opens left & down, handle at bottom-left
    btn.style.right = '60px';
    btn.style.bottom = '860px';
    dom.window.dispatchEvent(new dom.window.Event('resize'));

    const trRect = iframe().getBoundingClientRect();
    expect(iframe().style.right).toBe('110px');
    expect(iframe().style.top).toBe('100px');
    expect(handle().style.left).toBe(`${trRect.left}px`);
    expect(handle().style.top).toBe(`${trRect.bottom - 18}px`);
    expect(handle().style.cursor).toBe('nesw-resize');

    pointer({ type: 'pointerdown', x: trRect.left + 9, y: trRect.bottom - 9 });
    pointer({ type: 'pointermove', x: trRect.left - 91, y: trRect.bottom + 91 });
    pointer({ type: 'lostpointercapture', x: 0, y: 0 });
    expect(iframe().offsetWidth).toBe(645);
    expect(iframe().offsetHeight).toBe(620);
    expect(iframe().getBoundingClientRect().right).toBe(trRect.right);
    expect(iframe().getBoundingClientRect().top).toBe(trRect.top);

    // Bottom-left quadrant: button near bottom-left -> window opens right & up, handle at top-right
    btn.style.right = '1340px';
    btn.style.bottom = '30px';
    dom.window.dispatchEvent(new dom.window.Event('resize'));

    const blRect = iframe().getBoundingClientRect();
    expect(iframe().style.left).toBe('70px');
    expect(iframe().style.bottom).toBe('30px');
    expect(handle().style.left).toBe(`${blRect.right - 18}px`);
    expect(handle().style.top).toBe(`${blRect.top}px`);
    expect(handle().style.cursor).toBe('nesw-resize');
  });

  it('clamps downward-expanding window inside bottom viewport margin when button sits mid-upper', () => {
    const btn = dom.window.document.getElementById('fastgpt-chatbot-button')!;
    btn.style.right = '60px';
    btn.style.bottom = '520px';
    dom.window.dispatchEvent(new dom.window.Event('resize'));

    const rect = iframe().getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(30);
    expect(dom.window.innerHeight - rect.bottom).toBe(30);
  });

  it('allows dragging the launcher button only while the chat window is closed', () => {
    dom.window.document.body.innerHTML =
      '<script id="chatbot-iframe" data-bot-src="https://chat.example.com/" data-drag="true" data-default-open="true"></script>';
    new Function(`${source}\nembedChatbot();`)();

    const btn = dom.window.document.getElementById('fastgpt-chatbot-button')!;
    const dragBtn = ({
      fromX,
      fromY,
      toX,
      toY
    }: {
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }) => {
      btn.dispatchEvent(
        new dom.window.MouseEvent('mousedown', { clientX: fromX, clientY: fromY, bubbles: true })
      );
      dom.window.dispatchEvent(
        new dom.window.MouseEvent('mousemove', { clientX: toX, clientY: toY, bubbles: true })
      );
      dom.window.dispatchEvent(
        new dom.window.MouseEvent('mouseup', { clientX: toX, clientY: toY, bubbles: true })
      );
    };

    // Open: dragging must be blocked
    dragBtn({ fromX: 1320, fromY: 950, toX: 200, toY: 120 });
    expect(btn.style.right).toBe('60px');
    expect(btn.style.bottom).toBe('30px');

    // Close the window, then dragging works and reopening adopts the new quadrant
    btn.click();
    expect(iframe().style.visibility).toBe('hidden');

    dragBtn({ fromX: 1320, fromY: 950, toX: 60, toY: 80 });
    expect(btn.style.right).toBe('1320px');
    expect(btn.style.bottom).toBe('900px');

    btn.dispatchEvent(
      new dom.window.MouseEvent('mousedown', { clientX: 60, clientY: 80, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.MouseEvent('mouseup', { clientX: 60, clientY: 80, bubbles: true })
    );
    btn.click();
    expect(iframe().style.visibility).toBe('unset');
    expect(iframe().style.left).toBe('90px');
    expect(iframe().style.top).toBe('60px');
  });

  it('overrides host left/top positioning when dragging the launcher button while closed', () => {
    dom.window.document.body.innerHTML =
      '<script id="chatbot-iframe" data-bot-src="https://chat.example.com/" data-drag="true"></script>';
    new Function(`${source}\nembedChatbot();`)();

    const btn = dom.window.document.getElementById('fastgpt-chatbot-button')!;
    btn.style.left = '160px';
    btn.style.top = '120px';

    btn.dispatchEvent(
      new dom.window.MouseEvent('mousedown', { clientX: 180, clientY: 140, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.MouseEvent('mousemove', { clientX: 280, clientY: 220, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.MouseEvent('mouseup', { clientX: 280, clientY: 220, bubbles: true })
    );

    expect(btn.style.left).toBe('auto');
    expect(btn.style.top).toBe('auto');
    const movedBtn = btn.getBoundingClientRect();
    expect(movedBtn.left).toBe(260);
    expect(movedBtn.top).toBe(200);

    btn.dispatchEvent(
      new dom.window.MouseEvent('mousedown', { clientX: 280, clientY: 220, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.MouseEvent('mouseup', { clientX: 280, clientY: 220, bubbles: true })
    );
    btn.click();

    expect(iframe().style.visibility).toBe('unset');
    expect(iframe().style.left).toBe('310px');
    expect(iframe().style.top).toBe('200px');
  });
});

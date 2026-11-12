import { describe, expect, it, vi } from 'vitest';
import { onEnter } from './utils';

const ev = (key: string, isComposing: boolean, keyCode = key === 'Enter' ? 13 : 0) => ({
  key,
  keyCode,
  nativeEvent: { isComposing } as KeyboardEvent,
  preventDefault: vi.fn(),
});

describe('onEnter', () => {
  it('한글 조합 중 Enter는 무시, 조합 끝난 Enter만 실행 (샤브샤브 + 브 중복 방지)', () => {
    const fn = vi.fn();
    const handler = onEnter(fn);
    handler(ev('Enter', true)); // 조합 중
    handler(ev('Process', false, 229)); // 일부 브라우저: keyCode 229
    handler(ev('Enter', false, 229));
    expect(fn).not.toHaveBeenCalled();
    const done = ev('Enter', false);
    handler(done); // 조합 완료 후
    expect(fn).toHaveBeenCalledTimes(1);
    expect(done.preventDefault).toHaveBeenCalled();
  });

  it('다른 키는 무시', () => {
    const fn = vi.fn();
    onEnter(fn)(ev('a', false));
    expect(fn).not.toHaveBeenCalled();
  });
});

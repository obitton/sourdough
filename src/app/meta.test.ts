import { describe, expect, it } from 'vitest';
import { formatLoad, formatMonths } from './meta';

describe('formatters', () => {
  it('never renders an infinite load as a number', () => {
    // A function with work waiting and nobody to do it divides by zero. The
    // panel used to print "Infinity%".
    expect(formatLoad(Infinity, 0)).toBe('unstaffed');
    expect(formatLoad(0, 0)).toBe('unstaffed');
    expect(formatLoad(1.234, 3)).toBe('123%');
  });

  it('caps runway where it stops being a planning number', () => {
    expect(formatMonths(Infinity)).toBe('∞');
    expect(formatMonths(61)).toBe('60+');
    expect(formatMonths(12.4)).toBe('12');
  });
});

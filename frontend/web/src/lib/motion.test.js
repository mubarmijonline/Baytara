import { describe, expect, it } from 'vitest';
import { splitStat } from './motion.js';

describe('splitStat', () => {
  it('animates the number and leaves the words around it alone', () => {
    // The client writes these by hand in site settings, in Arabic, with a suffix.
    expect(splitStat('2+ مليون متعلّم عربي')).toMatchObject({
      prefix: '', value: 2, suffix: '+ مليون متعلّم عربي', decimals: 0,
    });
  });

  it('keeps the decimals it was given, so a rating never lands on 5', () => {
    expect(splitStat('4.8 من 5')).toMatchObject({ value: 4.8, decimals: 1 });
  });

  it('remembers a thousands separator so the count does not lose it', () => {
    expect(splitStat('1,200 ساعة')).toMatchObject({ value: 1200, grouped: true });
  });

  it('handles a number that arrives after its prefix', () => {
    expect(splitStat('+30 محاضر')).toMatchObject({ prefix: '+', value: 30, suffix: ' محاضر' });
  });

  it('gives up on a statistic with no number in it, rather than showing zero', () => {
    expect(splitStat('شهادات معتمدة')).toBeNull();
    expect(splitStat(undefined)).toBeNull();
  });
});

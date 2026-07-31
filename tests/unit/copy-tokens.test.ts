import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fillTokens } from '../../build/copy-tokens';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('fillTokens', () => {
  it('leaves the markup untouched while every value is its own literal token', () => {
    // The identity case is what keeps Phase 3's verified pixel parity honest:
    // until the owner fills content.ts, the built HTML is byte-for-byte the
    // authored HTML.
    expect(fillTokens(html)).toBe(html);
  });

  it('substitutes from the table', () => {
    expect(fillTokens('<p>{{A}} and {{B}}</p>', { A: 'one', B: 'two' })).toBe('<p>one and two</p>');
  });

  it('substitutes every occurrence of a repeated token', () => {
    expect(fillTokens('{{A}}/{{A}}/{{A}}', { A: 'x' })).toBe('x/x/x');
  });

  it('escapes copy so an ampersand cannot break the markup', () => {
    expect(fillTokens('<p>{{A}}</p>', { A: 'Backend & Platform' })).toBe(
      '<p>Backend &amp; Platform</p>',
    );
  });

  it('escapes quotes so copy cannot break out of an attribute', () => {
    expect(fillTokens('<meta content="{{A}}">', { A: 'He said "hi"' })).toBe(
      '<meta content="He said &quot;hi&quot;">',
    );
  });

  it('escapes angle brackets so copy cannot inject an element', () => {
    expect(fillTokens('<p>{{A}}</p>', { A: '<script>alert(1)</script>' })).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  it('fails the build on a token the content table does not define', () => {
    expect(() => fillTokens('<p>{{TYPPO}}</p>', { A: 'x' })).toThrow(/TYPPO/);
  });

  it('ignores text that is not a token', () => {
    const noise = '{ {A} } {{lowercase}} {{ SPACED }} {{}}';
    expect(fillTokens(noise, { A: 'x' })).toBe(noise);
  });
});

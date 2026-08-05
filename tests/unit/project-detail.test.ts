/**
 * The video facade's pure half.
 *
 * These three functions decide what the site asks of a third party and when.
 * The site makes no third-party request at all until a detail is open, and none
 * to the player until the visitor clicks play — so the host names, the
 * `nocookie` domain and the thumbnail variant are all worth pinning literally
 * rather than left to read correct.
 *
 * The DOM half — building the still, tearing the embed down, the focus trap —
 * is covered end to end by `tests/e2e/project-detail.spec.ts`, where there is a
 * real document and a real browser to trap focus in.
 */

import { describe, expect, it } from 'vitest';

import { CONTENT } from '../../src/content';
import { embedUrl, thumbUrl, videoIdFrom } from '../../src/project-detail';

describe('videoIdFrom', () => {
  it('reads the v of a watch URL', () => {
    expect(videoIdFrom('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(videoIdFrom('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42')).toBe('dQw4w9WgXcQ');
  });

  it('rejects the unfilled token, so no facade is built for a video that has none', () => {
    // This is the state the site ships in until the owner supplies ids. It has
    // to read as "no video", not as a broken one — what is left on screen is
    // the plain "Watch video ↗" link the markup carries.
    const href = `https://www.youtube.com/watch?v=${CONTENT.PROJECT_1_VIDEO_ID}`;
    expect(videoIdFrom(href)).toBeNull();
  });

  it('rejects a host that merely ends in something like youtube.com', () => {
    expect(videoIdFrom('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoIdFrom('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoIdFrom('https://vimeo.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('rejects anything that is not a watch URL with a usable id', () => {
    expect(videoIdFrom('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBeNull();
    expect(videoIdFrom('https://www.youtube.com/watch')).toBeNull();
    expect(videoIdFrom('https://www.youtube.com/watch?v=')).toBeNull();
    expect(videoIdFrom('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(videoIdFrom('dQw4w9WgXcQ')).toBeNull();
    expect(videoIdFrom('')).toBeNull();
  });
});

describe('the URLs the facade builds', () => {
  it('takes the thumbnail from hqdefault', () => {
    // Literal on purpose. `maxresdefault` 404s for any video never processed at
    // 720p and would leave a hole where the still should be; `mqdefault` is
    // 320×180. Swapping this should have to be a deliberate act.
    expect(thumbUrl('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('embeds through youtube-nocookie, and only ever autoplaying', () => {
    const url = new URL(embedUrl('dQw4w9WgXcQ'));
    expect(url.hostname).toBe('www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    // The embed is built by the click on play, so it has to start playing.
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('rel')).toBe('0');
  });

  it('never points the embed at the tracking domain', () => {
    expect(embedUrl('dQw4w9WgXcQ')).not.toMatch(/\/\/(www\.)?youtube\.com/);
  });
});

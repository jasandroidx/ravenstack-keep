import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isGrokEmbedderOrigin } from './preview-embedder-origin.ts';

describe('isGrokEmbedderOrigin', () => {
  it('returns true for exact domain', () => {
    assert.strictEqual(isGrokEmbedderOrigin('https://grok.com'), true);
    assert.strictEqual(isGrokEmbedderOrigin('http://grok.com'), true);
  });

  it('returns true for subdomains', () => {
    assert.strictEqual(isGrokEmbedderOrigin('https://sub.grok.com'), true);
    assert.strictEqual(isGrokEmbedderOrigin('https://a.b.grok.com'), true);
  });

  it('returns true for localhost', () => {
    assert.strictEqual(isGrokEmbedderOrigin('http://localhost'), true);
    assert.strictEqual(isGrokEmbedderOrigin('http://localhost:3000'), true);
    assert.strictEqual(isGrokEmbedderOrigin('http://127.0.0.1'), true);
    assert.strictEqual(isGrokEmbedderOrigin('http://127.0.0.1:8080'), true);
    assert.strictEqual(isGrokEmbedderOrigin('http://[::1]'), true);
    assert.strictEqual(isGrokEmbedderOrigin('http://[::1]:3000'), true);
  });

  it('returns false for invalid domains', () => {
    assert.strictEqual(isGrokEmbedderOrigin('https://notgrok.com'), false);
    assert.strictEqual(isGrokEmbedderOrigin('https://grok.com.evil.com'), false);
    assert.strictEqual(isGrokEmbedderOrigin('https://evilgrok.com'), false);
  });

  it('returns false for invalid protocols', () => {
    assert.strictEqual(isGrokEmbedderOrigin('ftp://grok.com'), false);
    assert.strictEqual(isGrokEmbedderOrigin('wss://grok.com'), false);
    assert.strictEqual(isGrokEmbedderOrigin('file://grok.com'), false);
  });

  it('returns false for non-URL strings', () => {
    assert.strictEqual(isGrokEmbedderOrigin('invalid-string'), false);
    assert.strictEqual(isGrokEmbedderOrigin('grok.com'), false); // no protocol
    assert.strictEqual(isGrokEmbedderOrigin(''), false);
  });
});

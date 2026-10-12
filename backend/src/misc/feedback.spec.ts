import { describe, expect, it } from 'vitest';
import { assertIn, assertText, FEEDBACK_CATEGORIES, TEXT_LIMITS } from '../common/validate.js';

// Contract for POST /feedback inputs: category must be one of the three
// kinds the HelpCenter form offers; message follows the shared 500-char cap.
describe('feedback input contract', () => {
  it('accepts the three HelpCenter categories', () => {
    expect(FEEDBACK_CATEGORIES).toEqual(['Problem', 'Suggestion', 'Question']);
    for (const c of FEEDBACK_CATEGORIES) {
      expect(assertIn(c, FEEDBACK_CATEGORIES, 'Category')).toBe(c);
    }
  });

  it('rejects unknown categories with a named error', () => {
    expect(() => assertIn('Bug', FEEDBACK_CATEGORIES, 'Category')).toThrow(/Category is invalid/);
    expect(() => assertIn('', FEEDBACK_CATEGORIES, 'Category')).toThrow(/Category is invalid/);
  });

  it('caps the message at TEXT_LIMITS.message', () => {
    expect(TEXT_LIMITS.message).toBe(500);
    expect(assertText('ok', 'Message', TEXT_LIMITS.message)).toBe('ok');
    expect(() => assertText('   ', 'Message', TEXT_LIMITS.message)).toThrow(/Message is empty/);
    expect(() => assertText('x'.repeat(501), 'Message', TEXT_LIMITS.message)).toThrow(/too long/);
  });
});

import { sanitizeFilename } from './sanitize-filename.util';

describe('sanitizeFilename', () => {
  it('should remove path traversal attempts', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('etcpasswd');
  });

  it('should remove slashes', () => {
    expect(sanitizeFilename('a/b\\c')).toBe('abc');
  });

  it('should remove dangerous characters', () => {
    expect(sanitizeFilename('a<b:c"d>e|f?g*h')).toBe('abcdefgh');
  });

  it('should remove control characters', () => {
    expect(sanitizeFilename('a\x00b\x1fc')).toBe('abc');
  });

  it('should normalize Unicode characters', () => {
    // \u00e9 is the acute e, which is a single character
    // \u0065\u0301 is the same character, but composed of two parts
    const composed = '\u00e9'; // é
    const decomposed = '\u0065\u0301'; // e + ´
    expect(sanitizeFilename(decomposed)).toBe(composed);
  });

  it('should collapse and trim spaces', () => {
    expect(sanitizeFilename('  a  b  ')).toBe('a_b');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeFilename('a b c')).toBe('a_b_c');
  });

  it('should remove leading and trailing dots', () => {
    expect(sanitizeFilename('.a.b.')).toBe('a.b');
  });

  it('should throw an error for empty or invalid input', () => {
    expect(() => sanitizeFilename('')).toThrow('Filename must be a non-empty string');
    expect(() => sanitizeFilename(null as any)).toThrow('Filename must be a non-empty string');
    expect(() => sanitizeFilename(undefined as any)).toThrow('Filename must be a non-empty string');
  });

  it('should throw an error if filename becomes empty after sanitization', () => {
    expect(() => sanitizeFilename('..')).toThrow('Filename becomes empty after sanitization');
  });

  describe('length truncation', () => {
    const longString = 'a'.repeat(150);
    const longStringWithExt = 'b'.repeat(118) + '.ext';

    it('should truncate a long filename without an extension', () => {
      const sanitized = sanitizeFilename(longString, 120);
      expect(sanitized.length).toBe(120);
    });

    it('should truncate a long filename and preserve the extension', () => {
      const sanitized = sanitizeFilename(longStringWithExt);
      expect(sanitized).toBe('b'.repeat(116) + '.ext');
      expect(sanitized.length).toBe(120);
    });

    // This is the failing test case for the bug
    it('should handle truncation when the extension is longer than the max length', () => {
        const maxLength = 10;
        const originalName = 'short.verylongextension'; // length > 10
        const sanitized = sanitizeFilename(originalName, maxLength);
        expect(sanitized.length).toBeLessThanOrEqual(maxLength);
        expect(sanitized.startsWith('.')).toBe(false);
    });
  });
});

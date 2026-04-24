/**
 * Sanitize filename utility for secure file storage
 * Follows PM requirements: anti-path-traversal, Unicode normalization, length limits
 */

export function sanitizeFilename(filename: string, maxLength = 120): string {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }

  // 1. Unicode normalization (NFC - canonical composed)
  let sanitized = filename.normalize('NFC');

  // 2. Remove path traversal attempts and dangerous characters
  sanitized = sanitized
    .replace(/\.\./g, '') // Remove ".."
    .replace(/\/|\\/g, '') // Remove forward/back slashes
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
    .replace(/[<>:"|?*]/g, '') // Remove Windows forbidden chars
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, ''); // Remove trailing dots

  // 3. Collapse multiple spaces and trim
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // 4. Replace spaces with underscores for URL safety
  sanitized = sanitized.replace(/\s/g, '_');

  // 5. Limit length (maxLength chars max as per PM spec)
  if (sanitized.length > maxLength) {
    const extension = sanitized.includes('.')
      ? '.' + sanitized.split('.').pop()
      : '';

    if (extension.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    } else {
      const nameOnly = sanitized.substring(0, maxLength - extension.length);
      sanitized = nameOnly + extension;
    }
  }

  // 6. Ensure we still have a valid filename
  if (!sanitized || sanitized.length === 0) {
    throw new Error('Filename becomes empty after sanitization');
  }

  return sanitized;
}

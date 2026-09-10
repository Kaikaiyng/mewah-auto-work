export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isValidPassword(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH &&
    /^[\x21-\x7E]+$/.test(value)
  );
}

export function passwordValidationMessage(value: string, label = "Password"): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `${label} must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `${label} must not exceed ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!/^[\x21-\x7E]+$/.test(value)) {
    return `${label} can only contain English letters, numbers, and symbols, without spaces or Chinese characters.`;
  }
  return null;
}

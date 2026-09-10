export const EMAIL_PLACEHOLDER = "name@example.com";

const LOCAL_PART_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i;

export function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex < 0) {
    return trimmed;
  }

  return `${trimmed.slice(0, atIndex)}@${trimmed.slice(atIndex + 1).toLowerCase()}`;
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || /\s/.test(email)) {
    return false;
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;
  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !LOCAL_PART_PATTERN.test(localPart)
  ) {
    return false;
  }

  const domainLabels = domain.split(".");
  const topLevelDomain = domainLabels[domainLabels.length - 1] ?? "";
  return (
    domainLabels.length >= 2 &&
    domainLabels.every((label) => DOMAIN_LABEL_PATTERN.test(label)) &&
    /^[A-Z]{2,63}$/i.test(topLevelDomain)
  );
}

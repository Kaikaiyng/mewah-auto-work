const STANDARD_MOBILE_PREFIXES = new Set(["10", "12", "13", "14", "16", "17", "18", "19"]);
const EXTENDED_MOBILE_PREFIXES = new Set(["11", "15"]);

export const MALAYSIA_PHONE_PLACEHOLDER = "+60 00-000 0000";

function localDigits(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("0060")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("60")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

function joinSubscriber(prefix: string, subscriber: string, firstGroupSize: number): string {
  if (!subscriber) {
    return `+60 ${prefix}`;
  }

  const firstGroup = subscriber.slice(0, firstGroupSize);
  const lastGroup = subscriber.slice(firstGroupSize);
  return `+60 ${prefix}-${firstGroup}${lastGroup ? ` ${lastGroup}` : ""}`;
}

export function formatMalaysiaPhoneInput(value: string): string {
  const digits = localDigits(value);
  if (!digits) {
    return value.replace(/\D/g, "") ? "+60 " : "";
  }

  if (digits.startsWith("1")) {
    const prefix = digits.slice(0, 2);
    const subscriber = digits.slice(2);
    return joinSubscriber(prefix, subscriber, EXTENDED_MOBILE_PREFIXES.has(prefix) ? 4 : 3);
  }

  if (digits.startsWith("8") && digits.length > 1) {
    return joinSubscriber(digits.slice(0, 2), digits.slice(2), 3);
  }

  const areaCode = digits.slice(0, 1);
  const subscriber = digits.slice(1);
  return joinSubscriber(areaCode, subscriber, areaCode === "3" ? 4 : 3);
}

export function isValidMalaysiaPhone(value: string): boolean {
  const digits = localDigits(value);
  const prefix = digits.slice(0, 2);

  if (STANDARD_MOBILE_PREFIXES.has(prefix)) {
    return digits.length === 9;
  }
  if (EXTENDED_MOBILE_PREFIXES.has(prefix)) {
    return digits.length === 10;
  }

  return (
    /^3\d{8}$/.test(digits) ||
    /^[4-79]\d{7}$/.test(digits) ||
    /^8[2-9]\d{6}$/.test(digits)
  );
}

export function normalizeMalaysiaPhone(value: string): string | null {
  return isValidMalaysiaPhone(value) ? formatMalaysiaPhoneInput(value) : null;
}

export function formatMalaysiaPhone(value: string): string {
  return normalizeMalaysiaPhone(value) ?? value.trim();
}

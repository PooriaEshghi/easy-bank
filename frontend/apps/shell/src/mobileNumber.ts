export const MOBILE_NUMBER = /^[0-9]{10}$/;

export function isMobileNumber(value: string): boolean {
  return MOBILE_NUMBER.test(value);
}

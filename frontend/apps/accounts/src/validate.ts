export type CustomerFields = {
  name: string;
  email: string;
  mobileNumber: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomer(fields: CustomerFields): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = fields.name.trim();
  if (name.length < 5 || name.length > 30) {
    errors.name = "Il nome deve avere tra 5 e 30 caratteri.";
  }
  if (!EMAIL.test(fields.email.trim())) {
    errors.email = "L'email non è valida.";
  }
  if (!/^[0-9]{10}$/.test(fields.mobileNumber.trim())) {
    errors.mobileNumber = "Il cellulare deve avere 10 cifre.";
  }
  return errors;
}

export function validateBranch(branchAddress: string): Record<string, string> {
  if (branchAddress.trim().length === 0) {
    return { branchAddress: "L'indirizzo della filiale è obbligatorio." };
  }
  return {};
}

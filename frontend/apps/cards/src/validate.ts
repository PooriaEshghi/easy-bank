export type CardAmounts = {
  totalLimit: string;
  amountUsed: string;
  availableAmount: string;
};

function integer(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

export function coherentAvailable(totalLimit: string, amountUsed: string): string | null {
  const limit = integer(totalLimit);
  const used = integer(amountUsed);
  if (limit == null || used == null) {
    return null;
  }
  const available = limit - used;
  return available >= 0 ? String(available) : null;
}

export function validateCardAmounts(fields: CardAmounts): Record<string, string> {
  const errors: Record<string, string> = {};
  const limit = readAmount(fields.totalLimit, errors, "totalLimit");
  const used = readAmount(fields.amountUsed, errors, "amountUsed");
  const available = readAmount(fields.availableAmount, errors, "availableAmount");
  if (limit != null && limit <= 0) {
    errors.totalLimit = "Il plafond deve essere maggiore di zero.";
  }
  if (
    limit != null &&
    used != null &&
    available != null &&
    limit > 0 &&
    errors.amountUsed == null &&
    errors.availableAmount == null &&
    available !== limit - used
  ) {
    errors.availableAmount = "Il disponibile deve essere il plafond meno l'utilizzato.";
  }
  return errors;
}

function readAmount(value: string, errors: Record<string, string>, field: string): number | null {
  const parsed = integer(value);
  if (parsed == null) {
    errors[field] = "Inserisci un numero intero, zero o maggiore.";
    return null;
  }
  return parsed;
}

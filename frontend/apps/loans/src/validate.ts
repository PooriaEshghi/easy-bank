export type LoanAmounts = {
  totalLoan: string;
  amountPaid: string;
  outstandingAmount: string;
};

function integer(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

export function coherentOutstanding(totalLoan: string, amountPaid: string): string | null {
  const total = integer(totalLoan);
  const paid = integer(amountPaid);
  if (total == null || paid == null) {
    return null;
  }
  const outstanding = total - paid;
  return outstanding >= 0 ? String(outstanding) : null;
}

export function validateLoanAmounts(fields: LoanAmounts): Record<string, string> {
  const errors: Record<string, string> = {};
  const total = readAmount(fields.totalLoan, errors, "totalLoan");
  const paid = readAmount(fields.amountPaid, errors, "amountPaid");
  const outstanding = readAmount(fields.outstandingAmount, errors, "outstandingAmount");
  if (total != null && total <= 0) {
    errors.totalLoan = "L'importo deve essere maggiore di zero.";
  }
  if (
    total != null &&
    paid != null &&
    outstanding != null &&
    total > 0 &&
    errors.amountPaid == null &&
    errors.outstandingAmount == null &&
    outstanding !== total - paid
  ) {
    errors.outstandingAmount = "Il residuo deve essere l'importo meno il pagato.";
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

export type AccountsDto = {
  accountNumber: number;
  accountType: string;
  branchAddress: string;
};

export type CustomerDto = {
  name: string;
  email: string;
  mobileNumber: string;
  accountsDto?: AccountsDto | null;
};

export type CardsDto = {
  mobileNumber: string;
  cardNumber: string;
  cardType: string;
  totalLimit: number;
  amountUsed: number;
  availableAmount: number;
};

export type LoansDto = {
  mobileNumber: string;
  loanNumber: string;
  loanType: string;
  totalLoan: number;
  amountPaid: number;
  outstandingAmount: number;
};

export type CustomerDetailsDto = {
  name: string;
  email: string;
  mobileNumber: string;
  accountsDto?: AccountsDto | null;
  loansDto?: LoansDto | null;
  cardsDto?: CardsDto | null;
};

export type ResponseDto = {
  statusCode: string;
  statusMsg: string;
};

export type ErrorResponseDto = {
  apiPath: string;
  errorCode: string;
  errorMessage: string;
  errorTime: string;
};

export type ContactInfoDto = {
  message: string | null;
  contactDetails: Record<string, string> | null;
  onCallSupport: string[] | null;
};

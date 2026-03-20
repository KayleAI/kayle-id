export type ShareFieldSource = "default" | "rc";

export type RequestedShareField = {
  required: boolean;
  reason: string;
};

export type RequestedShareFields = Record<string, RequestedShareField>;

export type ShareField = {
  required: boolean;
  reason: string;
  source: ShareFieldSource;
};

export type ShareFields = Record<string, ShareField>;

export type ShareContractErrorCode =
  | "INVALID_SHARE_FIELDS"
  | "UNKNOWN_CLAIM_KEY"
  | "INVALID_AGE_GATE_KEY"
  | "MULTIPLE_AGE_GATES_NOT_ALLOWED"
  | "DOB_AND_AGE_GATE_CONFLICT"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "TOO_MANY_SHARE_FIELDS";

export type ShareContractError = {
  code: ShareContractErrorCode;
  message: string;
  hint: string;
  docs: string;
  status: 400;
};

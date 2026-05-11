import { isValidEmail } from "@/lib/email/send";

export const PERSONAL_PROFILE_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "contact_number",
  "contact_email",
  "cnic",
  "emergency_contact_number",
  "bank_name",
  "bank_branch_name",
  "bank_account_or_iban",
] as const;

export const REQUIRED_PERSONAL_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "contact_number",
  "contact_email",
  "cnic",
  "emergency_contact_number",
  "bank_name",
  "bank_branch_name",
  "bank_account_or_iban",
] as const;

export type PersonalProfileField = (typeof PERSONAL_PROFILE_FIELDS)[number];
export type RequiredPersonalProfileField =
  (typeof REQUIRED_PERSONAL_PROFILE_FIELDS)[number];

export type PersonalProfileInput = Record<PersonalProfileField, string | null>;
export type PersonalProfileSource = Partial<
  Record<PersonalProfileField, string | null | undefined>
>;

const FIELD_LABELS: Record<PersonalProfileField, string> = {
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  contact_number: "Contact number",
  contact_email: "Contact email",
  cnic: "CNIC",
  emergency_contact_number: "Emergency contact number",
  bank_name: "Bank name",
  bank_branch_name: "Bank branch name",
  bank_account_or_iban: "Account number / IBAN",
};

const PHONE_RE = /^[+0-9()\-\s]{7,24}$/;
const CNIC_RE = /^(\d{13}|\d{5}-\d{7}-\d)$/;
const ACCOUNT_RE = /^[A-Za-z0-9 \-_/]{4,40}$/;

export function personalProfileFieldLabel(field: PersonalProfileField): string {
  return FIELD_LABELS[field];
}

export function readPersonalProfileInput(formData: FormData): PersonalProfileInput {
  return {
    first_name: readRequiredString(formData, "first_name"),
    middle_name: readNullableString(formData, "middle_name"),
    last_name: readRequiredString(formData, "last_name"),
    contact_number: readRequiredString(formData, "contact_number"),
    contact_email: readRequiredString(formData, "contact_email").toLowerCase(),
    cnic: readRequiredString(formData, "cnic"),
    emergency_contact_number: readRequiredString(formData, "emergency_contact_number"),
    bank_name: readRequiredString(formData, "bank_name"),
    bank_branch_name: readRequiredString(formData, "bank_branch_name"),
    bank_account_or_iban: readRequiredString(formData, "bank_account_or_iban"),
  };
}

export function validatePersonalProfileInput(input: PersonalProfileInput): string | null {
  for (const field of REQUIRED_PERSONAL_PROFILE_FIELDS) {
    if (!input[field]) return `${FIELD_LABELS[field]} is required.`;
  }
  if (!isValidEmail(input.contact_email ?? "")) {
    return "Contact email must be a valid email address.";
  }
  if (!PHONE_RE.test(input.contact_number ?? "")) {
    return "Contact number must be a valid phone number.";
  }
  if (!PHONE_RE.test(input.emergency_contact_number ?? "")) {
    return "Emergency contact number must be a valid phone number.";
  }
  if (!CNIC_RE.test(input.cnic ?? "")) {
    return "CNIC must be 13 digits or formatted like 12345-1234567-1.";
  }
  if (!ACCOUNT_RE.test(input.bank_account_or_iban ?? "")) {
    return "Account number / IBAN must contain only letters, numbers, spaces, dashes, slashes, or underscores.";
  }
  return null;
}

export function personalProfileCompletionStatus(source: PersonalProfileSource): {
  complete: boolean;
  missingFields: RequiredPersonalProfileField[];
  missingLabels: string[];
} {
  const missingFields = REQUIRED_PERSONAL_PROFILE_FIELDS.filter((field) => {
    const value = source[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
  return {
    complete: missingFields.length === 0,
    missingFields,
    missingLabels: missingFields.map((field) => FIELD_LABELS[field]),
  };
}

export function changedPersonalProfileFields(
  existing: PersonalProfileSource,
  next: PersonalProfileInput
): PersonalProfileField[] {
  return PERSONAL_PROFILE_FIELDS.filter((field) => clean(existing[field]) !== clean(next[field]));
}

export function personalProfileUpdatePayload(input: PersonalProfileInput): PersonalProfileInput {
  return {
    first_name: input.first_name,
    middle_name: input.middle_name,
    last_name: input.last_name,
    contact_number: input.contact_number,
    contact_email: input.contact_email,
    cnic: input.cnic,
    emergency_contact_number: input.emergency_contact_number,
    bank_name: input.bank_name,
    bank_branch_name: input.bank_branch_name,
    bank_account_or_iban: input.bank_account_or_iban,
  };
}

function readRequiredString(formData: FormData, key: PersonalProfileField): string {
  return String(formData.get(key) ?? "").trim();
}

function readNullableString(formData: FormData, key: PersonalProfileField): string | null {
  const value = readRequiredString(formData, key);
  return value || null;
}

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

import { z } from "@dkg/plugin-swagger";

type OptionalIntegerParamOptions = {
  min: number;
  max?: number;
  errorMessage: string;
};

export function optionalNonEmptyQueryString(parameter: string) {
  return z
    .string()
    .trim()
    .min(1, { message: `Parameter '${parameter}' cannot be empty` })
    .optional();
}

export function requiredNonEmptyString(parameter: string) {
  return z
    .string()
    .trim()
    .min(1, { message: `Parameter '${parameter}' cannot be empty` });
}

export function optionalDateTimeQueryString(parameter: string) {
  return z
    .string()
    .trim()
    .min(1, { message: `Parameter '${parameter}' cannot be empty` })
    .datetime({
      message: "Must be ISO 8601 format (e.g., 2024-01-01T00:00:00Z)",
    })
    .optional();
}

export function optionalIntegerQueryParam({
  min,
  max,
  errorMessage,
}: OptionalIntegerParamOptions) {
  return z
    .string()
    .trim()
    .regex(/^-?\d+$/, { message: errorMessage })
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => value >= min && (max === undefined || value <= max), {
      message: errorMessage,
    })
    .optional();
}

export function optionalIntegerInputParam({
  min,
  max,
  errorMessage,
}: OptionalIntegerParamOptions) {
  return z
    .number()
    .int({ message: errorMessage })
    .refine((value) => value >= min && (max === undefined || value <= max), {
      message: errorMessage,
    })
    .optional();
}

export function hasAtLeastOneEpcisFilter(
  query: Record<string, unknown>,
): boolean {
  return Object.entries(query)
    .filter(([key]) => !["fullTrace", "limit", "offset"].includes(key))
    .some(([, value]) => value !== undefined);
}

export function hasValidEpcisDateRange(query: {
  from?: string;
  to?: string;
}): boolean {
  if (!query.from || !query.to) {
    return true;
  }

  return Date.parse(query.from) <= Date.parse(query.to);
}

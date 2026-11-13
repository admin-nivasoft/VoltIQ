import { z } from './common.js';

export const ErrorCodes = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'conflict',
  'rate_limited',
  'internal',
] as const;

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.enum(ErrorCodes),
      message: z.string(),
      details: z
        .array(
          z.object({
            path: z.array(z.union([z.string(), z.number()])),
            message: z.string(),
          }),
        )
        .optional(),
    }),
  })
  .openapi('Error');
export type ApiError = z.infer<typeof ErrorSchema>;

import { z } from 'zod';

export const passwordSchema = z.string().min(12, 'Use at least 12 characters.').refine(
  value => new TextEncoder().encode(value).length <= 72,
  'Password must be no more than 72 bytes.'
);
export const userProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  email: z.string().trim().email('Enter a valid email address.').max(254).transform(value => value.toLowerCase()),
  role: z.enum(['ADMIN', 'ASSESSOR', 'VIEWER']),
}).strict();
export const createUserSchema = userProfileSchema.extend({ password: passwordSchema });
export const editUserSchema = userProfileSchema.partial().refine(value => Object.keys(value).length > 0, 'No changes supplied.');
export const publicUserFields = { id: true, name: true, email: true, role: true, createdAt: true } as const;

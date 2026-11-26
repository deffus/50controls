import { z } from 'zod';
import { COMPLETION_STATES } from '@/lib/scoring';

const id = z.string().min(1).max(200);
const nullableId = z.union([id, z.literal(''), z.null()])
  .transform(value => value === '' ? null : value);

const dateValue = z.string().refine(val => !isNaN(Date.parse(val)), {
  message: 'Invalid date format',
}).transform(val => new Date(val));

const nullableDate = z.union([dateValue, z.literal(''), z.null()])
  .transform(value => value === '' ? null : value);

const text = z.string().max(20000).nullable();
const shortText = z.string().max(254).nullable();
const nonEmpty = (value: object) => Object.keys(value).length > 0;

export const reviewPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  reviewDate: dateValue.optional(),
  description: text.optional(),
}).strict().refine(nonEmpty, 'No changes supplied.');

export const actionPatchSchema = z.object({
  description: z.string().trim().min(1).max(20000).optional(),
  ownerId: nullableId.optional(),
  dueDate: nullableDate.optional(),
  closedDate: nullableDate.optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']).optional(),
  notes: text.optional(),
}).strict().refine(nonEmpty, 'No changes supplied.');

export const actionCreateSchema = z.object({
  reviewId: id,
  controlDefId: nullableId.optional(),
  description: z.string().trim().min(1).max(20000),
  ownerId: nullableId.optional(),
  dueDate: nullableDate.optional(),
  notes: text.optional(),
}).strict();

export const assessmentPatchSchema = z.object({
  completionState: z.enum(COMPLETION_STATES).optional(),
  scope: text.optional(),
  controlOwner: shortText.optional(),
  assessor: shortText.optional(),
  findings: text.optional(),
  evidenceRefs: text.optional(),
  testDate: nullableDate.optional(),
  naApproval: text.optional(),
}).strict().refine(nonEmpty, 'No changes supplied.');

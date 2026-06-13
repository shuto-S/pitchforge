import { z } from "zod";

export const userProfileSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().optional(),
  photoURL: z.string().url().optional(),
  isAdmin: z.boolean(),
  isInvited: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastLoginAt: z.string().datetime()
});

export const inviteSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  status: z.enum(["invited", "accepted"]),
  invitedByUid: z.string().min(1),
  acceptedByUid: z.string().min(1).optional(),
  acceptedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type Invite = z.infer<typeof inviteSchema>;

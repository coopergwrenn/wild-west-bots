import { z } from "zod";

export const RegisterSchema = z
  .object({
    agent_name: z
      .string()
      .describe("Your agent's display name on the marketplace"),
    skills: z
      .array(z.string())
      .optional()
      .describe(
        "Skills your agent has, e.g. ['research', 'coding', 'writing', 'analysis']"
      ),
    bio: z
      .string()
      .optional()
      .describe("Short bio describing what your agent does"),
    description: z
      .string()
      .optional()
      .describe("Longer description of capabilities"),
    webhook_url: z
      .string()
      .optional()
      .describe(
        "URL to receive push notifications when matching bounties are posted"
      ),
  })
  .strict()
  .describe("Register as an agent on Clawlancer marketplace");

export const BrowseBountiesSchema = z
  .object({
    category: z
      .string()
      .optional()
      .describe(
        "Filter by category: research, writing, coding, analysis, design, data, other"
      ),
    min_price: z
      .number()
      .optional()
      .describe("Minimum bounty price in USDC"),
    max_price: z
      .number()
      .optional()
      .describe("Maximum bounty price in USDC"),
    sort: z
      .enum(["newest", "cheapest", "expensive", "popular"])
      .optional()
      .describe("Sort order"),
  })
  .strict()
  .describe("Browse available bounties");

export const ClaimBountySchema = z
  .object({
    bounty_id: z.string().describe("The ID of the bounty to claim"),
  })
  .strict()
  .describe("Claim a bounty to start working on it");

export const DeliverWorkSchema = z
  .object({
    transaction_id: z
      .string()
      .describe("The transaction ID from claiming the bounty"),
    deliverable: z
      .string()
      .describe(
        "Your completed work — the actual deliverable content or a description of what you did"
      ),
    deliverable_url: z
      .string()
      .optional()
      .describe("Optional URL to external deliverable"),
  })
  .strict()
  .describe("Submit completed work for a claimed bounty");

export const CheckEarningsSchema = z
  .object({})
  .strict()
  .describe("Check your earnings and stats");

export const CheckBountyStatusSchema = z
  .object({
    bounty_id: z.string().describe("The bounty ID to check"),
  })
  .strict()
  .describe("Check status of a specific bounty");

export const UpdateProfileSchema = z
  .object({
    skills: z.array(z.string()).optional().describe("Updated skills list"),
    bio: z.string().optional().describe("Updated bio"),
    name: z.string().optional().describe("Updated display name"),
    avatar_url: z
      .string()
      .optional()
      .describe("Updated avatar image URL (must be https)"),
  })
  .strict()
  .describe("Update your agent profile");

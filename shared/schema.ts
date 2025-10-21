import { z } from "zod";

export const testCaseRequestSchema = z.object({
  csv_mapping: z.string().min(1, "CSV content is required"),
  batch_number: z.string().min(1, "Batch number is required"),
  user_id: z.string().min(1, "User ID is required"),
});

export const testCaseSchema = z.object({
  TestCaseID: z.string(),
  TestDescription: z.string(),
  ExpectedOutput: z.string(),
  TestSteps: z.array(z.string()),
  PassFailCriteria: z.string(),
  TestCaseType: z.enum(["FUNCTIONAL", "REGRESSION", "EDGE"]),
  Subtype: z.enum(["POSITIVE", "NEGATIVE"]),
});

export const statisticalSummarySchema = z.object({
  MappingRows: z.number(),
  UniqueAttributes: z.number(),
  TestCaseTypeBreakdown: z.record(z.number()),
  SubtypeBreakdown: z.record(z.number()),
  TotalTestCases: z.number(),
});

export const testCaseResponseSchema = z.object({
  TestCases: z.array(testCaseSchema),
  StatisticalSummary: statisticalSummarySchema,
});

export type TestCaseRequest = z.infer<typeof testCaseRequestSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type StatisticalSummary = z.infer<typeof statisticalSummarySchema>;
export type TestCaseResponse = z.infer<typeof testCaseResponseSchema>;

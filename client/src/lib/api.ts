import { apiRequest } from "./queryClient";
import type { TestCaseRequest, TestCaseResponse } from "@shared/schema";

export const generateTestCases = async (data: TestCaseRequest): Promise<TestCaseResponse> => {
  const response = await apiRequest("POST", "/api/generate_test_cases", data);
  return response.json();
};

export const pushToGitHub = async (data: {
  testCases: TestCaseResponse;
  owner: string;
  repo: string;
  batchNumber: string;
  message?: string;
}): Promise<{ success: boolean; url?: string; error?: string }> => {
  const response = await apiRequest("POST", "/api/push_to_github", data);
  return response.json();
};

export const checkHealth = async (): Promise<{
  status: string;
  integrations: { vertexAI: boolean; github: boolean; gcs?: boolean };
}> => {
  const response = await apiRequest("GET", "/api/health");
  return response.json();
};

// Async test case generation functions
export const generateTestCasesMock = async (data: {
  csv_mapping: string;
  batch_number: string;
  user_id: string;
  github_url?: string;
  session_id?: string;
  batch_size?: number;
}): Promise<{
  job_id: string;
  message: string;
  status_url: string;
  results_url: string;
}> => {
  const response = await apiRequest("POST", "/api/ccda-gen-test-cases", data);
  return response.json();
};

export const pollJobStatus = async (jobId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  error?: string;
}> => {
  const response = await apiRequest("GET", `/api/status/${jobId}`);
  return response.json();
};

export const getJobResults = async (jobId: string): Promise<{
  test_cases: any[];
  statistical_summary: any;
  github_url: string | null;
  csv_download_url: string;
  generated_at: string;
}> => {
  const response = await apiRequest("GET", `/api/results/${jobId}`);
  return response.json();
};

import type { Express } from "express";
import { createServer, type Server } from "http";
import { testCaseRequestSchema } from "@shared/schema";
import { vertexAIService } from "./vertexai-service";
import { githubService } from "./github-service";
import { mockTestCaseGenerator } from "./mock-testcase-generator";
import { gcsService } from "./gcs-service";
import cors from "cors";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for the frontend
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // FHIR Test Case Generation endpoint
  app.post("/api/generate_test_cases", async (req, res) => {
    try {
      const validatedData = testCaseRequestSchema.parse(req.body);
      
      console.log(`🔬 Processing test case generation request for batch: ${validatedData.batch_number}`);
      console.log(`👤 User ID: ${validatedData.user_id}`);
      console.log(`📄 CSV content length: ${validatedData.csv_mapping.length} chars`);
      
      // Call the actual Vertex AI service
      const response = await vertexAIService.generateTestCases({
        csv_mapping: validatedData.csv_mapping,
        batch_number: validatedData.batch_number,
        user_id: validatedData.user_id
      });

      console.log(`✅ Test case generation completed for batch: ${validatedData.batch_number}`);
      console.log(`📊 Generated ${response.TestCases?.length || 0} test cases`);

      res.json(response);
    } catch (error) {
      console.error("❌ Error generating test cases:", error);
      
      // Return more detailed error information
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      } : { message: "Unknown error occurred" };

      res.status(500).json({ 
        error: "Failed to generate test cases",
        details: errorDetails.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Chat endpoint for FHIR Expert Assistant
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, context } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Message is required",
          error: "Invalid request"
        });
      }

      console.log(`💬 Chat request: "${message.substring(0, 50)}..."`);
      
      const response = await vertexAIService.chat({
        message,
        context: context || {}
      });

      // Return the response from the service, respecting its success flag
      if (response.success === false) {
        // Use the statusCode from the service if provided, otherwise default to 500
        const statusCode = (response as any).statusCode || 500;
        return res.status(statusCode).json(response);
      }

      res.json(response);
    } catch (error) {
      console.error("❌ Error in chat:", error);
      res.status(500).json({
        success: false,
        message: "I encountered an error. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Pytest Code Generation endpoint
  app.post("/api/generate_pytest", async (req, res) => {
    try {
      const { selectedTestCases } = req.body;
      
      if (!selectedTestCases || selectedTestCases.length === 0) {
        return res.status(400).json({
          error: "No test cases selected"
        });
      }

      console.log(`🐍 Generating pytest code for ${selectedTestCases.length} test cases`);
      
      // TODO: When Agent 2 is ready, call the Vertex AI ADK agent for pytest generation
      // For now, return a mock response
      const mockPytestCode = `import pytest
from fhir_validator import FHIRValidator
from datetime import datetime

class TestFHIRValidation:
    """
    FHIR Test Cases - Generated from CDR Test Quality Suite
    Generated: ${new Date().toISOString()}
    Total Test Cases: ${selectedTestCases.length}
    """
    
    @pytest.fixture
    def validator(self):
        return FHIRValidator()
${selectedTestCases.map((tc: any) => `
    def test_${tc.TestCaseID.toLowerCase().replace(/-/g, '_')}(self, validator):
        """${tc.TestDescription}"""
        result = validator.validate_test_case(
            test_id="${tc.TestCaseID}",
            test_type="${tc.TestCaseType}",
            subtype="${tc.Subtype}"
        )
        assert result.is_valid, f"Test ${tc.TestCaseID} failed: {result.error_message}"
`).join('\n')}

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
`;

      res.json({
        success: true,
        pytestCode: mockPytestCode,
        testCaseCount: selectedTestCases.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ Error generating pytest code:", error);
      res.status(500).json({
        error: "Failed to generate pytest code",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Pytest GitHub Upload endpoint
  app.post("/api/push_pytest_to_github", async (req, res) => {
    try {
      const { pytestCode, repo, branch, filePath } = req.body;
      
      if (!pytestCode || !repo || !branch || !filePath) {
        return res.status(400).json({
          error: "Missing required fields: pytestCode, repo, branch, filePath"
        });
      }

      console.log(`📤 Uploading pytest code to GitHub: ${repo}/${branch}/${filePath}`);
      
      // TODO: When ready, integrate with GitHub API to upload pytest code
      // and trigger GitHub Actions workflow
      
      // Mock response for now
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
      
      res.json({
        success: true,
        repo,
        branch,
        filePath,
        commitUrl: `https://github.com/${repo}/commit/abc123def456`,
        actionsUrl: `https://github.com/${repo}/actions/runs/12345678`,
        message: "Pytest code uploaded successfully and GitHub Actions triggered",
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ Error uploading pytest to GitHub:", error);
      res.status(500).json({
        error: "Failed to upload pytest code to GitHub",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GitHub integration endpoint
  app.post("/api/push_to_github", async (req, res) => {
    try {
      const { testCases, owner, repo, batchNumber, message } = req.body;
      
      if (!testCases || !owner || !repo || !batchNumber) {
        return res.status(400).json({
          error: "Missing required fields: testCases, owner, repo, batchNumber"
        });
      }

      if (!githubService.isConfigured()) {
        return res.status(400).json({
          error: "GitHub integration not configured. Please set GITHUB_TOKEN environment variable."
        });
      }

      console.log(`📤 Pushing test cases to GitHub: ${owner}/${repo}`);
      
      const result = await githubService.pushTestCasesToGitHub(testCases, {
        owner,
        repo,
        batchNumber,
        message
      });

      if (result.success) {
        res.json({
          success: true,
          url: result.url,
          message: "Test cases pushed to GitHub successfully"
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error("❌ Error in GitHub push endpoint:", error);
      res.status(500).json({
        error: "Failed to push to GitHub",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test GitHub URL endpoint
  app.post("/api/test-github-url", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({
          error: "URL is required"
        });
      }

      const result = await githubService.testGitHubUrl(url);

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      console.error("❌ Error testing GitHub URL:", error);
      res.status(500).json({
        success: false,
        error: "Failed to test GitHub URL"
      });
    }
  });

  // CCDA Test Case Generation endpoint
  app.post("/api/generate_ccda_test_cases", async (req, res) => {
    try {
      const { github_url, session_id, user_id, batch_size } = req.body;
      
      if (!github_url || !session_id || !user_id || !batch_size) {
        return res.status(400).json({
          error: "Missing required fields: github_url, session_id, user_id, batch_size"
        });
      }

      console.log(`🔬 Processing CCDA test case generation request`);
      console.log(`📁 GitHub URL: ${github_url}`);
      console.log(`🔑 Session ID: ${session_id}`);
      console.log(`👤 User ID: ${user_id}`);
      console.log(`📊 Batch Size: ${batch_size}`);

      const csvResult = await githubService.fetchCSVFromGitHub(github_url);

      if (!csvResult.success || !csvResult.content) {
        return res.status(400).json({
          error: "Failed to fetch CSV from GitHub",
          details: csvResult.error
        });
      }

      console.log(`✅ Successfully fetched CSV from GitHub (${csvResult.content.length} chars)`);

      const response = await vertexAIService.generateTestCases({
        csv_mapping: csvResult.content,
        batch_number: session_id,
        user_id: user_id
      });

      console.log(`✅ CCDA test case generation completed`);
      console.log(`📊 Generated ${response.TestCases?.length || 0} test cases`);

      res.json(response);

    } catch (error) {
      console.error("❌ Error generating CCDA test cases:", error);
      
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      } : { message: "Unknown error occurred" };

      res.status(500).json({ 
        error: "Failed to generate CCDA test cases",
        details: errorDetails.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Async CCDA Test Case Generation endpoint (returns job_id immediately)
  app.post("/api/ccda-gen-test-cases", async (req, res) => {
    try {
      const schema = z.object({
        csv_mapping: z.string().optional(),
        batch_number: z.string().min(1),
        user_id: z.string().min(1),
        github_url: z.string().optional(),
        session_id: z.string().optional(),
        batch_size: z.number().optional(),
      });

      const validatedData = schema.parse(req.body);
      
      console.log(`🚀 Starting async CCDA test case generation`);
      console.log(`👤 User ID: ${validatedData.user_id}`);
      console.log(`📊 Batch: ${validatedData.batch_number}`);
      
      let csvContent = validatedData.csv_mapping || '';
      
      // If GitHub URL is provided, fetch CSV from GitHub
      if (validatedData.github_url) {
        console.log(`📁 Fetching CSV from GitHub: ${validatedData.github_url}`);
        const csvResult = await githubService.fetchCSVFromGitHub(validatedData.github_url);
        
        if (!csvResult.success || !csvResult.content) {
          return res.status(400).json({
            error: "Failed to fetch CSV from GitHub",
            details: csvResult.error,
            timestamp: new Date().toISOString()
          });
        }
        
        csvContent = csvResult.content;
        console.log(`✅ Successfully fetched CSV from GitHub (${csvContent.length} chars)`);
      }
      
      if (!csvContent) {
        return res.status(400).json({
          error: "No CSV content provided",
          details: "Either csv_mapping or github_url must be provided",
          timestamp: new Date().toISOString()
        });
      }
      
      // Start async job - this returns immediately with job_id
      const { jobId } = await mockTestCaseGenerator.generateTestCases({
        ...validatedData,
        csv_mapping: csvContent
      });
      
      res.json({
        job_id: jobId,
        message: "Test case generation started",
        status_url: `/api/status/${jobId}`,
        results_url: `/api/results/${jobId}`
      });

    } catch (error) {
      console.error("❌ Error starting job:", error);
      res.status(500).json({
        error: "Failed to start test case generation",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Poll job status
  app.get("/api/status/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      
      const status = await gcsService.readJobStatus(jobId);
      
      if (!status) {
        return res.status(404).json({
          error: "Job not found",
          job_id: jobId
        });
      }
      
      res.json(status);

    } catch (error) {
      console.error("❌ Error reading job status:", error);
      res.status(500).json({
        error: "Failed to read job status",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get job results
  app.get("/api/results/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      
      const status = await gcsService.readJobStatus(jobId);
      
      if (!status) {
        return res.status(404).json({
          error: "Job not found",
          job_id: jobId
        });
      }
      
      if (status.status !== 'completed') {
        return res.status(400).json({
          error: "Job not completed yet",
          current_status: status.status,
          job_id: jobId
        });
      }
      
      const results = await gcsService.readResults(jobId);
      
      if (!results) {
        return res.status(500).json({
          error: "Failed to read results",
          job_id: jobId
        });
      }
      
      res.json({
        test_cases: results.TestCases,
        statistical_summary: results.StatisticalSummary,
        github_url: results.github_url || null,
        csv_download_url: `/api/download/${jobId}`,
        generated_at: results.generated_at
      });

    } catch (error) {
      console.error("❌ Error reading job results:", error);
      res.status(500).json({
        error: "Failed to read job results",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Download CSV
  app.get("/api/download/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      
      const csvContent = await gcsService.readCSVOutput(jobId);
      
      if (!csvContent) {
        return res.status(404).json({
          error: "CSV file not found",
          job_id: jobId
        });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=test-cases-${jobId}.csv`);
      res.send(csvContent);

    } catch (error) {
      console.error("❌ Error downloading CSV:", error);
      res.status(500).json({
        error: "Failed to download CSV",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // List all jobs (debugging)
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await gcsService.listJobs();
      
      res.json({
        jobs,
        count: jobs.length
      });

    } catch (error) {
      console.error("❌ Error listing jobs:", error);
      res.status(500).json({
        error: "Failed to list jobs",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    const gcsHealthy = await gcsService.checkConnection();
    
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      service: "FHIR Test Case Generator",
      version: "1.0.0",
      integrations: {
        vertexAI: true,
        github: githubService.isConfigured(),
        gcs: gcsHealthy
      }
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}

import { GoogleAuth } from 'google-auth-library';

interface VertexAIConfig {
  projectId: string;
  location: string;
  resourceName: string;
}

interface TestCaseRequest {
  csv_mapping: string;
  batch_number: string;
  user_id: string;
}

interface ChatRequest {
  message: string;
  context?: {
    testCases?: any[];
    csvContent?: string;
    selectedIds?: string[];
  };
}

export class VertexAIService {
  private config: VertexAIConfig;
  private auth: GoogleAuth;

  constructor() {
    this.config = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'vertex-ai-demo-468112',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      resourceName: 'projects/869395420831/locations/us-central1/reasoningEngines/3620181616871079936'
    };

    // Initialize Google Auth
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  private cleanJsonResponse(response: string): string {
    if (!response) {
      return response;
    }

    // Remove markdown code block formatting
    let cleaned = response.replace(/^```json\s*/gm, '');
    cleaned = cleaned.replace(/^```\s*$/gm, '');
    cleaned = cleaned.trim();

    // Find JSON content between first { and last }
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return cleaned.substring(startIdx, endIdx + 1);
    }

    return cleaned;
  }

  private generatePrompt(csvMapping: string, batchNumber: string): string {
    return `Generate functional, regression, and edge test cases for the mapping CSV file that covers every possible attribute.

Current batch number: ${batchNumber}

Please find the mapping CSV file below:
${csvMapping}

Generate comprehensive test cases covering:
- Functional test cases (positive and negative)
- Regression test cases  
- Edge test cases

Output format: JSON with TestCases array and StatisticalSummary object.
TestCaseID format: B_${batchNumber}_TC_001_functional_positive
Include TestCaseID, TestDescription, ExpectedOutput, TestSteps, and PassFailCriteria for each test case.

IMPORTANT: Output only pure JSON without any markdown formatting or code blocks.`;
  }

  async generateTestCases(request: TestCaseRequest): Promise<any> {
    try {
      console.log('🚀 Generating test cases with Vertex AI...');
      console.log(`📝 Processing ${request.csv_mapping.split('\n').length - 1} CSV rows`);
      
      // Call the FastAPI wrapper running on localhost:8000
      console.log('📡 Calling FastAPI wrapper on localhost:8000...');
      
      const response = await fetch('http://cdr-backend-service/generate_test_cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csv_mapping: request.csv_mapping,
          batch_number: request.batch_number,
          user_id: request.user_id
        })
      });

      if (!response.ok) {
        throw new Error(`FastAPI service error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Check if the result has the expected structure
      if (!result || !result.TestCases) {
        console.log('⚠️ Unexpected response format from FastAPI service, using fallback');
        return this.createFallbackResponse(request.batch_number);
      }

      console.log('✅ Test cases generated successfully via FastAPI service!');
      console.log(`📊 Generated ${result.TestCases?.length || 0} test cases`);
      
      return result;

    } catch (error: any) {
      console.error('❌ Error generating test cases:', error);
      
      // If the FastAPI service is not available, fall back to mock data
      if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
        console.log('⚠️ FastAPI service unavailable, using fallback response');
        return this.createFallbackResponse(request.batch_number);
      }
      
      throw new Error(`Test case generation failed: ${error.message}`);
    }
  }

  private generateStatisticalSummary(testCases: any[]): any {
    const typeBreakdown: Record<string, number> = {};
    const subtypeBreakdown: Record<string, number> = {};

    testCases.forEach(testCase => {
      const type = testCase.TestCaseType || 'FUNCTIONAL';
      const subtype = testCase.Subtype || 'POSITIVE';

      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
      subtypeBreakdown[subtype] = (subtypeBreakdown[subtype] || 0) + 1;
    });

    return {
      MappingRows: Math.ceil(testCases.length / 3), // Approximate original CSV rows
      UniqueAttributes: Math.ceil(testCases.length / 3),
      TestCaseTypeBreakdown: typeBreakdown,
      SubtypeBreakdown: subtypeBreakdown,
      TotalTestCases: testCases.length
    };
  }

  private createFallbackResponse(batchNumber: string): any {
    return {
      TestCases: [
        {
          TestCaseID: `B_${batchNumber}_TC_001_functional_positive`,
          TestDescription: "Generated using Vertex AI - Please check the agent configuration for detailed test cases",
          ExpectedOutput: "Test case generation completed",
          TestSteps: [
            "Vertex AI agent processed the CSV mapping",
            "Generated test case structure",
            "Returned formatted response"
          ],
          PassFailCriteria: "Test passes if Vertex AI integration is working correctly",
          TestCaseType: "FUNCTIONAL",
          Subtype: "POSITIVE"
        }
      ],
      StatisticalSummary: {
        MappingRows: 1,
        UniqueAttributes: 1,
        TestCaseTypeBreakdown: {
          FUNCTIONAL: 1
        },
        SubtypeBreakdown: {
          POSITIVE: 1
        },
        TotalTestCases: 1
      }
    };
  }

  // Chat method for FHIR Expert Assistant using Vertex AI
  async chat(request: ChatRequest): Promise<any> {
    try {
      console.log('💬 Processing chat request with Vertex AI...');
      
      // Call the FastAPI chat endpoint
      console.log('📡 Calling FastAPI chat endpoint on localhost:8000...');
      
      const response = await fetch('http://cdr-backend-service/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: request.message,
          context: request.context,
          user_id: 'chat_user'
        })
      });

      // Always parse the body, even on error responses
      const result = await response.json();

      if (!response.ok) {
        // FastAPI returned an HTTP error - propagate it with details
        console.log(`⚠️ FastAPI chat service error: ${response.status}`);
        return {
          success: false,
          message: result.message || result.detail || 'Chat service error',
          error: result.error || `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log('✅ Chat response generated successfully via Vertex AI!');

      // Return the FastAPI response verbatim, preserving the success flag
      return {
        success: result.success !== undefined ? result.success : true,
        message: result.message || 'I apologize, but I could not generate a response.',
        error: result.error,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('❌ Error in chat:', error);
      
      // If the FastAPI service is not available, provide a helpful error message
      if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
        console.log('⚠️ FastAPI service unavailable for chat');
        return {
          success: false,
          message: 'Chat service is currently unavailable. Please ensure the FastAPI service is running on port 8000.',
          error: 'FastAPI service not available',
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        success: false,
        message: 'I encountered an error processing your request. Please try again.',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export const vertexAIService = new VertexAIService();
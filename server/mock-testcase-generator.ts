import { v4 as uuidv4 } from 'uuid';
import { gcsService, TestCase, MetadataParams } from './gcs-service';

export interface TestCaseRequest {
  csv_mapping: string;
  batch_number: string;
  user_id: string;
  github_url?: string;
  session_id?: string;
  batch_size?: number;
}

export interface TestCaseResponse {
  TestCases: TestCase[];
  StatisticalSummary: {
    TotalTestCases: number;
    TestCaseTypeBreakdown: Record<string, number>;
    SubtypeBreakdown: Record<string, number>;
    MappingRows: number;
    UniqueAttributes: number;
  };
  github_url?: string;
  generated_at: string;
}

interface CSVRow {
  Source_Field?: string;
  Target_FHIR_Resource?: string;
  FHIR_Attribute?: string;
  Transformation_Rule?: string;
  Data_Type?: string;
  Required?: string;
}

export class MockTestCaseGenerator {
  private parseCSV(csvContent: string): CSVRow[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length === 0) {
      return [];
    }

    const headers = this.parseCSVLine(lines[0]);
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row: CSVRow = {};
      
      headers.forEach((header, index) => {
        if (values[index]) {
          row[header as keyof CSVRow] = values[index];
        }
      });
      
      rows.push(row);
    }

    return rows.filter(row => Object.keys(row).length > 0);
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private generateTestCasesFromCSV(csvRows: CSVRow[], batchNumber: string): TestCase[] {
    const testCases: TestCase[] = [];
    let counter = 1;

    csvRows.forEach((row, index) => {
      const sourceField = row.Source_Field || `Field_${index + 1}`;
      const targetResource = row.Target_FHIR_Resource || 'Resource';
      const fhirAttribute = row.FHIR_Attribute || 'attribute';
      const transformRule = row.Transformation_Rule || 'Direct mapping';
      const dataType = row.Data_Type || 'string';
      const isRequired = row.Required?.toLowerCase() === 'yes' || row.Required?.toLowerCase() === 'true';

      // Functional Positive Test
      testCases.push({
        TestCaseID: `B_${batchNumber}_TC_${String(counter++).padStart(3, '0')}_functional_positive`,
        TestDescription: `Validate successful mapping of ${sourceField} to ${targetResource}.${fhirAttribute}`,
        TestSteps: `1. Parse input data containing ${sourceField}\n2. Extract ${sourceField} value\n3. Apply transformation: ${transformRule}\n4. Map to FHIR ${targetResource}.${fhirAttribute}\n5. Validate FHIR resource structure`,
        ExpectedResults: `FHIR ${targetResource} resource created successfully with ${fhirAttribute} populated correctly as ${dataType}`,
        TestCaseType: 'FUNCTIONAL',
        Subtype: 'POSITIVE',
      });

      // Functional Negative Test
      testCases.push({
        TestCaseID: `B_${batchNumber}_TC_${String(counter++).padStart(3, '0')}_functional_negative`,
        TestDescription: `Validate error handling for invalid ${sourceField} data`,
        TestSteps: `1. Parse input with invalid ${dataType} for ${sourceField}\n2. Attempt transformation: ${transformRule}\n3. Validation fails for ${targetResource}.${fhirAttribute}\n4. System logs error with field name and value\n5. Return validation error response`,
        ExpectedResults: `System returns validation error indicating invalid ${dataType} for ${targetResource}.${fhirAttribute}`,
        TestCaseType: 'FUNCTIONAL',
        Subtype: 'NEGATIVE',
      });

      // Edge Case Test - based on Required field
      if (isRequired) {
        testCases.push({
          TestCaseID: `B_${batchNumber}_TC_${String(counter++).padStart(3, '0')}_edge_case`,
          TestDescription: `Handle missing required field ${sourceField}`,
          TestSteps: `1. Parse input with missing ${sourceField}\n2. Validate required field check\n3. System detects missing ${targetResource}.${fhirAttribute}\n4. Log validation error\n5. Return appropriate error response`,
          ExpectedResults: `System returns error indicating required field ${sourceField} is missing from ${targetResource}`,
          TestCaseType: 'EDGE',
          Subtype: 'NEGATIVE',
        });
      } else {
        testCases.push({
          TestCaseID: `B_${batchNumber}_TC_${String(counter++).padStart(3, '0')}_edge_case`,
          TestDescription: `Handle optional field ${sourceField} when empty`,
          TestSteps: `1. Parse input with empty ${sourceField}\n2. Check if field is optional\n3. Skip mapping for ${targetResource}.${fhirAttribute}\n4. Proceed with other mappings\n5. Create FHIR resource without this attribute`,
          ExpectedResults: `FHIR ${targetResource} resource created successfully with ${fhirAttribute} omitted (optional field)`,
          TestCaseType: 'EDGE',
          Subtype: 'POSITIVE',
        });
      }

      // Regression Test (every 3rd field)
      if ((index + 1) % 3 === 0) {
        testCases.push({
          TestCaseID: `B_${batchNumber}_TC_${String(counter++).padStart(3, '0')}_regression_positive`,
          TestDescription: `Verify mapping consistency for ${sourceField} after system updates`,
          TestSteps: `1. Establish baseline mapping for ${sourceField}\n2. Apply system update/patch\n3. Re-test ${sourceField} to ${targetResource}.${fhirAttribute} mapping\n4. Compare results with baseline\n5. Validate no regression in mapping logic`,
          ExpectedResults: `${sourceField} to ${targetResource}.${fhirAttribute} mapping produces identical results to baseline; no regression detected`,
          TestCaseType: 'REGRESSION',
          Subtype: 'POSITIVE',
        });
      }
    });

    return testCases;
  }

  private calculateStatistics(testCases: TestCase[], csvRows: CSVRow[]): TestCaseResponse['StatisticalSummary'] {
    const typeBreakdown: Record<string, number> = {};
    const subtypeBreakdown: Record<string, number> = {};

    testCases.forEach(tc => {
      typeBreakdown[tc.TestCaseType] = (typeBreakdown[tc.TestCaseType] || 0) + 1;
      subtypeBreakdown[tc.Subtype] = (subtypeBreakdown[tc.Subtype] || 0) + 1;
    });

    const uniqueAttrs = new Set(csvRows.map(row => row.FHIR_Attribute).filter(Boolean));

    return {
      TotalTestCases: testCases.length,
      TestCaseTypeBreakdown: typeBreakdown,
      SubtypeBreakdown: subtypeBreakdown,
      MappingRows: csvRows.length,
      UniqueAttributes: uniqueAttrs.size,
    };
  }

  async generateTestCases(request: TestCaseRequest): Promise<{
    jobId: string;
    response: TestCaseResponse;
  }> {
    const jobId = uuidv4();
    
    try {
      console.log(`\n🚀 Starting test case generation for job ${jobId}`);
      
      // Step 1: Write initial status
      await gcsService.writeJobStatus(jobId, 'pending');
      
      // Step 2: Write input CSV
      await gcsService.writeCSVContent(jobId, request.csv_mapping);
      
      // Step 3: Write metadata
      const metadata: MetadataParams = {
        batch_number: request.batch_number,
        user_id: request.user_id,
        csv_length: request.csv_mapping.length,
        github_url: request.github_url,
        session_id: request.session_id,
        batch_size: request.batch_size,
      };
      await gcsService.writeMetadata(jobId, metadata);
      
      // Step 4: Start background processing (non-blocking)
      setImmediate(async () => {
        try {
          // Update status to processing
          await gcsService.writeJobStatus(jobId, 'processing');
          
          // Parse CSV and generate test cases (simulate delay)
          console.log(`⏳ Processing CSV and generating test cases for job ${jobId}...`);
          await this.delay(2500); // 2.5 second delay to simulate processing
          
          const csvRows = this.parseCSV(request.csv_mapping);
          console.log(`📊 Parsed ${csvRows.length} rows from CSV`);
          
          const testCases = this.generateTestCasesFromCSV(csvRows, request.batch_number);
          console.log(`✨ Generated ${testCases.length} test cases`);
          
          const response: TestCaseResponse = {
            TestCases: testCases,
            StatisticalSummary: this.calculateStatistics(testCases, csvRows),
            github_url: request.github_url,
            generated_at: new Date().toISOString(),
          };
          
          // Write results
          await gcsService.writeResults(jobId, response);
          
          // Generate and write CSV output
          const csvOutput = gcsService.generateCSV(testCases);
          await gcsService.writeCSVOutput(jobId, csvOutput);
          
          // Update status to completed
          await gcsService.writeJobStatus(jobId, 'completed');
          
          console.log(`✅ Job ${jobId} completed successfully\n`);
        } catch (error) {
          console.error(`❌ Job ${jobId} failed during processing:`, error);
          await gcsService.writeJobStatus(jobId, 'failed', error instanceof Error ? error.message : 'Unknown error');
        }
      });
      
      // Return immediately with job ID (async processing continues in background)
      return { 
        jobId, 
        response: {} as TestCaseResponse // Empty response since processing is async
      };
    } catch (error) {
      console.error(`❌ Job ${jobId} failed to start:`, error);
      await gcsService.writeJobStatus(jobId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const mockTestCaseGenerator = new MockTestCaseGenerator();

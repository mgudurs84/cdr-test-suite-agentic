import { Storage } from '@google-cloud/storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';

export interface StatusData {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface MetadataParams {
  batch_number?: string;
  user_id?: string;
  csv_length?: number;
  github_url?: string;
  session_id?: string;
  batch_size?: number;
}

export interface TestCase {
  TestCaseID: string;
  TestDescription: string;
  TestSteps: string;
  ExpectedResults: string;
  TestCaseType: string;
  Subtype: string;
}

export class GCSService {
  private useRealGCS: boolean = false;
  private storage?: Storage;
  private bucketName: string;
  private mockBasePath: string = '/tmp/gcs-mock';

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME || 'test-cases-bucket';
    
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        this.storage = new Storage({
          projectId: process.env.GCP_PROJECT_ID,
        });
        this.useRealGCS = true;
        console.log('✅ GCS Service: Using real Google Cloud Storage');
      } else {
        console.log('⚠️  GCS Service: Using local file-based mock storage at', this.mockBasePath);
      }
    } catch (error) {
      console.log('⚠️  GCS Service: Failed to initialize GCS, using local mock', error);
      this.useRealGCS = false;
    }
  }

  private getJobPath(jobId: string): string {
    return path.join(this.mockBasePath, 'jobs', jobId);
  }

  private async ensureJobDirectory(jobId: string): Promise<void> {
    if (!this.useRealGCS) {
      const jobPath = this.getJobPath(jobId);
      await fs.mkdir(jobPath, { recursive: true });
    }
  }

  async readJobStatus(jobId: string): Promise<StatusData | null> {
    try {
      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/status.json`);
        const [exists] = await file.exists();
        
        if (!exists) {
          return null;
        }
        
        const [content] = await file.download();
        return JSON.parse(content.toString());
      } else {
        const filePath = path.join(this.getJobPath(jobId), 'status.json');
        
        if (!existsSync(filePath)) {
          return null;
        }
        
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('❌ Error reading job status:', error);
      return null;
    }
  }

  async writeJobStatus(jobId: string, status: string, error?: string): Promise<boolean> {
    try {
      await this.ensureJobDirectory(jobId);
      
      const existingStatus = await this.readJobStatus(jobId);
      const created_at = existingStatus?.created_at || new Date().toISOString();
      
      const statusData: StatusData = {
        status: status as StatusData['status'],
        created_at,
        updated_at: new Date().toISOString(),
        ...(error && { error }),
      };

      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/status.json`);
        
        await file.save(JSON.stringify(statusData, null, 2), {
          contentType: 'application/json',
          metadata: {
            cacheControl: 'no-cache',
          },
        });
        
        console.log(`✅ Wrote status to GCS: jobs/${jobId}/status.json - ${status}`);
      } else {
        // Atomic write: write to temp file and rename
        const filePath = path.join(this.getJobPath(jobId), 'status.json');
        const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;
        
        await fs.writeFile(tempPath, JSON.stringify(statusData, null, 2));
        await fs.rename(tempPath, filePath);
        
        console.log(`✅ Wrote status to local mock: ${filePath} - ${status}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error writing job status:', error);
      return false;
    }
  }

  async readCSVContent(jobId: string): Promise<string | null> {
    try {
      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/input.csv`);
        const [exists] = await file.exists();
        
        if (!exists) {
          return null;
        }
        
        const [content] = await file.download();
        return content.toString();
      } else {
        const filePath = path.join(this.getJobPath(jobId), 'input.csv');
        
        if (!existsSync(filePath)) {
          return null;
        }
        
        return await fs.readFile(filePath, 'utf-8');
      }
    } catch (error) {
      console.error('❌ Error reading CSV content:', error);
      return null;
    }
  }

  async writeCSVContent(jobId: string, csvContent: string): Promise<boolean> {
    try {
      await this.ensureJobDirectory(jobId);

      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/input.csv`);
        
        await file.save(csvContent, {
          contentType: 'text/csv',
          metadata: {
            cacheControl: 'no-cache',
          },
        });
        
        console.log(`✅ Wrote CSV to GCS: jobs/${jobId}/input.csv`);
      } else {
        // Atomic write: write to temp file and rename
        const filePath = path.join(this.getJobPath(jobId), 'input.csv');
        const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;
        
        await fs.writeFile(tempPath, csvContent);
        await fs.rename(tempPath, filePath);
        
        console.log(`✅ Wrote CSV to local mock: ${filePath}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error writing CSV content:', error);
      return false;
    }
  }

  async writeMetadata(jobId: string, params: MetadataParams): Promise<boolean> {
    try {
      await this.ensureJobDirectory(jobId);
      
      const metadata = {
        params,
        created_at: new Date().toISOString(),
      };

      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/metadata.json`);
        
        await file.save(JSON.stringify(metadata, null, 2), {
          contentType: 'application/json',
          metadata: {
            cacheControl: 'no-cache',
          },
        });
        
        console.log(`✅ Wrote metadata to GCS: jobs/${jobId}/metadata.json`);
      } else {
        // Atomic write: write to temp file and rename
        const filePath = path.join(this.getJobPath(jobId), 'metadata.json');
        const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;
        
        await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2));
        await fs.rename(tempPath, filePath);
        
        console.log(`✅ Wrote metadata to local mock: ${filePath}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error writing metadata:', error);
      return false;
    }
  }

  async writeResults(jobId: string, results: any): Promise<boolean> {
    try {
      await this.ensureJobDirectory(jobId);

      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/results.json`);
        
        await file.save(JSON.stringify(results, null, 2), {
          contentType: 'application/json',
          metadata: {
            cacheControl: 'no-cache',
          },
        });
        
        console.log(`✅ Wrote results to GCS: jobs/${jobId}/results.json`);
      } else {
        // Atomic write: write to temp file and rename
        const filePath = path.join(this.getJobPath(jobId), 'results.json');
        const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;
        
        await fs.writeFile(tempPath, JSON.stringify(results, null, 2));
        await fs.rename(tempPath, filePath);
        
        console.log(`✅ Wrote results to local mock: ${filePath}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error writing results:', error);
      return false;
    }
  }

  async readResults(jobId: string): Promise<any | null> {
    try {
      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/results.json`);
        const [exists] = await file.exists();
        
        if (!exists) {
          return null;
        }
        
        const [content] = await file.download();
        return JSON.parse(content.toString());
      } else {
        const filePath = path.join(this.getJobPath(jobId), 'results.json');
        
        if (!existsSync(filePath)) {
          return null;
        }
        
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('❌ Error reading results:', error);
      return null;
    }
  }

  async writeCSVOutput(jobId: string, csvContent: string): Promise<boolean> {
    try {
      await this.ensureJobDirectory(jobId);

      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/output.csv`);
        
        await file.save(csvContent, {
          contentType: 'text/csv',
          metadata: {
            cacheControl: 'no-cache',
          },
        });
        
        console.log(`✅ Wrote CSV output to GCS: jobs/${jobId}/output.csv`);
      } else {
        // Atomic write: write to temp file and rename
        const filePath = path.join(this.getJobPath(jobId), 'output.csv');
        const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;
        
        await fs.writeFile(tempPath, csvContent);
        await fs.rename(tempPath, filePath);
        
        console.log(`✅ Wrote CSV output to local mock: ${filePath}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error writing CSV output:', error);
      return false;
    }
  }

  async readCSVOutput(jobId: string): Promise<string | null> {
    try {
      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(`jobs/${jobId}/output.csv`);
        const [exists] = await file.exists();
        
        if (!exists) {
          return null;
        }
        
        const [content] = await file.download();
        return content.toString();
      } else {
        const filePath = path.join(this.getJobPath(jobId), 'output.csv');
        
        if (!existsSync(filePath)) {
          return null;
        }
        
        return await fs.readFile(filePath, 'utf-8');
      }
    } catch (error) {
      console.error('❌ Error reading CSV output:', error);
      return null;
    }
  }

  generateCSV(testCases: TestCase[]): string {
    const headers = ['TestCaseID', 'TestDescription', 'TestSteps', 'ExpectedResults', 'TestCaseType', 'Subtype'];
    const rows = testCases.map(tc => [
      this.escapeCSV(tc.TestCaseID),
      this.escapeCSV(tc.TestDescription),
      this.escapeCSV(tc.TestSteps),
      this.escapeCSV(tc.ExpectedResults),
      this.escapeCSV(tc.TestCaseType),
      this.escapeCSV(tc.Subtype),
    ]);
    
    const csvLines = [headers.join(','), ...rows.map(row => row.join(','))];
    return csvLines.join('\n');
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  async checkConnection(): Promise<boolean> {
    try {
      if (this.useRealGCS && this.storage) {
        await this.storage.bucket(this.bucketName).exists();
        console.log('✅ GCS connection check passed');
        return true;
      } else {
        await fs.mkdir(this.mockBasePath, { recursive: true });
        console.log('✅ Local mock storage check passed');
        return true;
      }
    } catch (error) {
      console.error('❌ GCS connection check failed:', error);
      return false;
    }
  }

  async listJobs(): Promise<string[]> {
    try {
      if (this.useRealGCS && this.storage) {
        const bucket = this.storage.bucket(this.bucketName);
        const [files] = await bucket.getFiles({ prefix: 'jobs/' });
        
        const jobIds = new Set<string>();
        files.forEach(file => {
          const match = file.name.match(/^jobs\/([^/]+)\//);
          if (match) {
            jobIds.add(match[1]);
          }
        });
        
        return Array.from(jobIds);
      } else {
        const jobsPath = path.join(this.mockBasePath, 'jobs');
        
        if (!existsSync(jobsPath)) {
          return [];
        }
        
        const entries = await fs.readdir(jobsPath, { withFileTypes: true });
        return entries.filter(e => e.isDirectory()).map(e => e.name);
      }
    } catch (error) {
      console.error('❌ Error listing jobs:', error);
      return [];
    }
  }
}

export const gcsService = new GCSService();

import {
  Container,
  Typography,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Paper,
  Backdrop,
  CircularProgress,
  Snackbar,
  Alert,
  Card,
  CardContent,
  Grid,
  Button,
} from '@mui/material';
import { LightMode, DarkMode, HealthAndSafety, Analytics, Security, ArrowBack } from '@mui/icons-material';
import cvsLogo from '@assets/generated_images/CVS_Health_professional_logo_21ee5ea9.png';
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { FileUpload } from '@/components/FileUpload';
import { GenerationForm } from '@/components/GenerationForm';
import { FormatSelector } from '@/components/FormatSelector';
import { CCDAConfigForm } from '@/components/CCDAConfigForm';
import { useTheme } from '@/components/ThemeProvider';
import { generateTestCases, generateTestCasesMock, pollJobStatus, getJobResults } from '@/lib/api';

type WorkflowType = 'selector' | 'hl7' | 'ccda';

export default function Home() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const [workflow, setWorkflow] = useState<WorkflowType>('selector');
  const [csvContent, setCsvContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ccdaLoading, setCcdaLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<string>('idle');
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning';
  }>({ open: false, message: '', severity: 'success' });

  const mutation = useMutation({
    mutationFn: generateTestCases,
    onSuccess: (data) => {
      sessionStorage.setItem('fhir-test-results', JSON.stringify(data));
      setLocation('/results');
      setSnackbar({
        open: true,
        message: 'Test cases generated successfully!',
        severity: 'success',
      });
    },
    onError: (error) => {
      console.error('Error generating test cases:', error);
      setSnackbar({
        open: true,
        message: 'Failed to generate test cases. Please try again.',
        severity: 'error',
      });
    },
  });

  const handleGenerateTestCases = ({ batchNumber, userId }: { batchNumber: string; userId: string }) => {
    mutation.mutate({
      csv_mapping: csvContent,
      batch_number: batchNumber,
      user_id: userId,
    });
  };

  const handleCCDASubmit = async (data: { githubUrl: string; sessionId: string; userId: string; batchSize: string }) => {
    setCcdaLoading(true);
    setPollingStatus('starting');
    try {
      // Start async job - backend will fetch CSV from GitHub
      const jobResponse = await generateTestCasesMock({
        batch_number: data.sessionId,
        user_id: data.userId,
        github_url: data.githubUrl,
        session_id: data.sessionId,
        batch_size: parseInt(data.batchSize, 10),
        csv_mapping: '', // Backend will fetch from GitHub URL
      });

      setJobId(jobResponse.job_id);
      setSnackbar({
        open: true,
        message: 'Job started! Fetching CSV and generating test cases...',
        severity: 'info',
      });

    } catch (error) {
      console.error('Error starting CCDA job:', error);
      setCcdaLoading(false);
      setPollingStatus('idle');
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to start test case generation. Please try again.',
        severity: 'error',
      });
    }
  };

  const handleBackToSelector = () => {
    setWorkflow('selector');
    setCsvContent('');
    setSelectedFile(null);
  };

  // Polling effect for async job status
  useEffect(() => {
    if (!jobId) return;

    let isCancelled = false;

    const pollStatus = async () => {
      try {
        const statusData = await pollJobStatus(jobId);
        
        if (isCancelled) return;
        
        setPollingStatus(statusData.status);
        
        if (statusData.status === 'completed') {
          // Fetch results
          const results = await getJobResults(jobId);
          
          if (isCancelled) return;
          
          // Transform results to match the expected format
          const transformedResults = {
            TestCases: results.test_cases,
            StatisticalSummary: results.statistical_summary,
            github_url: results.github_url,
            generated_at: results.generated_at
          };
          
          sessionStorage.setItem('fhir-test-results', JSON.stringify(transformedResults));
          setCcdaLoading(false);
          setPollingStatus('idle');
          setJobId(null);
          setLocation('/results');
          
          setSnackbar({
            open: true,
            message: 'Test cases generated successfully!',
            severity: 'success',
          });
        } else if (statusData.status === 'failed') {
          setCcdaLoading(false);
          setPollingStatus('idle');
          setJobId(null);
          setSnackbar({
            open: true,
            message: `Job failed: ${statusData.error || 'Unknown error'}`,
            severity: 'error',
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (!isCancelled) {
          setCcdaLoading(false);
          setPollingStatus('idle');
          setJobId(null);
          setSnackbar({
            open: true,
            message: 'Failed to check job status',
            severity: 'error',
          });
        }
      }
    };

    // Initial poll
    pollStatus();

    // Set up interval for subsequent polls
    const interval = setInterval(pollStatus, 3000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [jobId, setLocation]);

  return (
    <>
      <AppBar position="static" elevation={2} sx={{ backgroundColor: 'white', borderBottom: '3px solid', borderBottomColor: 'primary.main' }}>
        <Toolbar sx={{ py: 1 }}>
          <Box display="flex" alignItems="center" gap={3} flexGrow={1}>
            <Box
              component="img"
              src={cvsLogo}
              alt="CVS Health Logo"
              sx={{
                height: 40,
                width: 'auto',
                borderRadius: 1,
              }}
            />
            <Box>
              <Typography variant="h5" component="h1" fontWeight="700" color="primary.main">
                CDR Test Quality Suite
              </Typography>
              <Typography variant="body2" color="text.secondary" fontWeight="500">
                Building a world of health around every data point
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={toggleTheme}
            color="primary"
            data-testid="button-theme-toggle"
          >
            {isDarkMode ? <LightMode /> : <DarkMode />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {workflow !== 'selector' && (
          <Box mb={3}>
            <Button
              startIcon={<ArrowBack />}
              onClick={handleBackToSelector}
              variant="outlined"
              data-testid="button-back-to-selector"
            >
              Back to Format Selection
            </Button>
          </Box>
        )}

        {workflow === 'selector' && (
          <>
            <Box textAlign="center" mb={6}>
              <Typography 
                variant="h2" 
                component="h1" 
                gutterBottom 
                fontWeight="700"
                sx={{ 
                  background: 'linear-gradient(45deg, #CC0000 30%, #FF4444 90%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 3
                }}
              >
                Ensuring Healthcare Data Excellence
              </Typography>
              <Typography variant="h5" color="text.secondary" maxWidth="lg" mx="auto" sx={{ mb: 4, lineHeight: 1.6 }}>
                Transform your FHIR mapping specifications into comprehensive test suites with our 
                AI-powered validation platform. Connecting quality, reliability, and innovation.
              </Typography>
              
              <Grid container spacing={3} maxWidth="md" mx="auto">
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card elevation={1} sx={{ p: 2, textAlign: 'center', height: '100%' }}>
                    <HealthAndSafety color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h6" fontWeight="600" gutterBottom>
                      Healthcare First
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      FHIR-compliant validation for reliable healthcare data
                    </Typography>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card elevation={1} sx={{ p: 2, textAlign: 'center', height: '100%' }}>
                    <Analytics color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h6" fontWeight="600" gutterBottom>
                      AI-Powered
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Intelligent test case generation with comprehensive coverage
                    </Typography>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card elevation={1} sx={{ p: 2, textAlign: 'center', height: '100%' }}>
                    <Security color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h6" fontWeight="600" gutterBottom>
                      Enterprise Ready
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Scalable solution for healthcare organizations
                    </Typography>
                  </Card>
                </Grid>
              </Grid>
            </Box>

            <FormatSelector
              onSelectHL7={() => setWorkflow('hl7')}
              onSelectCCDA={() => setWorkflow('ccda')}
            />
          </>
        )}

        {workflow === 'hl7' && (
          <Box display="flex" flexDirection="column" gap={4} maxWidth="lg" mx="auto">
            <FileUpload
              onFileContent={setCsvContent}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
            />

            {csvContent && (
              <GenerationForm
                onSubmit={handleGenerateTestCases}
                loading={mutation.isPending}
                csvContent={csvContent}
              />
            )}
          </Box>
        )}

        {workflow === 'ccda' && (
          <CCDAConfigForm
            onSubmit={handleCCDASubmit}
            loading={ccdaLoading}
          />
        )}
      </Container>

      <Backdrop open={mutation.isPending || ccdaLoading} sx={{ zIndex: 1300, backgroundColor: 'rgba(204, 0, 0, 0.1)' }}>
        <Paper 
          elevation={8}
          sx={{ 
            p: 6, 
            textAlign: 'center', 
            borderRadius: 3,
            border: '2px solid',
            borderColor: 'primary.main',
            maxWidth: 400
          }}
        >
          <CircularProgress 
            size={80} 
            sx={{ 
              mb: 3,
              color: 'primary.main'
            }} 
          />
          <Typography variant="h5" gutterBottom fontWeight="600" color="primary.main">
            {pollingStatus === 'starting' && 'Starting Job...'}
            {pollingStatus === 'pending' && 'Job Queued...'}
            {pollingStatus === 'processing' && 'Generating Test Cases...'}
            {(pollingStatus === 'idle' || !pollingStatus || mutation.isPending) && 'Processing Your Healthcare Data'}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {ccdaLoading && jobId && `Job ID: ${jobId.substring(0, 8)}...`}
            {!ccdaLoading && 'Our AI is generating comprehensive FHIR test cases...'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This may take 30-60 seconds for complete coverage
          </Typography>
        </Paper>
      </Backdrop>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

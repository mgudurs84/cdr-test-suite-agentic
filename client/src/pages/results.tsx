import {
  Container,
  Typography,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Paper,
  Button,
  Grid,
  Snackbar,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Card,
  CardContent,
  Checkbox,
  TextField,
  MenuItem,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
} from '@mui/material';
import { 
  MedicalServices, 
  LightMode, 
  DarkMode, 
  ArrowBack,
  ContentCopy,
  Download,
  GitHub,
  ExpandMore,
  DataObject,
  TableChart,
  CheckCircle,
  Analytics,
  Security,
  HealthAndSafety,
  Code,
  PlayArrow,
  CloudUpload,
  Assignment,
  BuildCircle,
  RocketLaunch,
  FileDownload,
} from '@mui/icons-material';
import cvsLogo from '@assets/generated_images/CVS_Health_professional_logo_21ee5ea9.png';
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useTheme } from '@/components/ThemeProvider';
import type { TestCaseResponse } from '@shared/schema';
import { ChatBot } from '@/components/ChatBot';

export default function Results() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const [jsonData, setJsonData] = useState<TestCaseResponse | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning';
  }>({ open: false, message: '', severity: 'success' });
  
  // New state for pytest generation
  const [selectedTestCases, setSelectedTestCases] = useState<Set<string>>(new Set());
  const [pytestCode, setPytestCode] = useState<string>('');
  const [isPytestGenerating, setIsPytestGenerating] = useState(false);
  const [isGitHubUploading, setIsGitHubUploading] = useState(false);
  
  // GitHub deployment config
  const [githubConfig, setGithubConfig] = useState({
    repo: '',
    branch: 'main',
    filePath: 'tests/test_fhir_validation.py',
  });

  // Code popup state
  const [codePopup, setCodePopup] = useState<{
    open: boolean;
    testCase: any;
    code: string;
    loading: boolean;
  }>({
    open: false,
    testCase: null,
    code: '',
    loading: false,
  });

  // GitHub deployment popup state
  const [githubPopup, setGithubPopup] = useState(false);

  // Stepper state
  const [deploymentSuccess, setDeploymentSuccess] = useState(false);

  useEffect(() => {
    // Get JSON data from sessionStorage
    const storedData = sessionStorage.getItem('fhir-test-results');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setJsonData(data);
      } catch (error) {
        console.error('Error parsing stored JSON data:', error);
        setLocation('/'); // Redirect back if data is corrupted
      }
    } else {
      setLocation('/'); // Redirect back if no data
    }
  }, [setLocation]);

  const handleCopy = async () => {
    if (!jsonData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
      setSnackbar({
        open: true,
        message: 'JSON copied to clipboard!',
        severity: 'success',
      });
    } catch (err) {
      console.error('Failed to copy: ', err);
      setSnackbar({
        open: true,
        message: 'Failed to copy JSON',
        severity: 'error',
      });
    }
  };

  const handleDownload = () => {
    if (!jsonData) return;
    const dataStr = JSON.stringify(jsonData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fhir-test-cases-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setSnackbar({
      open: true,
      message: 'JSON file downloaded successfully!',
      severity: 'success',
    });
  };


  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Test case selection handlers
  const handleToggleTestCase = (testCaseId: string) => {
    const newSelected = new Set(selectedTestCases);
    if (newSelected.has(testCaseId)) {
      newSelected.delete(testCaseId);
    } else {
      newSelected.add(testCaseId);
    }
    setSelectedTestCases(newSelected);
  };

  const handleSelectAll = () => {
    if (!jsonData) return;
    if (selectedTestCases.size === jsonData.TestCases.length) {
      setSelectedTestCases(new Set());
    } else {
      const allIds = new Set(jsonData.TestCases.map(tc => tc.TestCaseID));
      setSelectedTestCases(allIds);
    }
  };

  // Generate pytest code for selected test cases (opens popup)
  const handleGeneratePytest = async () => {
    if (selectedTestCases.size === 0) {
      setSnackbar({
        open: true,
        message: 'Please select at least one test case',
        severity: 'warning',
      });
      return;
    }

    const selectedCases = jsonData?.TestCases.filter(tc => selectedTestCases.has(tc.TestCaseID)) || [];
    
    setCodePopup({
      open: true,
      testCase: selectedCases.length === 1 ? selectedCases[0] : { TestCaseID: `${selectedCases.length} Test Cases` },
      code: '',
      loading: true,
    });

    try {
      const response = await fetch('/api/generate_pytest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selectedTestCases: selectedCases }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate pytest code');
      }

      const data = await response.json();
      setPytestCode(data.pytestCode); // Store for GitHub deployment
      setCodePopup({
        open: true,
        testCase: selectedCases.length === 1 ? selectedCases[0] : { TestCaseID: `${selectedCases.length} Test Cases` },
        code: data.pytestCode,
        loading: false,
      });
    } catch (error) {
      console.error('Error generating pytest:', error);
      setCodePopup({
        open: true,
        testCase: selectedCases.length === 1 ? selectedCases[0] : { TestCaseID: `${selectedCases.length} Test Cases` },
        code: '# Error generating pytest code. Please try again.',
        loading: false,
      });
      setSnackbar({
        open: true,
        message: 'Failed to generate pytest code. Please try again.',
        severity: 'error',
      });
    }
  };

  // Copy pytest code
  const handleCopyPytest = async () => {
    try {
      await navigator.clipboard.writeText(pytestCode);
      setSnackbar({
        open: true,
        message: 'Pytest code copied to clipboard!',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: 'Failed to copy pytest code',
        severity: 'error',
      });
    }
  };

  // Download pytest code
  const handleDownloadPytest = () => {
    const blob = new Blob([pytestCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `test_fhir_validation_${new Date().toISOString().split('T')[0]}.py`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setSnackbar({
      open: true,
      message: 'Pytest file downloaded successfully!',
      severity: 'success',
    });
  };

  // Upload to GitHub and trigger Actions (calls backend API)
  const handleUploadToGitHub = async () => {
    if (!pytestCode) {
      setSnackbar({
        open: true,
        message: 'Please generate pytest code first',
        severity: 'warning',
      });
      return;
    }

    if (!githubConfig.repo) {
      setSnackbar({
        open: true,
        message: 'Please enter a repository name',
        severity: 'warning',
      });
      return;
    }

    setIsGitHubUploading(true);
    
    try {
      const response = await fetch('/api/push_pytest_to_github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pytestCode,
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath: githubConfig.filePath,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to upload to GitHub');
      }

      const data = await response.json();
      setGithubPopup(false); // Close popup on success
      setDeploymentSuccess(true); // Mark deployment as successful
      setSnackbar({
        open: true,
        message: `Successfully uploaded to ${githubConfig.repo} and triggered GitHub Actions!`,
        severity: 'success',
      });
    } catch (error) {
      console.error('Error uploading to GitHub:', error);
      setSnackbar({
        open: true,
        message: 'Failed to upload to GitHub. Please try again.',
        severity: 'error',
      });
    } finally {
      setIsGitHubUploading(false);
    }
  };

  // View pytest code for single test case
  const handleViewCode = async (testCase: any) => {
    setCodePopup({
      open: true,
      testCase,
      code: '',
      loading: true,
    });

    try {
      const response = await fetch('/api/generate_pytest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selectedTestCases: [testCase] }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate pytest code');
      }

      const data = await response.json();
      setPytestCode(data.pytestCode); // Store for GitHub deployment
      setCodePopup({
        open: true,
        testCase,
        code: data.pytestCode,
        loading: false,
      });
    } catch (error) {
      console.error('Error generating pytest:', error);
      setCodePopup({
        open: true,
        testCase,
        code: '# Error generating pytest code. Please try again.',
        loading: false,
      });
    }
  };

  // Copy code from popup
  const handleCopyCodePopup = async () => {
    try {
      await navigator.clipboard.writeText(codePopup.code);
      setSnackbar({
        open: true,
        message: 'Pytest code copied to clipboard!',
        severity: 'success',
      });
    } catch (err) {
      console.error('Failed to copy: ', err);
      setSnackbar({
        open: true,
        message: 'Failed to copy code',
        severity: 'error',
      });
    }
  };

  // Download code from popup
  const handleDownloadCodePopup = () => {
    const filename = `test_${codePopup.testCase?.TestCaseID || 'code'}.py`;
    const blob = new Blob([codePopup.code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setSnackbar({
      open: true,
      message: `Downloaded ${filename}`,
      severity: 'success',
    });
  };

  // Export to Zephyr CSV
  const handleExportZephyr = () => {
    if (!jsonData) return;

    // Helper function to escape CSV values
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // Helper function to map priority
    const getPriority = (testType: string) => {
      switch (testType) {
        case 'FUNCTIONAL':
          return 'High';
        case 'REGRESSION':
          return 'Medium';
        case 'EDGE':
          return 'Low';
        default:
          return 'Medium';
      }
    };

    // Helper function to format test steps as numbered plain text
    const formatTestSteps = (steps: string[]) => {
      return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
    };

    // Create CSV headers
    const headers = [
      'Name',
      'Objective',
      'Priority',
      'Status',
      'Component',
      'Labels',
      'Test Script Plain Text',
      'Expected Result'
    ];

    // Create CSV rows
    const rows = jsonData.TestCases.map(testCase => {
      const testStepsText = Array.isArray(testCase.TestSteps) 
        ? formatTestSteps(testCase.TestSteps)
        : testCase.TestSteps || '';

      return [
        escapeCSV(testCase.TestCaseID),
        escapeCSV(testCase.TestDescription),
        getPriority(testCase.TestCaseType),
        'Draft',
        escapeCSV(testCase.TestCaseType),
        escapeCSV(testCase.Subtype),
        escapeCSV(testStepsText),
        escapeCSV(testCase.PassFailCriteria)
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fhir_test_cases_zephyr.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSnackbar({
      open: true,
      message: 'Zephyr CSV exported successfully!',
      severity: 'success',
    });
  };

  const getTestCaseTypeColor = (type: string) => {
    switch (type) {
      case 'FUNCTIONAL':
        return 'primary';
      case 'REGRESSION':
        return 'secondary';
      case 'EDGE':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getSubtypeColor = (subtype: string) => {
    switch (subtype) {
      case 'POSITIVE':
        return 'success';
      case 'NEGATIVE':
        return 'error';
      default:
        return 'default';
    }
  };

  if (!jsonData) {
    return (
      <Container>
        <Typography variant="h6" textAlign="center" mt={4}>
          Loading results...
        </Typography>
      </Container>
    );
  }

  const stats = jsonData.StatisticalSummary;

  // Calculate active step based on progress
  const getActiveStep = () => {
    if (deploymentSuccess) return 3; // All steps complete
    if (pytestCode) return 2; // Code generated
    return 1; // Test cases generated (always at least step 1 on results page)
  };

  const steps = [
    { 
      label: 'Test Cases Validated', 
      description: 'FHIR test cases generated successfully',
      icon: <CheckCircle />,
      completed: true,
      color: '#4caf50', // Green
      bgColor: '#e8f5e9'
    },
    { 
      label: 'Pytest Code Generated', 
      description: 'Automated test scripts created',
      icon: <Code />,
      completed: !!pytestCode,
      color: '#2196f3', // Blue
      bgColor: '#e3f2fd'
    },
    { 
      label: 'Deployed to GitHub', 
      description: 'Tests running in CI/CD pipeline',
      icon: <RocketLaunch />,
      completed: deploymentSuccess,
      color: '#ff9800', // Orange
      bgColor: '#fff3e0'
    },
  ];

  const activeStep = getActiveStep();

  return (
    <>
      <AppBar position="static" elevation={2} sx={{ backgroundColor: 'white', borderBottom: '3px solid', borderBottomColor: 'primary.main' }}>
        <Toolbar sx={{ py: 1 }}>
          <IconButton
            edge="start"
            color="primary"
            onClick={() => setLocation('/')}
            data-testid="button-back"
            sx={{ mr: 2 }}
          >
            <ArrowBack />
          </IconButton>
          <Box
            component="img"
            src={cvsLogo}
            alt="CVS Health Logo"
            sx={{
              height: 35,
              width: 'auto',
              borderRadius: 1,
              mr: 2
            }}
          />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" component="h1" fontWeight="700" color="primary.main">
              CDR Test Quality Suite
            </Typography>
            <Typography variant="body2" color="text.secondary" fontWeight="500">
              Healthcare data validation results
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Chip
              icon={<CheckCircle />}
              label="Validation Complete"
              color="success"
              size="small"
            />
            <IconButton
              onClick={toggleTheme}
              color="primary"
              data-testid="button-theme-toggle"
            >
              {isDarkMode ? <LightMode /> : <DarkMode />}
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box display="flex" gap={4} flexDirection={{ xs: 'column', lg: 'row' }}>
          {/* Main Content - Left Side */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box display="flex" flexDirection="column" gap={4}>
          {/* Action Buttons */}
          <Card elevation={4} sx={{ border: '1px solid', borderColor: 'primary.light' }}>
            <CardContent sx={{ p: 4 }}>
              <Box display="flex" alignItems="center" gap={2} mb={3}>
                <Box
                  sx={{
                    p: 1.5,
                    backgroundColor: 'primary.main',
                    color: 'white',
                    borderRadius: 2,
                  }}
                >
                  <Analytics sx={{ fontSize: 28 }} />
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight="600" color="primary.main">
                    Export & Integration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Share your healthcare validation results with your team
                  </Typography>
                </Box>
              </Box>
              <Box display="flex" gap={3} flexWrap="wrap">
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<ContentCopy />}
                  onClick={handleCopy}
                  data-testid="button-copy-json"
                  sx={{ px: 3, py: 1.5 }}
                >
                  Copy Test Suite
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<Download />}
                  onClick={handleDownload}
                  data-testid="button-download-json"
                  sx={{ px: 3, py: 1.5 }}
                >
                  Download Results
                </Button>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<FileDownload />}
                  onClick={handleExportZephyr}
                  data-testid="button-export-zephyr"
                  sx={{ 
                    px: 3, 
                    py: 1.5,
                    backgroundColor: 'success.main',
                    '&:hover': {
                      backgroundColor: 'success.dark',
                    },
                  }}
                >
                  Export to Zephyr CSV
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Statistics Dashboard */}
          {stats && (
            <Card elevation={4} sx={{ border: '1px solid', borderColor: 'primary.light' }}>
              <CardContent sx={{ p: 4 }}>
                <Box display="flex" alignItems="center" gap={2} mb={3}>
                  <Box
                    sx={{
                      p: 1.5,
                      backgroundColor: 'primary.main',
                      color: 'white',
                      borderRadius: 2,
                    }}
                  >
                    <HealthAndSafety sx={{ fontSize: 28 }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" fontWeight="600" color="primary.main">
                      Healthcare Data Validation Statistics
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Comprehensive test coverage analysis
                    </Typography>
                  </Box>
                </Box>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'primary.light', color: 'primary.contrastText' }}>
                    <Typography variant="h3" component="div" fontWeight="bold">
                      {stats.TotalTestCases}
                    </Typography>
                    <Typography variant="body1">
                      Total Test Cases
                    </Typography>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" gutterBottom fontWeight="medium">
                      By Type
                    </Typography>
                    {Object.entries(stats.TestCaseTypeBreakdown).map(([type, count]) => (
                      <Box key={type} display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2" color="text.secondary">
                          {type}
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {count}
                        </Typography>
                      </Box>
                    ))}
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" gutterBottom fontWeight="medium">
                      By Subtype
                    </Typography>
                    {Object.entries(stats.SubtypeBreakdown).map(([subtype, count]) => (
                      <Box key={subtype} display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2" color="text.secondary">
                          {subtype}
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {count}
                        </Typography>
                      </Box>
                    ))}
                  </Paper>
                </Grid>
              </Grid>
              </CardContent>
            </Card>
          )}

          {/* Tabbed Results View */}
          <Card elevation={4} sx={{ border: '1px solid', borderColor: 'primary.light' }}>
            <CardContent sx={{ p: 4 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs value={activeTab} onChange={handleTabChange} aria-label="results tabs">
                <Tab 
                  icon={<DataObject />} 
                  label="JSON View" 
                  data-testid="tab-json"
                  sx={{ minHeight: 48 }}
                />
                <Tab 
                  icon={<TableChart />} 
                  label="Table View" 
                  data-testid="tab-table"
                  sx={{ minHeight: 48 }}
                />
              </Tabs>
            </Box>

            {/* JSON Tab */}
            {activeTab === 0 && (
              <Box>
                <Typography variant="h6" gutterBottom fontWeight="medium">
                  Generated Test Cases (JSON)
                </Typography>
                <Paper
                  sx={{
                    maxHeight: 600,
                    overflow: 'auto',
                    p: 2,
                    backgroundColor: isDarkMode ? 'grey.900' : 'grey.50',
                    border: 1,
                    borderColor: 'grey.300',
                  }}
                >
                  <Typography
                    component="pre"
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      m: 0,
                      fontSize: '0.875rem',
                      lineHeight: 1.5,
                    }}
                    data-testid="json-content"
                  >
                    {JSON.stringify(jsonData, null, 2)}
                  </Typography>
                </Paper>
              </Box>
            )}

            {/* Table Tab */}
            {activeTab === 1 && (
              <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" fontWeight="medium">
                    Test Cases Table View
                  </Typography>
                  
                  <Box display="flex" gap={2} alignItems="center">
                    {selectedTestCases.size > 0 && (
                      <>
                        <Chip
                          label={`${selectedTestCases.size} selected`}
                          color="primary"
                          size="medium"
                          data-testid="chip-selected-count"
                        />
                        <Button
                          variant="contained"
                          size="medium"
                          startIcon={<Code />}
                          onClick={handleGeneratePytest}
                          data-testid="button-generate-selected"
                          sx={{ 
                            px: 3,
                            background: 'linear-gradient(45deg, #CC0000 30%, #FF4444 90%)',
                            '&:hover': {
                              background: 'linear-gradient(45deg, #AA0000 30%, #DD2222 90%)',
                            },
                          }}
                        >
                          Generate Code for Selected ({selectedTestCases.size})
                        </Button>
                      </>
                    )}
                    {pytestCode && (
                      <Button
                        variant="contained"
                        size="medium"
                        startIcon={<GitHub />}
                        onClick={() => setGithubPopup(true)}
                        data-testid="button-deploy-github-toolbar"
                        sx={{ 
                          px: 3,
                          backgroundColor: 'grey.800',
                          '&:hover': {
                            backgroundColor: 'grey.900',
                          },
                        }}
                      >
                        Deploy to GitHub & Run Tests
                      </Button>
                    )}
                  </Box>
                </Box>
                
                <TableContainer 
                  component={Paper} 
                  sx={{ 
                    maxHeight: 600, 
                    overflow: 'auto',
                    border: 1,
                    borderColor: 'grey.300'
                  }}
                >
                  <Table stickyHeader data-testid="test-cases-table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText', width: 50 }}>
                          <Checkbox
                            checked={jsonData && selectedTestCases.size === jsonData.TestCases.length && jsonData.TestCases.length > 0}
                            indeterminate={selectedTestCases.size > 0 && jsonData && selectedTestCases.size < jsonData.TestCases.length}
                            onChange={handleSelectAll}
                            sx={{ color: 'white', '&.Mui-checked': { color: 'white' }, '&.MuiCheckbox-indeterminate': { color: 'white' } }}
                            data-testid="checkbox-select-all"
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
                          Test Case ID
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
                          Type
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
                          Subtype
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
                          Description
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
                          Expected Output
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
                          Test Steps
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText' }}>
                          Pass/Fail Criteria
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', backgroundColor: 'primary.main', color: 'primary.contrastText', textAlign: 'center' }}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {jsonData.TestCases.map((testCase, index) => (
                        <TableRow 
                          key={testCase.TestCaseID || index}
                          sx={{ 
                            '&:nth-of-type(odd)': { 
                              backgroundColor: isDarkMode ? 'grey.900' : 'grey.50' 
                            },
                            '&:hover': {
                              backgroundColor: isDarkMode ? 'grey.800' : 'grey.100'
                            },
                            backgroundColor: selectedTestCases.has(testCase.TestCaseID) ? (isDarkMode ? 'action.selected' : 'primary.light') : undefined,
                          }}
                          data-testid={`table-row-${index}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedTestCases.has(testCase.TestCaseID)}
                              onChange={() => handleToggleTestCase(testCase.TestCaseID)}
                              data-testid={`checkbox-${testCase.TestCaseID}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography 
                              variant="body2" 
                              fontFamily="monospace" 
                              sx={{ 
                                backgroundColor: 'action.hover', 
                                p: 1, 
                                borderRadius: 1,
                                fontSize: '0.75rem'
                              }}
                            >
                              {testCase.TestCaseID}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={testCase.TestCaseType || 'FUNCTIONAL'} 
                              color={getTestCaseTypeColor(testCase.TestCaseType || 'FUNCTIONAL') as any}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={testCase.Subtype || 'POSITIVE'} 
                              color={getSubtypeColor(testCase.Subtype || 'POSITIVE') as any}
                              size="small"
                            />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 300 }}>
                            <Typography variant="body2" sx={{ wordWrap: 'break-word' }}>
                              {testCase.TestDescription}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 300 }}>
                            <Typography variant="body2" sx={{ wordWrap: 'break-word' }}>
                              {testCase.ExpectedOutput}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 250 }}>
                            {testCase.TestSteps && Array.isArray(testCase.TestSteps) ? (
                              <Accordion elevation={0} sx={{ backgroundColor: 'transparent' }}>
                                <AccordionSummary
                                  expandIcon={<ExpandMore />}
                                  sx={{ p: 0, minHeight: 'auto' }}
                                >
                                  <Typography variant="body2" color="primary">
                                    {testCase.TestSteps.length} steps
                                  </Typography>
                                </AccordionSummary>
                                <AccordionDetails sx={{ p: 0, pt: 1 }}>
                                  <List dense sx={{ p: 0 }}>
                                    {testCase.TestSteps.map((step, stepIndex) => (
                                      <ListItem key={stepIndex} sx={{ p: 0, pl: 1 }}>
                                        <ListItemText 
                                          primary={
                                            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                              {stepIndex + 1}. {step}
                                            </Typography>
                                          }
                                        />
                                      </ListItem>
                                    ))}
                                  </List>
                                </AccordionDetails>
                              </Accordion>
                            ) : (
                              <Typography variant="body2" sx={{ wordWrap: 'break-word', fontSize: '0.75rem' }}>
                                {testCase.TestSteps || 'No steps defined'}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 300 }}>
                            <Typography variant="body2" sx={{ wordWrap: 'break-word' }}>
                              {testCase.PassFailCriteria}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Code />}
                              onClick={() => handleViewCode(testCase)}
                              data-testid={`button-view-code-${testCase.TestCaseID}`}
                              sx={{
                                borderColor: 'success.main',
                                color: 'success.main',
                                '&:hover': {
                                  borderColor: 'success.dark',
                                  backgroundColor: 'success.light',
                                },
                              }}
                            >
                              View Code
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
            </CardContent>
          </Card>
            </Box>
          </Box>

          {/* Vertical Progress Tracker - Right Side */}
          <Box sx={{ width: { xs: '100%', lg: '360px' }, flexShrink: 0 }}>
            <Box
              sx={{
                position: 'sticky',
                top: 20,
                backgroundColor: isDarkMode ? 'grey.900' : 'white',
                borderRadius: 3,
                p: 3,
                border: '1px solid',
                borderColor: isDarkMode ? 'grey.800' : 'grey.200',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            >
              <Typography variant="h6" fontWeight="700" mb={3} color="primary.main">
                Workflow Progress
              </Typography>
              <Box 
                display="flex" 
                flexDirection="column" 
                gap={0} 
                data-testid="workflow-stepper"
              >
                {steps.map((step, index) => (
                  <Box key={step.label} sx={{ position: 'relative' }}>
                    {/* Step Content */}
                    <Box display="flex" alignItems="flex-start" gap={2}>
                      {/* Icon Circle */}
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          minWidth: 48,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: step.completed 
                            ? step.color
                            : isDarkMode ? 'grey.700' : 'grey.300',
                          color: 'white',
                          transition: 'all 0.4s ease',
                          boxShadow: step.completed 
                            ? `0 6px 20px ${step.color}50`
                            : 'none',
                          position: 'relative',
                          zIndex: 2,
                        }}
                        data-testid={`step-icon-${index}`}
                      >
                        {step.icon}
                      </Box>
                      
                      {/* Text Content */}
                      <Box sx={{ pt: 0.5, pb: index < steps.length - 1 ? 3.5 : 0, flex: 1 }}>
                        <Typography 
                          variant="subtitle1" 
                          fontWeight={step.completed ? 700 : 500}
                          sx={{ 
                            color: step.completed ? step.color : 'text.secondary',
                            transition: 'all 0.3s ease',
                            mb: 0.5,
                            fontSize: '1rem'
                          }}
                          data-testid={`step-label-${index}`}
                        >
                          {step.label}
                        </Typography>
                        <Typography 
                          variant="caption" 
                          color="text.secondary"
                          sx={{ fontSize: '0.8rem', display: 'block' }}
                        >
                          {step.description}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Vertical Connector Line */}
                    {index < steps.length - 1 && (
                      <Box
                        sx={{
                          position: 'absolute',
                          left: '24px',
                          top: '48px',
                          width: '3px',
                          height: 'calc(100% - 48px)',
                          backgroundColor: steps[index + 1].completed 
                            ? steps[index + 1].color 
                            : isDarkMode ? 'grey.700' : 'grey.300',
                          transition: 'all 0.4s ease',
                          zIndex: 1,
                        }}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      </Container>

      {/* Code Popup Dialog */}
      <Dialog
        open={codePopup.open}
        onClose={() => setCodePopup({ ...codePopup, open: false })}
        maxWidth="md"
        fullWidth
        data-testid="dialog-pytest-code"
      >
        <DialogTitle sx={{ backgroundColor: 'success.main', color: 'white', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Code sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h6" fontWeight="600">
              Pytest Code
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {codePopup.testCase?.TestCaseID || 'Test Case'}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3, mt: 2 }}>
          {codePopup.loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={6}>
              <CircularProgress size={40} color="success" />
              <Typography variant="body1" ml={2} color="text.secondary">
                Generating pytest code...
              </Typography>
            </Box>
          ) : (
            <>
              <Paper
                sx={{
                  maxHeight: 500,
                  overflow: 'auto',
                  p: 3,
                  backgroundColor: isDarkMode ? 'grey.900' : 'grey.50',
                  border: 2,
                  borderColor: 'success.light',
                  fontFamily: 'monospace',
                }}
              >
                <Typography
                  component="pre"
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    m: 0,
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    color: isDarkMode ? 'success.light' : 'success.dark',
                  }}
                  data-testid="popup-pytest-code"
                >
                  {codePopup.code}
                </Typography>
              </Paper>
              
              <Box display="flex" gap={2} mt={3}>
                <Button
                  variant="outlined"
                  startIcon={<ContentCopy />}
                  onClick={handleCopyCodePopup}
                  data-testid="button-copy-code-popup"
                  color="success"
                >
                  Copy Code
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Download />}
                  onClick={handleDownloadCodePopup}
                  data-testid="button-download-code-popup"
                  color="success"
                >
                  Download .py File
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setCodePopup({ ...codePopup, open: false })}
            variant="contained"
            color="success"
            data-testid="button-close-popup"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* GitHub Deployment Popup Dialog */}
      <Dialog
        open={githubPopup}
        onClose={() => setGithubPopup(false)}
        maxWidth="sm"
        fullWidth
        data-testid="dialog-github-deployment"
      >
        <DialogTitle sx={{ backgroundColor: 'grey.800', color: 'white', display: 'flex', alignItems: 'center', gap: 2 }}>
          <GitHub sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h6" fontWeight="600">
              Deploy to GitHub & Run Tests
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Configure your GitHub repository details
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3, mt: 2 }}>
          <Box display="flex" flexDirection="column" gap={3}>
            <TextField
              fullWidth
              label="Repository Name"
              placeholder="username/repository"
              value={githubConfig.repo}
              onChange={(e) => setGithubConfig({ ...githubConfig, repo: e.target.value })}
              helperText="Format: username/repo-name or organization/repo-name"
              data-testid="input-github-repo-popup"
            />
            <TextField
              fullWidth
              select
              label="Branch"
              value={githubConfig.branch}
              onChange={(e) => setGithubConfig({ ...githubConfig, branch: e.target.value })}
              data-testid="select-github-branch-popup"
            >
              <MenuItem value="main">main</MenuItem>
              <MenuItem value="master">master</MenuItem>
              <MenuItem value="develop">develop</MenuItem>
              <MenuItem value="test">test</MenuItem>
            </TextField>
            <TextField
              fullWidth
              label="File Path"
              value={githubConfig.filePath}
              onChange={(e) => setGithubConfig({ ...githubConfig, filePath: e.target.value })}
              helperText="Path in repository where the pytest file will be saved"
              data-testid="input-github-filepath-popup"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setGithubPopup(false)}
            variant="outlined"
            data-testid="button-cancel-github-popup"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={isGitHubUploading ? <CircularProgress size={20} color="inherit" /> : <CloudUpload />}
            onClick={handleUploadToGitHub}
            disabled={!githubConfig.repo || isGitHubUploading}
            data-testid="button-upload-github-popup"
            sx={{ 
              backgroundColor: 'grey.800',
              '&:hover': {
                backgroundColor: 'grey.900',
              },
            }}
          >
            {isGitHubUploading ? 'Uploading...' : 'Upload & Trigger Actions'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* FHIR Expert Assistant Chatbot */}
      <ChatBot
        context={{
          testCases: jsonData?.TestCases || [],
          csvContent: sessionStorage.getItem('csv-content') || '',
          selectedIds: Array.from(selectedTestCases),
        }}
      />
    </>
  );
}
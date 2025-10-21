import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  CircularProgress,
  InputAdornment,
  Tooltip,
  IconButton,
  Alert,
} from '@mui/material';
import { GitHub, CheckCircle, Info, Send } from '@mui/icons-material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const ccdaConfigSchema = z.object({
  githubUrl: z
    .string()
    .min(1, 'GitHub URL is required')
    .url('Must be a valid URL')
    .refine(
      (url) => url.includes('github.com'),
      'Must be a GitHub URL'
    ),
  sessionId: z.string().min(1, 'Session ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  batchSize: z.string().min(1, 'Batch size is required').refine(
    (val) => !isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 100,
    'Batch size must be between 1 and 100'
  ),
});

type CCDAConfigFormData = z.infer<typeof ccdaConfigSchema>;

interface CCDAConfigFormProps {
  onSubmit: (data: CCDAConfigFormData) => void;
  loading?: boolean;
}

export function CCDAConfigForm({ onSubmit, loading = false }: CCDAConfigFormProps) {
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'success' | 'error' | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CCDAConfigFormData>({
    resolver: zodResolver(ccdaConfigSchema),
    defaultValues: {
      githubUrl: '',
      sessionId: '',
      userId: '',
      batchSize: '10',
    },
  });

  const githubUrl = watch('githubUrl');

  const handleTestConnection = async () => {
    if (!githubUrl || errors.githubUrl) {
      return;
    }

    setTestingConnection(true);
    setConnectionStatus(null);

    try {
      const response = await fetch('/api/test-github-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: githubUrl }),
      });

      if (response.ok) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
    } catch (error) {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Box
          sx={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            backgroundColor: (theme) => `${theme.palette.primary.main}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <GitHub sx={{ fontSize: 32, color: 'primary.main' }} />
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="700" color="primary.main" gutterBottom>
            CCDA Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure your CCDA parameters for automated test generation
          </Typography>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 4 }}>
        Enter your GitHub CSV mapping file location and configuration parameters to generate FHIR test cases.
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Box display="flex" flexDirection="column" gap={3}>
          <Box>
            <TextField
              {...register('githubUrl')}
              fullWidth
              label="GitHub CSV File URL"
              placeholder="https://github.com/owner/repo/blob/main/mapping.csv"
              error={!!errors.githubUrl}
              helperText={errors.githubUrl?.message || 'Enter the full GitHub URL to your CSV mapping file'}
              disabled={loading}
              data-testid="input-github-url"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <GitHub color="action" />
                  </InputAdornment>
                ),
                endAdornment: connectionStatus && (
                  <InputAdornment position="end">
                    {connectionStatus === 'success' ? (
                      <CheckCircle color="success" />
                    ) : (
                      <Tooltip title="URL validation failed">
                        <Info color="error" />
                      </Tooltip>
                    )}
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleTestConnection}
              disabled={!githubUrl || !!errors.githubUrl || testingConnection || loading}
              startIcon={testingConnection ? <CircularProgress size={16} /> : <GitHub />}
              sx={{ mt: 1 }}
              data-testid="button-test-connection"
            >
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
          </Box>

          <TextField
            {...register('sessionId')}
            fullWidth
            label="Session ID"
            placeholder="session-12345"
            error={!!errors.sessionId}
            helperText={errors.sessionId?.message || 'Unique identifier for this test session'}
            disabled={loading}
            data-testid="input-session-id"
          />

          <TextField
            {...register('userId')}
            fullWidth
            label="User ID"
            placeholder="user@example.com"
            error={!!errors.userId}
            helperText={errors.userId?.message || 'Your user identifier'}
            disabled={loading}
            data-testid="input-user-id"
          />

          <TextField
            {...register('batchSize')}
            fullWidth
            type="number"
            label="Batch Size"
            placeholder="10"
            error={!!errors.batchSize}
            helperText={errors.batchSize?.message || 'Number of test cases to generate (1-100)'}
            disabled={loading}
            data-testid="input-batch-size"
            InputProps={{
              inputProps: { min: 1, max: 100 },
            }}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <Send />}
            sx={{ py: 1.5, mt: 2 }}
            data-testid="button-generate-ccda"
          >
            {loading ? 'Generating Test Cases...' : 'Generate CCDA Test Cases'}
          </Button>
        </Box>
      </form>
    </Paper>
  );
}

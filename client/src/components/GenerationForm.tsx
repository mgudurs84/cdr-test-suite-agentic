import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Box,
  CircularProgress,
  Paper,
  Chip,
} from '@mui/material';
import { Settings, RocketLaunch, Psychology, Speed } from '@mui/icons-material';
import { useState } from 'react';

interface GenerationFormProps {
  onSubmit: (data: { batchNumber: string; userId: string }) => void;
  loading: boolean;
  csvContent: string;
}

export const GenerationForm = ({ onSubmit, loading, csvContent }: GenerationFormProps) => {
  const [batchNumber, setBatchNumber] = useState('001');
  const [userId, setUserId] = useState('external_client');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (csvContent && batchNumber && userId) {
      onSubmit({ batchNumber, userId });
    }
  };

  return (
    <Card elevation={4} sx={{ border: '1px solid', borderColor: 'primary.light' }}>
      <CardContent sx={{ p: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={4}>
          <Paper
            sx={{
              p: 1.5,
              backgroundColor: 'primary.main',
              color: 'white',
              borderRadius: 2,
            }}
          >
            <Psychology sx={{ fontSize: 28 }} />
          </Paper>
          <Box>
            <Typography variant="h5" component="h2" fontWeight="600" color="primary.main">
              AI Test Generation Parameters
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure your healthcare data validation suite
            </Typography>
          </Box>
        </Box>
        
        <Box display="flex" gap={1} mb={3}>
          <Chip
            icon={<Speed />}
            label="Enterprise AI"
            color="primary"
            size="small"
            variant="outlined"
          />
          <Chip
            label="FHIR Compliant"
            color="primary"
            size="small"
            variant="outlined"
          />
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Batch Number"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g., 001"
                required
                data-testid="input-batch-number"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g., external_client"
                required
                data-testid="input-user-id"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={!csvContent || loading}
                  startIcon={loading ? <CircularProgress size={24} color="inherit" /> : <RocketLaunch />}
                  sx={{ 
                    py: 2, 
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    background: 'linear-gradient(45deg, #CC0000 30%, #FF4444 90%)',
                    '&:hover': {
                      background: 'linear-gradient(45deg, #AA0000 30%, #DD2222 90%)',
                    }
                  }}
                  data-testid="button-generate"
                >
                  {loading ? 'Processing Healthcare Data...' : 'Generate Comprehensive Test Suite'}
                </Button>
                <Typography variant="caption" color="text.secondary" textAlign="center">
                  Powered by CVS Health's enterprise AI • HIPAA compliant processing
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

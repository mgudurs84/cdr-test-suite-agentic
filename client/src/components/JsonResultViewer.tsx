import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Grid,
  Paper,
  Snackbar,
  Alert,
} from '@mui/material';
import { CheckCircle, ContentCopy, Assignment } from '@mui/icons-material';
import { useState } from 'react';
import type { TestCaseResponse } from '@shared/schema';

interface JsonResultViewerProps {
  jsonData: TestCaseResponse;
}

export const JsonResultViewer = ({ jsonData }: JsonResultViewerProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const stats = jsonData?.StatisticalSummary;

  return (
    <>
      <Card elevation={3}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Box display="flex" alignItems="center" gap={1}>
              <CheckCircle color="success" />
              <Typography variant="h6" component="h2">
                Generated Test Cases
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<ContentCopy />}
              onClick={handleCopy}
              data-testid="button-copy-json"
            >
              Copy JSON
            </Button>
          </Box>

          {stats && (
            <Grid container spacing={3} mb={3}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={1}>
                    <Assignment color="primary" />
                    <Typography variant="h4" component="div" fontWeight="bold">
                      {stats.TotalTestCases}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Total Test Cases
                  </Typography>
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom fontWeight="medium">
                    By Type
                  </Typography>
                  {Object.entries(stats.TestCaseTypeBreakdown).map(([type, count]) => (
                    <Box key={type} display="flex" justifyContent="space-between">
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
                  <Typography variant="subtitle2" gutterBottom fontWeight="medium">
                    By Subtype
                  </Typography>
                  {Object.entries(stats.SubtypeBreakdown).map(([subtype, count]) => (
                    <Box key={subtype} display="flex" justifyContent="space-between">
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
          )}

          <Paper
            sx={{
              maxHeight: 600,
              overflow: 'auto',
              p: 2,
              backgroundColor: 'grey.50',
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
              }}
              data-testid="json-content"
            >
              {JSON.stringify(jsonData, null, 2)}
            </Typography>
          </Paper>
        </CardContent>
      </Card>

      <Snackbar
        open={copied}
        autoHideDuration={3000}
        onClose={() => setCopied(false)}
      >
        <Alert onClose={() => setCopied(false)} severity="success">
          JSON copied to clipboard!
        </Alert>
      </Snackbar>
    </>
  );
};

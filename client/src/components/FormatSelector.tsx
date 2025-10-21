import { Box, Card, CardContent, Typography, Grid, alpha } from '@mui/material';
import { Description, Settings, ArrowForward } from '@mui/icons-material';

interface FormatSelectorProps {
  onSelectHL7: () => void;
  onSelectCCDA: () => void;
}

export function FormatSelector({ onSelectHL7, onSelectCCDA }: FormatSelectorProps) {
  return (
    <Box>
      <Box textAlign="center" mb={6}>
        <Typography
          variant="h3"
          component="h2"
          gutterBottom
          fontWeight="700"
          color="primary.main"
          sx={{ mb: 2 }}
        >
          Choose Your Specification Format
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth="md" mx="auto">
          Select the type of mapping specification you want to validate
        </Typography>
      </Box>

      <Grid container spacing={4} maxWidth="lg" mx="auto">
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            elevation={3}
            onClick={onSelectHL7}
            data-testid="card-hl7-selector"
            sx={{
              cursor: 'pointer',
              height: '100%',
              transition: 'all 0.3s ease-in-out',
              border: '2px solid',
              borderColor: 'transparent',
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: 8,
                borderColor: 'primary.main',
                '& .arrow-icon': {
                  transform: 'translateX(8px)',
                },
              },
            }}
          >
            <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                }}
              >
                <Description sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>

              <Typography variant="h4" fontWeight="700" gutterBottom color="primary.main">
                HL7 Specification
              </Typography>

              <Typography variant="body1" color="text.secondary" sx={{ mb: 3, flexGrow: 1, lineHeight: 1.7 }}>
                Upload HL7 mapping specifications and generate comprehensive test cases with AI-powered validation.
                Perfect for standard HL7 to FHIR transformations.
              </Typography>

              <Box display="flex" alignItems="center" gap={1} color="primary.main">
                <Typography variant="button" fontWeight="600">
                  Continue with HL7
                </Typography>
                <ArrowForward
                  className="arrow-icon"
                  sx={{ transition: 'transform 0.3s ease-in-out' }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            elevation={3}
            onClick={onSelectCCDA}
            data-testid="card-ccda-selector"
            sx={{
              cursor: 'pointer',
              height: '100%',
              transition: 'all 0.3s ease-in-out',
              border: '2px solid',
              borderColor: 'transparent',
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: 8,
                borderColor: 'primary.main',
                '& .arrow-icon': {
                  transform: 'translateX(8px)',
                },
              },
            }}
          >
            <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 3,
                }}
              >
                <Settings sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>

              <Typography variant="h4" fontWeight="700" gutterBottom color="primary.main">
                CCDA Configuration
              </Typography>

              <Typography variant="body1" color="text.secondary" sx={{ mb: 3, flexGrow: 1, lineHeight: 1.7 }}>
                Configure CCDA parameters with GitHub integration for automated test generation.
                Streamlined workflow for CCDA to FHIR mapping validation.
              </Typography>

              <Box display="flex" alignItems="center" gap={1} color="primary.main">
                <Typography variant="button" fontWeight="600">
                  Configure CCDA
                </Typography>
                <ArrowForward
                  className="arrow-icon"
                  sx={{ transition: 'transform 0.3s ease-in-out' }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

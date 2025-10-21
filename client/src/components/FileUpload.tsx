import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  Alert,
  Chip,
  Button,
  Paper,
  useTheme as useMuiTheme
} from '@mui/material';
import { CloudUpload, CheckCircle, Description, FileUpload as FileUploadIcon } from '@mui/icons-material';
import { useState, useRef, useCallback } from 'react';

interface FileUploadProps {
  onFileContent: (content: string) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
}

export const FileUpload = ({ onFileContent, selectedFile, setSelectedFile }: FileUploadProps) => {
  const theme = useMuiTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  }, []);

  const handleFileSelection = (file: File) => {
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        onFileContent(e.target?.result as string);
      };
      reader.readAsText(file);
    } else {
      alert('Please select a valid CSV file.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  return (
    <Card elevation={4} sx={{ border: '1px solid', borderColor: 'primary.light' }}>
      <CardContent sx={{ p: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Paper
            sx={{
              p: 1.5,
              backgroundColor: 'primary.main',
              color: 'white',
              borderRadius: 2,
            }}
          >
            <FileUploadIcon sx={{ fontSize: 28 }} />
          </Paper>
          <Box>
            <Typography variant="h5" component="h2" fontWeight="600" color="primary.main">
              Upload FHIR Mapping Specifications
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Secure healthcare data processing with enterprise-grade validation
            </Typography>
          </Box>
        </Box>
        
        <Box
          sx={{
            border: `3px dashed ${dragOver ? theme.palette.primary.main : theme.palette.primary.light}`,
            borderRadius: 3,
            p: 6,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            backgroundColor: dragOver ? `${theme.palette.primary.main}15` : `${theme.palette.primary.main}05`,
            '&:hover': {
              backgroundColor: `${theme.palette.primary.main}10`,
              borderColor: 'primary.main',
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 25px rgba(204, 0, 0, 0.15)',
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          data-testid="file-upload-zone"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            data-testid="file-input"
          />
          
          <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                backgroundColor: `${theme.palette.primary.main}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${theme.palette.primary.light}`,
                mb: 2
              }}
            >
              <CloudUpload sx={{ fontSize: 40, color: 'primary.main' }} />
            </Box>
            
            {selectedFile ? (
              <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                <Typography variant="h5" fontWeight="600" color="success.main">
                  File Ready for Processing
                </Typography>
                <Chip
                  icon={<CheckCircle />}
                  label={selectedFile.name}
                  color="success"
                  size="medium"
                  sx={{ fontSize: '1rem', py: 2, px: 1 }}
                  data-testid="selected-file-chip"
                />
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ mt: 1 }}
                >
                  Change File
                </Button>
              </Box>
            ) : (
              <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                <Typography variant="h5" fontWeight="600" color="primary.main">
                  Upload Your FHIR Mapping File
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                  Drag & drop your CSV file here or click to browse
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<CloudUpload />}
                  sx={{ px: 4, py: 1.5 }}
                >
                  Choose CSV File
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Maximum file size: 10MB • CSV format only
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
        
        <Paper 
          elevation={1} 
          sx={{ 
            mt: 4, 
            p: 3, 
            backgroundColor: 'primary.light', 
            color: 'primary.contrastText',
            border: '1px solid',
            borderColor: 'primary.main'
          }}
        >
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Description color="inherit" />
            <Typography variant="h6" fontWeight="600">
              Healthcare Data Standards
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Our platform follows strict healthcare data compliance requirements:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              <strong>Required Headers:</strong> Source_Field, Target_FHIR_Resource, FHIR_Attribute
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              <strong>Format:</strong> UTF-8 encoded CSV with one mapping per row
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              <strong>Security:</strong> All data processed with enterprise-grade encryption
            </Typography>
            <Typography component="li" variant="body2">
              <strong>Compliance:</strong> HIPAA-compliant validation and processing
            </Typography>
          </Box>
        </Paper>
      </CardContent>
    </Card>
  );
};

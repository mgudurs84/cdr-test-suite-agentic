# FHIR Test Case Generator

A modern full-stack web application that generates comprehensive FHIR test cases from CSV mapping files using Google Vertex AI. Built with React, Material UI, and Express.js.

## Overview

This application allows users to upload FHIR mapping CSV files and automatically generates detailed test cases covering positive, negative, and edge scenarios for healthcare data transformation validation. The system features an intuitive Material UI-based interface with intelligent test case generation powered by Google Vertex AI.

## Prerequisites

Before running the application locally, ensure you have the following installed:

- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)
- **Git** (for cloning the repository)

## Installation

1. **Clone the repository** (or download the project files):
   ```bash
   git clone <repository-url>
   cd fhir-test-case-generator
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

## Running the Application

### Development Mode

To start the application in development mode with hot reloading:

```bash
npm run dev
```

This command will:
- Start the Express.js backend server on port 5000
- Start the Vite development server for the React frontend
- Enable hot module replacement for real-time updates

After running the command, open your browser and navigate to:
```
http://localhost:5000
```

### Production Mode

To build and run the application for production:

1. **Build the frontend**:
   ```bash
   npm run build
   ```

2. **Start the production server**:
   ```bash
   npm start
   ```

## Project Structure

```
fhir-test-case-generator/
├── client/                          # React frontend
│   ├── src/
│   │   ├── components/              # React components
│   │   │   ├── ui/                  # Shadcn UI components
│   │   │   ├── FileUpload.tsx       # CSV file upload component
│   │   │   ├── GenerationForm.tsx   # Test case generation form
│   │   │   ├── JsonResultViewer.tsx # JSON result display
│   │   │   └── ThemeProvider.tsx    # Material UI theme provider
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── lib/                     # Utility libraries
│   │   ├── pages/                   # Page components
│   │   ├── App.tsx                  # Main app component
│   │   ├── main.tsx                 # React entry point
│   │   └── index.css                # Global styles
│   └── index.html                   # HTML template
├── server/                          # Express.js backend
│   ├── index.ts                     # Server entry point
│   ├── routes.ts                    # API routes
│   ├── storage.ts                   # Data storage interface
│   └── vite.ts                      # Vite integration
├── shared/                          # Shared TypeScript schemas
│   └── schema.ts                    # Zod validation schemas
├── attached_assets/                 # Backend integration files
│   ├── agent.py                     # Vertex AI agent definition
│   ├── invoke_sdk.py                # SDK for external access
│   └── main_sdk.py                  # FastAPI backend example
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite configuration
└── README.md                        # This file
```

## Usage

### 1. Upload CSV Mapping File

1. Click on the upload area or drag and drop a CSV file
2. Ensure your CSV file has the required headers:
   - `Source_Field`
   - `Target_FHIR_Resource`
   - `FHIR_Attribute`
   - `Transformation_Rule`
   - `Data_Type`
   - `Required`
   - `Cardinality`

### 2. Configure Generation Parameters

1. Enter a **Batch Number** (e.g., "001")
2. Specify a **User ID** (e.g., "external_client")

### 3. Generate Test Cases

1. Click "Generate Test Cases" button
2. Wait for the AI-powered generation process to complete
3. View the results in the interactive JSON viewer

### 4. Review Results

The generated output includes:
- **Test Cases Array**: Comprehensive test scenarios with:
  - TestCaseID
  - TestDescription
  - ExpectedOutput
  - TestSteps
  - PassFailCriteria
  - TestCaseType (FUNCTIONAL, REGRESSION, EDGE)
  - Subtype (POSITIVE, NEGATIVE)

- **Statistical Summary**: Overview with:
  - Total test cases generated
  - Breakdown by test case type
  - Breakdown by subtype
  - Mapping row statistics

## API Endpoints

### POST /api/generate_test_cases

Generates FHIR test cases from CSV mapping data.

**Request Body:**
```json
{
  "csv_mapping": "string",
  "batch_number": "string", 
  "user_id": "string"
}
```

**Response:**
```json
{
  "TestCases": [
    {
      "TestCaseID": "B_001_TC_001_functional_positive",
      "TestDescription": "Test description",
      "ExpectedOutput": "Expected result",
      "TestSteps": ["Step 1", "Step 2"],
      "PassFailCriteria": "Pass/fail criteria",
      "TestCaseType": "FUNCTIONAL",
      "Subtype": "POSITIVE"
    }
  ],
  "StatisticalSummary": {
    "MappingRows": 5,
    "UniqueAttributes": 3,
    "TestCaseTypeBreakdown": {
      "FUNCTIONAL": 10,
      "REGRESSION": 5,
      "EDGE": 3
    },
    "SubtypeBreakdown": {
      "POSITIVE": 12,
      "NEGATIVE": 6
    },
    "TotalTestCases": 18
  }
}
```

## Technology Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Material UI** - Component library and design system
- **Vite** - Build tool and development server
- **TanStack Query** - Server state management
- **Wouter** - Lightweight routing
- **Tailwind CSS** - Utility-first CSS framework

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Zod** - Schema validation
- **CORS** - Cross-origin resource sharing

### Development Tools
- **ESBuild** - Fast JavaScript bundler
- **Drizzle ORM** - Database ORM (configured for future use)
- **Hot Module Replacement** - Development experience

## Features

- 🎨 **Modern Material UI Design** - Professional interface with dark/light theme support
- 📁 **Drag & Drop File Upload** - Intuitive CSV file handling
- 🤖 **AI-Powered Generation** - Intelligent test case creation using Vertex AI
- 📊 **Interactive Results** - Rich JSON viewer with statistics dashboard
- 📱 **Responsive Design** - Works on desktop and mobile devices
- ⚡ **Real-time Updates** - Hot module replacement for development
- 🔍 **Type Safety** - Full TypeScript support throughout the stack
- 🎯 **Comprehensive Testing** - Covers functional, regression, and edge cases

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   # Kill process using port 3000
   lsof -ti:3000 | xargs kill -9
   ```

2. **Module not found errors**:
   ```bash
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **TypeScript errors**:
   ```bash
   # Check TypeScript configuration
   npx tsc --noEmit
   ```

### Development Notes

- The application uses Vite's proxy to serve both frontend and backend on the same port (3000)
- Hot module replacement is enabled for both frontend and backend changes
- The backend uses in-memory storage by default (suitable for development)
- All API requests are automatically proxied from frontend to backend

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the project structure and API documentation
- Ensure all prerequisites are installed correctly

---


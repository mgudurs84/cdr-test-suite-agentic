// Application configuration
export const config = {
  // Mock data flag - set to false when backend agents are ready
  useMockData: true,
  
  // API endpoints
  apiEndpoints: {
    generateTestCases: '/api/generate_test_cases',
    generatePytest: '/api/generate_pytest',
    pushToGitHub: '/api/push_pytest_to_github',
  },
} as const;

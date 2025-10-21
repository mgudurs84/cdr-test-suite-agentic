from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncio
import json
import logging
import re

from invoke_sdk import ExternalFHIRAgentAccess

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class TestCaseRequest(BaseModel):
    csv_mapping: str
    batch_number: str = "001"
    user_id: str = "external_client"

def extract_test_cases_simple(text):
    """Simple but effective test case extraction using known patterns"""
    test_cases = []
    
    # Look for all TestCaseID entries and extract the content between them
    testcase_pattern = r'"TestCaseID"\s*:\s*"([^"]+)"'
    testcase_matches = list(re.finditer(testcase_pattern, text))
    
    logger.info(f"Found {len(testcase_matches)} TestCaseID patterns")
    
    for i, match in enumerate(testcase_matches):
        try:
            start_pos = match.start()
            
            # Find the end position (next TestCaseID or end of text)
            if i + 1 < len(testcase_matches):
                end_pos = testcase_matches[i + 1].start()
            else:
                # Last test case - find end of StatisticalSummary or end of text
                end_pos = len(text)
                stats_match = text.find('"StatisticalSummary"', start_pos)
                if stats_match > start_pos:
                    end_pos = stats_match
            
            # Extract the test case block
            block = text[start_pos:end_pos].strip()
            
            # Clean up the block to make it valid JSON
            if not block.startswith('{'):
                # Find the opening brace or add one
                brace_pos = block.find('{')
                if brace_pos > 0:
                    block = block[brace_pos:]
                else:
                    block = '{\n  ' + block
            
            # Remove trailing comma and ensure proper closing
            block = block.rstrip().rstrip(',')
            if not block.endswith('}'):
                block += '\n}'
            
            # Clean up common formatting issues
            block = re.sub(r',(\s*})', r'\1', block)  # Remove trailing commas before }
            
            # Try to parse as JSON
            test_case = json.loads(block)
            
            # Validate it has required fields
            required_fields = ['TestCaseID', 'TestDescription', 'ExpectedOutput']
            if all(field in test_case for field in required_fields):
                test_cases.append(test_case)
            
        except (json.JSONDecodeError, Exception) as e:
            logger.debug(f"Failed to parse test case {i+1}: {e}")
            
            # Try alternative parsing for this block
            try:
                testcase_id = match.group(1)
                
                # Extract individual fields using regex
                desc_match = re.search(r'"TestDescription"\s*:\s*"([^"]*)"', block)
                output_match = re.search(r'"ExpectedOutput"\s*:\s*"([^"]*)"', block)
                steps_match = re.search(r'"TestSteps"\s*:\s*\[(.*?)\]', block, re.DOTALL)
                criteria_match = re.search(r'"PassFailCriteria"\s*:\s*"([^"]*)"', block)
                type_match = re.search(r'"TestCaseType"\s*:\s*"([^"]*)"', block)
                subtype_match = re.search(r'"Subtype"\s*:\s*"([^"]*)"', block)
                
                # Create test case from extracted parts
                alt_test_case = {
                    "TestCaseID": testcase_id,
                    "TestDescription": desc_match.group(1) if desc_match else f"Test case {testcase_id}",
                    "ExpectedOutput": output_match.group(1) if output_match else "Expected output",
                    "PassFailCriteria": criteria_match.group(1) if criteria_match else "Test validation criteria",
                    "TestCaseType": type_match.group(1) if type_match else "FUNCTIONAL",
                    "Subtype": subtype_match.group(1) if subtype_match else "POSITIVE"
                }
                
                # Parse steps array if found
                if steps_match:
                    steps_text = steps_match.group(1)
                    steps = re.findall(r'"([^"]*)"', steps_text)
                    alt_test_case["TestSteps"] = steps
                else:
                    alt_test_case["TestSteps"] = ["Execute test case", "Verify results"]
                
                test_cases.append(alt_test_case)
                logger.debug(f"Successfully extracted test case using alternative method: {testcase_id}")
                
            except Exception as e2:
                logger.debug(f"Alternative parsing also failed for test case {i+1}: {e2}")
                continue
    
    logger.info(f"Successfully extracted {len(test_cases)} test cases")
    return test_cases

@app.post("/generate_test_cases")
async def generate_test_cases(request: TestCaseRequest):
    logger.info(f"Received request for batch {request.batch_number}")
    
    client = ExternalFHIRAgentAccess(
        project_id="vertex-ai-demo-468112",
        location="us-central1"
    )
    
    try:
        logger.info("Calling Vertex AI agent...")
        raw_result = await client.generate_test_cases(
            csv_mapping=request.csv_mapping,
            batch_number=request.batch_number,
            user_id=request.user_id
        )
        
        if not raw_result:
            raise HTTPException(status_code=500, detail="No response from Vertex AI agent")
        
        logger.info(f"Raw result length: {len(raw_result)} characters")
        
        # Clean the response
        cleaned_response = client.clean_json_response(raw_result)
        logger.info(f"Cleaned response length: {len(cleaned_response)} characters")
        
        # Save debug files
        with open("debug_raw_latest.txt", "w", encoding='utf-8') as f:
            f.write(raw_result)
        with open("debug_cleaned_latest.txt", "w", encoding='utf-8') as f:
            f.write(cleaned_response)
        
        # Try direct JSON parsing first
        try:
            result = json.loads(cleaned_response)
            if "TestCases" in result and len(result["TestCases"]) > 1:
                logger.info(f"✅ Direct parsing successful: {len(result['TestCases'])} test cases")
                return result
        except json.JSONDecodeError as e:
            logger.info(f"Direct JSON parsing failed: {e}")
        
        # Use pattern-based extraction
        logger.info("🔧 Using pattern-based test case extraction...")
        test_cases = extract_test_cases_simple(cleaned_response)
        
        if test_cases:
            # Generate statistics
            type_counts = {}
            subtype_counts = {}
            
            for tc in test_cases:
                tc_type = tc.get("TestCaseType", "FUNCTIONAL")
                subtype = tc.get("Subtype", "POSITIVE")
                type_counts[tc_type] = type_counts.get(tc_type, 0) + 1
                subtype_counts[subtype] = subtype_counts.get(subtype, 0) + 1
            
            result = {
                "TestCases": test_cases,
                "StatisticalSummary": {
                    "TotalTestCases": len(test_cases),
                    "MappingRows": len(test_cases) // 3,
                    "UniqueAttributes": len(test_cases) // 3,
                    "TestCaseTypeBreakdown": type_counts,
                    "SubtypeBreakdown": subtype_counts
                }
            }
            
            # Save final result
            with open("debug_final_result.json", "w", encoding='utf-8') as f:
                json.dump(result, f, indent=2)
            
            logger.info(f"✅ Successfully extracted and formatted {len(test_cases)} test cases!")
            return result
        else:
            logger.error("❌ Could not extract any test cases from the response")
            raise HTTPException(status_code=500, detail="Failed to extract test cases from response")
            
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "Final FastAPI FHIR Test Case Generator"}

@app.get("/")
async def root():
    return {"message": "Final FastAPI FHIR Test Case Generator is running!"}
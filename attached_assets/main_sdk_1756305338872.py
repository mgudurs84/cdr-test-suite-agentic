from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncio

# Import your agent access class from invoke_sdk.py
from invoke_sdk import ExternalFHIRAgentAccess

app = FastAPI()

class TestCaseRequest(BaseModel):
    csv_mapping: str
    batch_number: str = "001"
    user_id: str = "external_client"

@app.post("/generate_test_cases")
async def generate_test_cases(request: TestCaseRequest):
    client = ExternalFHIRAgentAccess(
        project_id="vertex-ai-demo-468112",  # Replace as needed
        location="us-central1"
    )
    try:
        # Call the async method and wait for result
        raw_result = await client.generate_test_cases(
            csv_mapping=request.csv_mapping,
            batch_number=request.batch_number,
            user_id=request.user_id
        )
        if not raw_result:
            raise HTTPException(status_code=500, detail="Failed to generate test cases")
        processed = client.process_and_save_results(raw_result)
        return processed if processed else {"status": "error"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

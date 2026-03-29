from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from auth_verify import verify_firebase_token
from app.routes.report import router as report_router

app = FastAPI(title="Thooimai AI API")

app.include_router(report_router, prefix="/api/v1")

# Setup CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "ok", "service": "Thooimai AI API"}

# Example of a PROTECTED route using Firebase Token Verification
@app.get("/api/v1/protected-data")
async def get_protected_data(user_token: dict = Depends(verify_firebase_token)):
    """
    This endpoint requires a valid Firebase ID Token from the frontend.
    The `user_token` dictionary contains the decoded JWT data (e.g., uid, email).
    """
    firebase_uid = user_token.get("uid")
    email = user_token.get("email")
    phone = user_token.get("phone_number")
    
    # In a real app, you would use this firebase_uid to perform operations 
    # securely or interact with Supabase on the backend if needed.
    
    return {
        "message": "Authentication successful!",
        "user_data": {
            "firebase_uid": firebase_uid,
            "email": email,
            "phone": phone
        }
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

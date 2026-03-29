import os
from fastapi import HTTPException, status, Header
from jose import jwt, JWTError

# Supabase JWT Secret (found in Supabase Dashboard -> Project Settings -> API)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

async def verify_firebase_token(authorization: str = Header(None)):
    """
    Middleware/Dependency to verify Supabase JWT Token sent from the frontend.
    Expects header: "Authorization: Bearer <token>"
    Note: Function kept named `verify_firebase_token` to avoid breaking other imports, 
    but it now verifies Supabase tokens.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header"
        )
    
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET is not set in environment variables."
        )

    token = authorization.split("Bearer ")[1]
    
    try:
        # Verify the token against Supabase JWT secret
        # Supabase uses HS256 for signing its JWTs
        decoded_token = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=["HS256"], 
            options={"verify_aud": False} 
        )
        # `decoded_token` will contain standard JWT claims (sub, email, etc.)
        # `sub` is the user id. To keep compatibility if other code expects `uid`:
        if "uid" not in decoded_token and "sub" in decoded_token:
            decoded_token["uid"] = decoded_token["sub"]
            
        return decoded_token
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {str(e)}"
        )

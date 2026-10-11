from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models.models import User
from app.schemas.schemas import LoginRequest, Token, UserResponse, UserCreate
from app.core.security import verify_password, get_password_hash, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.email == payload.badgeOrEmail) | (User.badge_number == payload.badgeOrEmail)
    ).first()

    if not user:
        # Create standard duty user profile if not exists
        role = payload.role or "operator"
        hashed_pw = get_password_hash(payload.password)
        user = User(
            email=payload.badgeOrEmail if "@" in payload.badgeOrEmail else f"{payload.badgeOrEmail}@ibvap.gov.in",
            badge_number=payload.badgeOrEmail if "@" not in payload.badgeOrEmail else f"BSF-{payload.badgeOrEmail[:6]}",
            hashed_password=hashed_pw,
            role=role,
            name=f"{role.capitalize()} Console User",
            unit="Border Surveillance Unit"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect badge number/email or passcode"
        )

    token = create_access_token({"sub": user.id, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "badgeNumber": user.badge_number,
            "role": user.role,
            "name": user.name,
            "unit": user.unit,
            "permissions": ["view_feeds", "ptz_control", "acknowledge_alerts", "tag_evidence"]
        }
    }

@router.post("/logout")
def logout():
    return {"message": "Logged out successfully"}

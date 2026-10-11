from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.services.watchlist_service import WatchlistService
from app.schemas.schemas import WatchlistResponse, WatchlistCreate

router = APIRouter(prefix="/watchlist", tags=["Watchlist"])

@router.get("", response_model=List[WatchlistResponse])
def list_watchlist(db: Session = Depends(get_db)):
    return WatchlistService.get_all(db)

@router.post("", response_model=WatchlistResponse, status_code=status.HTTP_201_CREATED)
def create_watchlist_entry(payload: WatchlistCreate, db: Session = Depends(get_db)):
    return WatchlistService.create(db, payload)

@router.delete("/{watchlist_id}")
def delete_watchlist_entry(watchlist_id: str, db: Session = Depends(get_db)):
    deleted = WatchlistService.delete(db, watchlist_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Watchlist entry '{watchlist_id}' not found.")
    return {"message": "Watchlist entry removed successfully"}

from typing import List, Optional
from sqlalchemy.orm import Session
from app.db.models.models import Watchlist
from app.schemas.schemas import WatchlistCreate

class WatchlistService:
    @staticmethod
    def get_all(db: Session) -> List[Watchlist]:
        return db.query(Watchlist).all()

    @staticmethod
    def create(db: Session, item_in: WatchlistCreate) -> Watchlist:
        item = Watchlist(
            type=item_in.type,
            value=item_in.value.upper(),
            description=item_in.description
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def delete(db: Session, watchlist_id: str) -> bool:
        item = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
        if item:
            db.delete(item)
            db.commit()
            return True
        return False

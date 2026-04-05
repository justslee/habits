"""Shared FastAPI dependencies."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User


def get_current_user(db: Session = Depends(get_db)) -> User:
    """Get the default user. Raises 404 if no user exists."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user

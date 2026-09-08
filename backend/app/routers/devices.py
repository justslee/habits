"""Device registration for server-initiated push notifications.

POST /api/v1/devices        upsert this phone's Expo push token
GET  /api/v1/devices        list registered devices
DELETE /api/v1/devices/{id} forget a device
"""

from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.device import PushDevice
from app.models.user import User

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


class DeviceRegister(BaseModel):
    expo_push_token: str = Field(min_length=10, max_length=255)
    platform: str | None = Field(default=None, max_length=20)
    app_version: str | None = Field(default=None, max_length=40)
    build_number: str | None = Field(default=None, max_length=20)
    device_name: str | None = Field(default=None, max_length=100)


class DeviceOut(BaseModel):
    id: int
    platform: str | None
    app_version: str | None
    build_number: str | None
    device_name: str | None
    last_seen_at: datetime.datetime

    model_config = {"from_attributes": True}


def _current_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


@router.post("", response_model=DeviceOut, status_code=200)
@router.post("/", response_model=DeviceOut, status_code=200, include_in_schema=False)
def register_device(payload: DeviceRegister, db: Session = Depends(get_db)):
    """Create or refresh the device row for this push token (idempotent)."""
    user = _current_user(db)
    now = datetime.datetime.utcnow()
    device = (
        db.query(PushDevice)
        .filter(PushDevice.expo_push_token == payload.expo_push_token)
        .first()
    )
    if device is None:
        device = PushDevice(
            user_id=user.id, expo_push_token=payload.expo_push_token, last_seen_at=now
        )
        db.add(device)
    device.user_id = user.id
    device.platform = payload.platform
    device.app_version = payload.app_version
    device.build_number = payload.build_number
    device.device_name = payload.device_name
    device.last_seen_at = now
    db.commit()
    db.refresh(device)
    return device


@router.get("", response_model=list[DeviceOut])
@router.get("/", response_model=list[DeviceOut], include_in_schema=False)
def list_devices(db: Session = Depends(get_db)):
    user = _current_user(db)
    return (
        db.query(PushDevice)
        .filter(PushDevice.user_id == user.id)
        .order_by(PushDevice.last_seen_at.desc())
        .all()
    )


@router.delete("/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db)):
    device = db.query(PushDevice).filter(PushDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()
    return {"deleted": True, "id": device_id}

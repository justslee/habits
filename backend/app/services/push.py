"""Server-initiated push notifications via the Expo push service.

Sends to every device registered through /api/v1/devices. Tokens Expo reports as
`DeviceNotRegistered` are deleted so the table self-cleans.

    await send_push(db, user_id, title="Cart ready", body="…", data={"screen": "Approvals"})
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.device import PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push(
    db: Session,
    user_id: int,
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    sound: str | None = "default",
) -> int:
    """Push to all of a user's devices. Returns the number of accepted messages."""
    devices = db.query(PushDevice).filter(PushDevice.user_id == user_id).all()
    if not devices:
        return 0

    messages = [
        {
            "to": d.expo_push_token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": sound,
        }
        for d in devices
    ]
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
            resp.raise_for_status()
            tickets = resp.json().get("data", [])
    except Exception as e:  # noqa: BLE001 — pushes are best-effort
        logger.warning("push send failed: %s", e)
        return 0

    accepted = 0
    for device, ticket in zip(devices, tickets):
        if ticket.get("status") == "ok":
            accepted += 1
            continue
        err = (ticket.get("details") or {}).get("error")
        if err == "DeviceNotRegistered":
            logger.info(
                "push token no longer registered, forgetting device %s", device.id
            )
            db.delete(device)
    if accepted != len(devices):
        db.commit()
    return accepted

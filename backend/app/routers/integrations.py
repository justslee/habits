"""Third-party integration OAuth endpoints (Whoop today; Strava-ready).

Opt-in per-user connect flow:
  GET  /api/v1/integrations/{provider}/authorize  -> redirect to provider consent
  GET  /api/v1/integrations/{provider}/callback    -> exchange code, store tokens
  GET  /api/v1/integrations/status                  -> {"whoop": bool}
  DELETE /api/v1/integrations/{provider}            -> disconnect
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.services import oauth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


def _current_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


@router.get("/status")
def integration_status(db: Session = Depends(get_db)):
    """Which integrations the current user has connected."""
    user = db.query(User).first()
    if not user:
        return {"whoop": False}
    return {"whoop": oauth.is_connected(db, user.id, "whoop")}


@router.get("/{provider}/authorize")
def authorize(provider: str, db: Session = Depends(get_db)):
    """Redirect the user to the provider's consent screen."""
    if not oauth.is_supported(provider):
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    user = _current_user(db)
    try:
        url = oauth.authorize_url(provider, state=str(user.id))
    except oauth.OAuthError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return RedirectResponse(url)


@router.get("/{provider}/callback")
async def callback(
    provider: str,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    db: Session = Depends(get_db),
):
    """OAuth redirect target: exchange the code and persist the user's tokens."""
    if not oauth.is_supported(provider):
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    if error:
        return HTMLResponse(_result_page(provider, ok=False, detail=error), status_code=400)
    if not code:
        return HTMLResponse(_result_page(provider, ok=False, detail="Missing authorization code"), status_code=400)

    # state carries the user id (single-user today; multi-user ready).
    user = None
    if state and state.isdigit():
        user = db.query(User).filter(User.id == int(state)).first()
    if user is None:
        user = _current_user(db)

    try:
        token = await oauth.exchange_code(provider, code)
        oauth.save_connection(db, user.id, provider, token)
    except oauth.OAuthError as e:
        logger.warning("OAuth callback failed for %s: %s", provider, e)
        return HTMLResponse(_result_page(provider, ok=False, detail=str(e)), status_code=502)

    return HTMLResponse(_result_page(provider, ok=True))


@router.delete("/{provider}")
def disconnect(provider: str, db: Session = Depends(get_db)):
    """Disconnect a provider for the current user."""
    if not oauth.is_supported(provider):
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    user = _current_user(db)
    removed = oauth.disconnect(db, user.id, provider)
    return {"disconnected": removed, "provider": provider}


def _result_page(provider: str, *, ok: bool, detail: str = "") -> str:
    title = f"{provider.title()} connected" if ok else f"{provider.title()} connection failed"
    body = (
        "You're all set. You can close this window and return to the app."
        if ok
        else f"Something went wrong: {detail}. You can close this window and try again."
    )
    color = "#10B981" if ok else "#E27A6E"
    return f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title></head>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#0F0F18;color:#EFEFF5;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px">
<div><div style="font-size:40px;margin-bottom:12px">{'✅' if ok else '⚠️'}</div>
<h2 style="color:{color};margin:0 0 8px">{title}</h2>
<p style="color:#B8B8CB;max-width:340px">{body}</p></div></body></html>"""

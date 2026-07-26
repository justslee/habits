"""Generic per-user OAuth 2.0 helper (authorize URL, code exchange, refresh).

Provider-agnostic so Whoop today and Strava later share one implementation.
Client credentials are app-level (env / AWS Secrets Manager); per-user access &
refresh tokens are persisted in the OAuthConnection table.
"""

from __future__ import annotations

import datetime
import logging
import os
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.models.integration import OAuthConnection

logger = logging.getLogger(__name__)


class OAuthError(Exception):
    pass


# Per-provider config. `scopes` is space-delimited per the OAuth spec.
PROVIDERS: dict[str, dict[str, Any]] = {
    "whoop": {
        "authorize_url": "https://api.prod.whoop.com/oauth/oauth2/auth",
        "token_url": "https://api.prod.whoop.com/oauth/oauth2/token",
        "scopes": "read:recovery read:cycles read:sleep read:workout read:profile offline",
        "client_id_env": "WHOOP_CLIENT_ID",
        "client_secret_env": "WHOOP_CLIENT_SECRET",
    },
}


def is_supported(provider: str) -> bool:
    return provider in PROVIDERS


def _config(provider: str) -> dict[str, Any]:
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise OAuthError(f"Unknown provider: {provider}")
    return cfg


def _client_creds(provider: str) -> tuple[str, str]:
    cfg = _config(provider)
    cid = os.getenv(cfg["client_id_env"])
    secret = os.getenv(cfg["client_secret_env"])
    if not cid or not secret:
        raise OAuthError(f"Missing client credentials for {provider}")
    return cid, secret


def redirect_uri(provider: str) -> str:
    """The provider-registered callback (must match the app's registered URI)."""
    base = os.getenv("OAUTH_REDIRECT_BASE", "http://localhost:8000").rstrip("/")
    return f"{base}/api/v1/integrations/{provider}/callback"


def authorize_url(provider: str, state: str) -> str:
    cfg = _config(provider)
    cid, _ = _client_creds(provider)
    params = {
        "client_id": cid,
        "redirect_uri": redirect_uri(provider),
        "response_type": "code",
        "scope": cfg["scopes"],
        "state": state,
    }
    return f"{cfg['authorize_url']}?{urlencode(params)}"


async def _token_request(provider: str, data: dict[str, str]) -> dict[str, Any]:
    cfg = _config(provider)
    cid, secret = _client_creds(provider)
    data = {**data, "client_id": cid, "client_secret": secret}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(cfg["token_url"], data=data)
    if resp.status_code != 200:
        raise OAuthError(f"{provider} token request failed ({resp.status_code}): {resp.text[:200]}")
    return resp.json()


async def exchange_code(provider: str, code: str) -> dict[str, Any]:
    return await _token_request(provider, {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri(provider),
    })


async def _refresh(provider: str, refresh_token: str) -> dict[str, Any]:
    return await _token_request(provider, {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })


def _expires_at(token: dict[str, Any]) -> Optional[datetime.datetime]:
    exp = token.get("expires_in")
    if exp is None:
        return None
    return datetime.datetime.utcnow() + datetime.timedelta(seconds=int(exp))


def save_connection(db: Session, user_id: int, provider: str, token: dict[str, Any]) -> OAuthConnection:
    """Upsert the user's connection from a token response."""
    conn = get_connection(db, user_id, provider)
    now = datetime.datetime.utcnow()
    if conn is None:
        conn = OAuthConnection(user_id=user_id, provider=provider, connected_at=now, access_token="")
        db.add(conn)
    conn.access_token = token["access_token"]
    if token.get("refresh_token"):
        conn.refresh_token = token["refresh_token"]
    conn.expires_at = _expires_at(token)
    conn.scope = token.get("scope")
    db.commit()
    db.refresh(conn)
    return conn


def get_connection(db: Session, user_id: int, provider: str) -> Optional[OAuthConnection]:
    return (
        db.query(OAuthConnection)
        .filter(OAuthConnection.user_id == user_id, OAuthConnection.provider == provider)
        .first()
    )


def is_connected(db: Session, user_id: int, provider: str) -> bool:
    return get_connection(db, user_id, provider) is not None


def disconnect(db: Session, user_id: int, provider: str) -> bool:
    conn = get_connection(db, user_id, provider)
    if not conn:
        return False
    db.delete(conn)
    db.commit()
    return True


async def valid_access_token(db: Session, user_id: int, provider: str) -> Optional[str]:
    """Return a fresh access token, refreshing if expired. None if not connected."""
    conn = get_connection(db, user_id, provider)
    if not conn:
        return None
    expired = conn.expires_at is not None and datetime.datetime.utcnow() >= (
        conn.expires_at - datetime.timedelta(seconds=60)
    )
    if expired and conn.refresh_token:
        token = await _refresh(provider, conn.refresh_token)
        conn = save_connection(db, user_id, provider, token)
    return conn.access_token


async def refresh_and_store(db: Session, user_id: int, provider: str) -> Optional[str]:
    """Force a refresh (used after a 401). Returns the new access token or None."""
    conn = get_connection(db, user_id, provider)
    if not conn or not conn.refresh_token:
        return None
    token = await _refresh(provider, conn.refresh_token)
    conn = save_connection(db, user_id, provider, token)
    return conn.access_token

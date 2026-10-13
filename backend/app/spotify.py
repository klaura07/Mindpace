"""Spotify PKCE linking. Tokens stay in server memory, bound to the app login session.

Restarting this single-process local server requires reconnecting Spotify.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.auth import COOKIE_NAME, current_user, token_hash

router = APIRouter(prefix="/spotify", tags=["spotify"])
_pending = {}
_connections = {}
_lock = threading.RLock()


def _config():
    client_id = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
    redirect = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:5173/spotify-callback.html").strip()
    parsed = urllib.parse.urlsplit(redirect)
    if not re.fullmatch(r"[a-zA-Z0-9]{32}", client_id):
        raise HTTPException(503, "Spotify connection has not been configured yet.")
    if (parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "::1"})) or parsed.username or parsed.query or parsed.fragment:
        raise HTTPException(503, "Spotify redirect address needs to be configured by the app owner.")
    return client_id, redirect


def _session(request):
    return token_hash(request.cookies.get(COOKIE_NAME, ""))


def _prune():
    now = time.time()
    for store, field in ((_pending, "deadline"), (_connections, "deadline")):
        for key, value in list(store.items()):
            if value[field] <= now:
                store.pop(key, None)


def _request(url, *, data=None, token=None, method=None, payload=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        data = urllib.parse.urlencode(data).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=20) as response:
            raw = response.read()
            result = json.loads(raw) if raw else {}
        if not isinstance(result, dict):
            raise ValueError("Invalid response")
        return result
    except urllib.error.HTTPError as exc:
        if exc.code in {400, 401}:
            raise HTTPException(409, "Spotify authorization expired or was rejected. Please reconnect.") from None
        if exc.code == 403:
            raise HTTPException(403, "Spotify denied access. Playback controls require Premium. Reconnect to allow playback access; the app owner may also need to add your account to the allowed users.") from None
        if exc.code == 404:
            raise HTTPException(404, "Open Spotify on your phone, desktop, or web player and play a song there, then try again here.") from None
        if exc.code == 429:
            raise HTTPException(429, "Spotify is receiving too many requests. Please try again later.") from None
        raise HTTPException(502, "Spotify is temporarily unavailable. Please try again.") from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise HTTPException(502, "Could not reach Spotify. Please try again.") from None


def _store_tokens(key, result, previous=None):
    access = result.get("access_token")
    refresh = result.get("refresh_token") or (previous or {}).get("refresh_token")
    lifetime = result.get("expires_in")
    if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh or not isinstance(lifetime, (int, float)) or lifetime <= 0:
        raise HTTPException(502, "Spotify returned an incomplete authorization. Please reconnect.")
    _connections[key] = {"access_token": access, "refresh_token": refresh,
                         "expires_at": time.time() + lifetime - 60,
                         "deadline": (previous or {}).get("deadline", time.time() + 7 * 86400)}


@router.get("/status")
def status(request: Request, user: dict = Depends(current_user)):
    try:
        _, redirect = _config()
    except HTTPException:
        return {"configured": False, "connected": False}
    with _lock:
        _prune()
        return {"configured": True, "connected": _session(request) in _connections, "redirect_uri": redirect}


@router.post("/connect")
def connect(request: Request, user: dict = Depends(current_user)):
    client_id, redirect = _config()
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    with _lock:
        _prune()
        key = _session(request)
        for old_state, value in list(_pending.items()):
            if value["session"] == key:
                _pending.pop(old_state)
        _pending[state] = {"session": key, "verifier": verifier, "deadline": time.time() + 600, "redirect": redirect, "client_id": client_id}
    query = urllib.parse.urlencode({"client_id": client_id, "response_type": "code", "redirect_uri": redirect,
        "scope": "playlist-read-private playlist-read-collaborative user-library-read user-read-playback-state user-modify-playback-state", "state": state,
        "code_challenge_method": "S256", "code_challenge": challenge, "show_dialog": "true"})
    return {"authorize_url": "https://accounts.spotify.com/authorize?" + query, "state": state, "redirect_uri": redirect}


class Complete(BaseModel):
    state: str = Field(min_length=20, max_length=200)
    code: str = Field(min_length=1, max_length=4096)


@router.post("/complete")
def complete(body: Complete, request: Request, user: dict = Depends(current_user)):
    key = _session(request)
    with _lock:
        _prune()
        pending = _pending.get(body.state)
        if not pending or not secrets.compare_digest(pending["session"], key):
            raise HTTPException(400, "Spotify login could not be verified. Please connect again.")
        _pending.pop(body.state)
        result = _request("https://accounts.spotify.com/api/token", data={"grant_type": "authorization_code",
            "code": body.code, "redirect_uri": pending["redirect"], "client_id": pending["client_id"], "code_verifier": pending["verifier"]})
        _store_tokens(key, result)
    return {"connected": True}


@router.delete("/connection", status_code=204)
def disconnect(request: Request, user: dict = Depends(current_user)):
    with _lock:
        key = _session(request)
        _connections.pop(key, None)
        for state, value in list(_pending.items()):
            if value["session"] == key:
                _pending.pop(state)


def _access_token(request):
    key = _session(request)
    with _lock:
        _prune()
        connection = _connections.get(key)
        if not connection:
            raise HTTPException(409, "Connect your Spotify account to choose music.")
        if connection["expires_at"] <= time.time():
            client_id, _ = _config()
            try:
                result = _request("https://accounts.spotify.com/api/token", data={"grant_type": "refresh_token",
                    "refresh_token": connection["refresh_token"], "client_id": client_id})
                _store_tokens(key, result, connection)
            except HTTPException as exc:
                if exc.status_code == 409:
                    _connections.pop(key, None)
                raise
        return _connections[key]["access_token"]


def _api(request, path, **kwargs):
    token = _access_token(request)
    try:
        return _request(f"https://api.spotify.com/v1/{path}", token=token, **kwargs)
    except HTTPException as exc:
        if exc.status_code == 409:
            with _lock:
                _connections.pop(_session(request), None)
        raise


@router.get("/library")
def library(request: Request, kind: Literal["playlists", "tracks"] = "playlists",
            offset: int = Query(default=0, ge=0, le=100000), user: dict = Depends(current_user)):
    result = _api(request, f"me/{kind}?limit=20&offset={offset}")
    items = []
    for item in result.get("items", []):
        value = item.get("track") if kind == "tracks" and isinstance(item, dict) else item
        if not isinstance(value, dict) or not re.fullmatch(r"[a-zA-Z0-9]{22}", value.get("id") or ""):
            continue
        items.append({"id": value["id"], "name": value.get("name") or "Untitled",
                      "type": "track" if kind == "tracks" else "playlist",
                      "subtitle": ", ".join(a.get("name", "") for a in value.get("artists", [])) if kind == "tracks" else (value.get("owner") or {}).get("display_name", "")})
    return {"items": items, "next_offset": offset + 20 if result.get("next") else None}


@router.get("/search")
def search(request: Request, q: str = Query(min_length=1, max_length=200),
           kind: Literal["track", "playlist"] = "track",
           offset: int = Query(default=0, ge=0, le=990), user: dict = Depends(current_user)):
    if not q.strip():
        raise HTTPException(422, "Enter a song, artist, or playlist name.")
    query = urllib.parse.urlencode({"q": q.strip(), "type": kind, "limit": 10, "offset": offset})
    result = _api(request, f"search?{query}").get(f"{kind}s") or {}
    items = []
    for value in result.get("items", []):
        if not isinstance(value, dict) or not re.fullmatch(r"[a-zA-Z0-9]{22}", value.get("id") or ""):
            continue
        items.append({"id": value["id"], "name": value.get("name") or "Untitled", "type": kind,
                      "subtitle": ", ".join(a.get("name", "") for a in value.get("artists", [])) if kind == "track" else (value.get("owner") or {}).get("display_name", "")})
    return {"items": items, "next_offset": offset + 10 if result.get("next") and offset < 990 else None}


@router.get("/playback")
def playback(request: Request, user: dict = Depends(current_user)):
    result = _api(request, "me/player")
    item = result.get("item") or {}
    device = result.get("device") or {}
    return {"active": bool(device), "playing": bool(result.get("is_playing")),
            "shuffle": bool(result.get("shuffle_state")), "device": device.get("name"),
            "restricted": bool(device.get("is_restricted")),
            "disallows": (result.get("actions") or {}).get("disallows", {}),
            "track": {"name": item.get("name"), "subtitle": ", ".join(a.get("name", "") for a in item.get("artists", []))} if item else None}


class PlaybackCommand(BaseModel):
    action: Literal["play", "pause", "previous", "next", "shuffle"]
    uri: str | None = Field(default=None, pattern=r"^spotify:(track|playlist):[a-zA-Z0-9]{22}$")
    shuffle: bool | None = None


@router.post("/playback", status_code=204)
def control(body: PlaybackCommand, request: Request, user: dict = Depends(current_user)):
    if body.action == "shuffle":
        if body.shuffle is None:
            raise HTTPException(422, "Choose whether shuffle should be on or off.")
        _api(request, f"me/player/shuffle?state={str(body.shuffle).lower()}", method="PUT")
    elif body.action == "play":
        payload = None
        if body.uri:
            payload = {"context_uri": body.uri} if body.uri.startswith("spotify:playlist:") else {"uris": [body.uri]}
        _api(request, "me/player/play", method="PUT", payload=payload)
    else:
        _api(request, f"me/player/{body.action}", method="POST" if body.action in {"previous", "next"} else "PUT")

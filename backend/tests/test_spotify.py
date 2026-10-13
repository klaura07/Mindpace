import base64
import hashlib
import time
from urllib.parse import parse_qs, urlsplit
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from app import spotify
from test_auth import client, signup


@pytest.fixture(autouse=True)
def clean_spotify(monkeypatch):
    spotify._pending.clear()
    spotify._connections.clear()
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "a" * 32)
    monkeypatch.setenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:5173/spotify-callback.html")
    yield
    spotify._pending.clear()
    spotify._connections.clear()


def link(client, monkeypatch):
    signup(client)
    start = client.post("/spotify/connect").json()
    mock = Mock(return_value={"access_token": "private-access", "refresh_token": "private-refresh", "expires_in": 3600})
    monkeypatch.setattr(spotify, "_request", mock)
    response = client.post("/spotify/complete", json={"state": start["state"], "code": "one-use-code"})
    assert response.status_code == 200, response.text
    assert response.json() == {"connected": True}
    return mock, start


def test_pkce_connection_state_is_bound_to_login_and_single_use(client, monkeypatch):
    mock, start = link(client, monkeypatch)
    query = parse_qs(urlsplit(start["authorize_url"]).query)
    data = mock.call_args.kwargs["data"]
    assert query["code_challenge_method"] == ["S256"]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(data["code_verifier"].encode()).digest()).decode().rstrip("=")
    assert query["code_challenge"] == [challenge]
    assert query["redirect_uri"] == [data["redirect_uri"]]
    assert {"user-read-playback-state", "user-modify-playback-state"} <= set(query["scope"][0].split())
    assert "client_secret" not in data
    assert "token" not in str(client.get("/spotify/status").json())
    assert client.get("/spotify/status").json()["connected"] is True
    assert client.post("/spotify/complete", json={"state": start["state"], "code": "one-use-code"}).status_code == 400
    second = client.post("/spotify/connect").json()
    client.post("/auth/logout")
    signup(client, "other-spotify@example.com")
    assert client.get("/spotify/status").json()["connected"] is False
    assert client.post("/spotify/complete", json={"state": second["state"], "code": "stolen-state"}).status_code == 400
    assert client.get("/spotify/library").status_code == 409
    mock.assert_called_once()


def test_library_refresh_pagination_and_disconnect(client, monkeypatch):
    mock, _ = link(client, monkeypatch)
    connection = next(iter(spotify._connections.values()))
    connection["expires_at"] = 0
    mock.side_effect = [
        {"access_token": "refreshed-access", "expires_in": 3600},
        {"items": [{"id": "b" * 22, "name": "My rain", "owner": {"display_name": "Me"}}, None, {"id": "bad/path"}], "next": "next-page"},
        {"items": [{"track": {"id": "c" * 22, "name": "My song", "artists": [{"name": "Artist"}]}}, {"track": None}], "next": None},
    ]
    playlists = client.get("/spotify/library").json()
    assert playlists == {"items": [{"id": "b" * 22, "name": "My rain", "subtitle": "Me", "type": "playlist"}], "next_offset": 20}
    assert next(iter(spotify._connections.values()))["refresh_token"] == "private-refresh"
    assert mock.call_args.kwargs["token"] == "refreshed-access"
    tracks = client.get("/spotify/library?kind=tracks&offset=20").json()
    assert tracks["items"][0]["type"] == "track"
    assert tracks["items"][0]["subtitle"] == "Artist"
    assert tracks["next_offset"] is None
    assert mock.call_args.args[0] == "https://api.spotify.com/v1/me/tracks?limit=20&offset=20"
    assert client.delete("/spotify/connection").status_code == 204
    assert client.get("/spotify/status").json()["connected"] is False
    assert client.get("/spotify/library").status_code == 409


def test_missing_config_expired_state_auth_and_invalid_query(client, monkeypatch):
    assert client.post("/spotify/connect").status_code == 401
    signup(client)
    assert client.get("/spotify/library?kind=arbitrary").status_code == 422
    assert client.get("/spotify/library?offset=-1").status_code == 422
    start = client.post("/spotify/connect").json()
    spotify._pending[start["state"]]["deadline"] = time.time() - 1
    assert client.post("/spotify/complete", json={"state": start["state"], "code": "expired"}).status_code == 400
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "")
    assert client.get("/spotify/status").json() == {"configured": False, "connected": False}
    assert client.post("/spotify/connect").status_code == 503


def test_rejected_refresh_disconnects_and_does_not_expose_tokens(client, monkeypatch):
    mock, _ = link(client, monkeypatch)
    next(iter(spotify._connections.values()))["expires_at"] = 0
    mock.side_effect = HTTPException(409, "Please reconnect Spotify")
    response = client.get("/spotify/library")
    assert response.status_code == 409
    assert "private" not in response.text
    assert client.get("/spotify/status").json()["connected"] is False


def test_search_encodes_terms_paginates_and_filters_null_items(client, monkeypatch):
    mock, _ = link(client, monkeypatch)
    mock.return_value = {"tracks": {"items": [None, {"id": "x" * 22, "name": "Quiet", "artists": [{"name": "Artist"}]}], "next": "more"}}
    response = client.get("/spotify/search", params={"q": "rain & piano", "offset": 10})
    assert response.status_code == 200
    assert response.json()["items"][0]["subtitle"] == "Artist"
    assert response.json()["next_offset"] == 20
    query = parse_qs(urlsplit(mock.call_args.args[0]).query)
    assert query == {"q": ["rain & piano"], "type": ["track"], "limit": ["10"], "offset": ["10"]}
    assert client.get("/spotify/search?q=%20%20").status_code == 422
    assert client.get("/spotify/search?q=rain&kind=invalid").status_code == 422


def test_playback_commands_state_and_session_isolation(client, monkeypatch):
    mock, _ = link(client, monkeypatch)
    mock.return_value = {}
    playlist = "spotify:playlist:" + "a" * 22
    assert client.post("/spotify/playback", json={"action": "play", "uri": playlist}).status_code == 204
    assert mock.call_args.kwargs["payload"] == {"context_uri": playlist}
    track = "spotify:track:" + "b" * 22
    assert client.post("/spotify/playback", json={"action": "play", "uri": track}).status_code == 204
    assert mock.call_args.kwargs["payload"] == {"uris": [track]}
    for action, method in [("next", "POST"), ("previous", "POST"), ("pause", "PUT")]:
        assert client.post("/spotify/playback", json={"action": action}).status_code == 204
        assert mock.call_args.args[0].endswith("/" + action)
        assert mock.call_args.kwargs["method"] == method
    assert client.post("/spotify/playback", json={"action": "shuffle", "shuffle": True}).status_code == 204
    assert mock.call_args.args[0].endswith("shuffle?state=true")
    assert client.post("/spotify/playback", json={"action": "shuffle"}).status_code == 422
    assert client.post("/spotify/playback", json={"action": "play", "uri": "https://example.com"}).status_code == 422
    assert client.post("/spotify/playback", json={"action": "delete"}).status_code == 422
    mock.return_value = {"device": {"name": "My laptop"}, "is_playing": True, "shuffle_state": True,
                         "item": {"name": "Song", "artists": [{"name": "Artist"}]}, "actions": {"disallows": {"skipping_next": True}}}
    state = client.get("/spotify/playback").json()
    assert state["playing"] and state["shuffle"] and state["active"]
    assert state["track"] == {"name": "Song", "subtitle": "Artist"}
    assert state["disallows"]["skipping_next"]
    mock.return_value = {}
    assert client.get("/spotify/playback").json()["active"] is False
    client.post("/auth/logout")
    assert client.get("/spotify/playback").status_code == 401
    signup(client, "another-listener@example.com")
    assert client.post("/spotify/playback", json={"action": "next"}).status_code == 409
    assert client.get("/spotify/search?q=rain").status_code == 409


def test_spotify_http_empty_response_json_body_and_errors(monkeypatch):
    import io
    import json
    import urllib.error
    from unittest.mock import MagicMock
    response = MagicMock()
    response.__enter__.return_value.read.return_value = b""
    transport = Mock(return_value=response)
    monkeypatch.setattr(spotify.urllib.request, "urlopen", transport)
    assert spotify._request("https://api.spotify.com/v1/me/player/play", token="secret", method="PUT", payload={"uris": ["spotify:track:" + "a" * 22]}) == {}
    sent = transport.call_args.args[0]
    assert sent.get_method() == "PUT"
    assert json.loads(sent.data)["uris"][0].startswith("spotify:track:")
    for code, status in [(404, 404), (403, 403), (401, 409), (429, 429)]:
        transport.side_effect = urllib.error.HTTPError("https://api.spotify.com", code, "error", {}, io.BytesIO(b"private-token"))
        with pytest.raises(HTTPException) as error:
            spotify._request("https://api.spotify.com/v1/me/player", token="secret")
        assert error.value.status_code == status
        assert "private-token" not in error.value.detail

from app.rate_limit import RateLimiter


def test_allows_up_to_max_requests_then_blocks():
    rl = RateLimiter(max_requests=3, window_seconds=60)
    assert rl.check("a")[0] is True
    assert rl.check("a")[0] is True
    assert rl.check("a")[0] is True

    allowed, retry_after = rl.check("a")
    assert allowed is False
    assert retry_after > 0


def test_blocked_requests_do_not_consume_a_slot():
    rl = RateLimiter(max_requests=1, window_seconds=60)
    assert rl.check("a")[0] is True
    assert rl.check("a")[0] is False
    assert rl.check("a")[0] is False
    assert len(rl._hits["a"]) == 1


def test_different_keys_are_tracked_independently():
    rl = RateLimiter(max_requests=1, window_seconds=60)
    assert rl.check("a")[0] is True
    assert rl.check("b")[0] is True
    assert rl.check("a")[0] is False
    assert rl.check("b")[0] is False


def test_hits_expire_after_the_window(monkeypatch):
    rl = RateLimiter(max_requests=1, window_seconds=10)
    fake_time = [1000.0]
    monkeypatch.setattr("app.rate_limit.time.monotonic", lambda: fake_time[0])

    assert rl.check("a")[0] is True
    assert rl.check("a")[0] is False

    fake_time[0] += 10.01
    assert rl.check("a")[0] is True


def test_retry_after_reflects_time_left_in_window(monkeypatch):
    rl = RateLimiter(max_requests=1, window_seconds=10)
    fake_time = [1000.0]
    monkeypatch.setattr("app.rate_limit.time.monotonic", lambda: fake_time[0])

    rl.check("a")
    fake_time[0] += 4
    _, retry_after = rl.check("a")
    assert retry_after == 6

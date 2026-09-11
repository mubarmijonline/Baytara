"""What the OTP request actually carries to VdoCipher.

The rules are documented at docs/server/playbackauth/{ipgeo,whitelist}: `ipGeo` is an
object with an `allow` list of IPv4 addresses, `whitelisthref` a hostname pattern. Both
only matter if they really reach the wire, so the request body is captured here rather
than trusting the call site.
"""
import io
import json

import pytest

from app.services import video_provider
from app.services.video_provider import VdoCipherProvider, is_public_ipv4


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def sent(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout=10):
        calls.append(json.loads(req.data.decode()))
        return _Response(json.dumps({"otp": "o", "playbackInfo": "p"}).encode())

    monkeypatch.setattr(video_provider.urllib.request, "urlopen", fake_urlopen)
    return calls


def test_public_ipv4_is_pinned_and_hostname_rule_sent(sent):
    VdoCipherProvider(secret="s").issue_otp("vid", ip_address="8.8.8.8", whitelist_href="baytara.app")
    body = sent[0]
    assert body["ttl"] == 300
    assert body["ipGeo"] == {"allow": ["8.8.8.8"]}
    assert body["whitelisthref"] == "baytara.app"


def test_private_loopback_and_ipv6_addresses_are_not_pinned(sent):
    """A rule naming an address the licence server will never see refuses the play that was
    just allowed. Local dev behind nginx is 127.0.0.1; the rule set is IPv4-only anyway."""
    for addr in ("127.0.0.1", "10.0.0.5", "192.168.1.2", "2001:db8::1", "not-an-ip", None):
        VdoCipherProvider(secret="s").issue_otp("vid", ip_address=addr)
        assert "ipGeo" not in sent[-1], addr
    assert is_public_ipv4("8.8.8.8")
    assert not is_public_ipv4("203.0.113.9")   # TEST-NET-3, reserved
    assert not is_public_ipv4("::1")


def test_nothing_optional_is_sent_when_absent(sent):
    VdoCipherProvider(secret="s").issue_otp("vid")
    assert sent[0] == {"ttl": 300}

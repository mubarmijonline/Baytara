"""Claude reads a document and says whether it proves what it claims to prove.

The syndicate card has one fixed layout, so `vet_card.py` parses it with regexes and
the answer is deterministic. Everything else does not: a college ID from Cairo looks
nothing like one from Assiut, and next year's will look different again. There is no
pattern to write. So the judgement is handed to a model that can read the document and
say what it is, and the answer it gives is stored in full so a person can disagree
with it later.

Pure apart from the one API call: `build_request()` and `read_verdict()` are testable
offline, and `judge()` is the thin wrapper that talks to Anthropic — the same shape as
`instapay_ocr.py`.
"""
import base64
import json
import os

# Opus is the reading here, not a chat: a blurry phone photo of an Arabic student card
# is exactly the case where a cheaper model guesses.
MODEL = "claude-opus-5"
MAX_TOKENS = 4000

# What the model is allowed to answer. `strict` shapes are worth the schema: a free-text
# reply would need parsing, and a parser over model prose is the thing being avoided.
VERDICT_SCHEMA = {
    "type": "object",
    "properties": {
        "document_type": {
            "type": "string",
            "description": "What the document actually is, in English, e.g. "
                           "'Egyptian national ID card', 'veterinary college student ID', "
                           "'university enrolment certificate', 'unrelated photo'.",
        },
        "issuer": {
            "type": "string",
            "description": "The institution named on it, as printed. Empty string if none is legible.",
        },
        "holder_name": {"type": "string", "description": "Name as printed. Empty string if not legible."},
        "national_id": {
            "type": "string",
            "description": "The 14-digit Egyptian national ID printed on it, in ASCII digits. "
                           "Empty string if the document does not show one.",
        },
        "occupation": {
            "type": "string",
            "description": "The occupation/profession field (الوظيفة or المهنة) exactly as printed. "
                           "Empty string if the document has no such field.",
        },
        "occupation_is_veterinarian": {
            "type": "boolean",
            "description": "True only if the printed occupation means a qualified veterinarian "
                           "(طبيب بيطري and its spellings). A veterinary student is not.",
        },
        "is_veterinary_student": {
            "type": "boolean",
            "description": "True if this document shows its holder is currently enrolled in a "
                           "veterinary faculty (كلية الطب البيطري) at a named institution.",
        },
        "expired": {
            "type": "boolean",
            "description": "True if a printed expiry or academic year has clearly passed.",
        },
        "name_matches": {
            "type": "boolean",
            "description": "Whether the printed name is the same person as the expected name, "
                           "allowing for dropped middle names, transliteration and spelling variants.",
        },
        "tampered": {
            "type": "boolean",
            "description": "True if the image shows signs of editing: mismatched fonts, "
                           "misaligned text, cloned regions, a pasted photo.",
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
            "description": "How sure you are of the above. 'low' whenever the image is too "
                           "poor to read, or the document is one you cannot place.",
        },
        "reason": {
            "type": "string",
            "description": "One or two sentences in Arabic explaining the decision, written to be "
                           "shown to the applicant.",
        },
    },
    "required": ["document_type", "issuer", "holder_name", "national_id", "occupation",
                 "occupation_is_veterinarian", "is_veterinary_student", "expired",
                 "name_matches", "tampered", "confidence", "reason"],
    "additionalProperties": False,
}

SYSTEM = (
    "You verify documents for Baytara, an Egyptian veterinary education platform. "
    "Applicants upload a document to prove either that they are a licensed veterinarian "
    "or that they are a veterinary student, and you report what the document shows.\n\n"
    "You are a reader, not an approver. Report what is legible and nothing more. If the "
    "image is too dark, too blurry, cropped, or shows a document you cannot place, say so "
    "with low confidence — a wrong 'yes' admits someone who should not be here, and a "
    "wrong 'no' turns away a real applicant, so an honest 'I cannot tell' is the useful "
    "answer in both directions.\n\n"
    "Documents are Egyptian and mostly Arabic. Note two distinctions that decide the "
    "outcome: an occupation of طبيب بيطري on a national ID means a qualified veterinarian, "
    "whereas a student card from كلية الطب البيطري means a student and not a veterinarian. "
    "Egyptian names run to four parts and people routinely give fewer, so treat a shorter "
    "name, a different transliteration, or a spelling variant as the same person; treat a "
    "different first or family name as a different person."
)


def _block(image):
    """One image content block. `image` is (bytes, media_type)."""
    data, media_type = image
    return {"type": "image", "source": {
        "type": "base64", "media_type": media_type,
        "data": base64.standard_b64encode(data).decode("ascii"),
    }}


def build_request(images, expect):
    """The request body, built without touching the network so it can be tested.

    `images` is a list of (bytes, media_type). `expect` carries who the account says
    it is, so the model can compare rather than us comparing prose afterwards.
    """
    asked = [
        "Read the attached document" + (" (both sides)" if len(images) > 1 else "") + ".",
        "",
        "The account claims to belong to:",
        f"- name: {expect.get('name') or '(not given)'}",
        f"- national ID: {expect.get('national_id') or '(not given)'}",
        "",
        "Report what the document shows.",
    ]
    return {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM,
        "output_config": {"format": {"type": "json_schema", "schema": VERDICT_SCHEMA}},
        "messages": [{"role": "user", "content": [
            *[_block(image) for image in images],
            {"type": "text", "text": "\n".join(asked)},
        ]}],
    }


def read_verdict(response):
    """Pull the verdict out of a Messages response. Returns None if it refused."""
    if getattr(response, "stop_reason", None) == "refusal":
        return None
    for block in response.content:
        if block.type == "text":
            return json.loads(block.text)
    return None


def available():
    """Whether a judgement can be made at all. Without a key the caller falls back
    to manual review rather than failing the applicant."""
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def judge(images, expect):
    """Ask Claude what the document is. Returns the verdict dict, or None if the
    service is unavailable or declined — either way the request goes to a human."""
    if not available():
        return None
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(**build_request(images, expect))
    return read_verdict(response)


# ------------------------------- deciding on it -------------------------------

# The model reports; these rules decide. Kept apart so the policy is readable in one
# place and testable without a verdict ever having come from the API.

def decide(verdict, route, expect):
    """(grant, problem) — grant is 'baytarian', 'vet_student' or None.

    A None grant with a None problem means nobody could tell: it goes to an admin.
    """
    if verdict is None:
        return None, None
    if verdict.get("tampered"):
        return None, "looks_edited"
    if verdict.get("confidence") == "low":
        return None, None
    if verdict.get("expired"):
        return None, "expired"
    if not verdict.get("name_matches"):
        return None, "does_not_match_profile"

    claimed = (verdict.get("national_id") or "").strip()
    if claimed and expect.get("national_id") and claimed != expect["national_id"]:
        return None, "does_not_match_profile"

    if route == "national_id":
        if not claimed:
            # No national ID printed on it means it is not a national ID card.
            return None, "not_a_national_id"
        if verdict.get("occupation_is_veterinarian"):
            return "baytarian", None
        return None, "occupation_not_veterinarian"

    # Any other document: a student card, a faculty letter, an enrolment certificate.
    if verdict.get("occupation_is_veterinarian"):
        return "baytarian", None
    if verdict.get("is_veterinary_student"):
        return "vet_student", None
    return None, None      # not obviously either — let a person look


def demo():
    """Self-check: python -m app.services.doc_judge"""
    expect = {"name": "محمد غريب محمد خضر", "national_id": "27811291801536"}
    body = build_request([(b"\x89PNG", "image/png")], expect)
    assert body["model"] == MODEL
    assert body["output_config"]["format"]["schema"]["additionalProperties"] is False
    content = body["messages"][0]["content"]
    assert content[0]["type"] == "image" and content[0]["source"]["type"] == "base64"
    assert "27811291801536" in content[-1]["text"]

    def verdict(**over):
        base = {"document_type": "x", "issuer": "", "holder_name": "", "national_id": "",
                "occupation": "", "occupation_is_veterinarian": False,
                "is_veterinary_student": False, "expired": False, "name_matches": True,
                "tampered": False, "confidence": "high", "reason": ""}
        base.update(over)
        return base

    # national ID route: only a vet occupation grants, and only for this person
    assert decide(verdict(national_id="27811291801536", occupation_is_veterinarian=True),
                  "national_id", expect) == ("baytarian", None)
    assert decide(verdict(national_id="27811291801536"), "national_id", expect) == (
        None, "occupation_not_veterinarian")
    assert decide(verdict(national_id="10000000000000", occupation_is_veterinarian=True),
                  "national_id", expect) == (None, "does_not_match_profile")
    assert decide(verdict(occupation_is_veterinarian=True), "national_id", expect) == (
        None, "not_a_national_id")

    # other documents: student card grants the student tier, not the vet one
    assert decide(verdict(is_veterinary_student=True), "other", expect) == ("vet_student", None)
    assert decide(verdict(), "other", expect) == (None, None)          # unsure -> a person
    assert decide(verdict(confidence="low", is_veterinary_student=True),
                  "other", expect) == (None, None)
    assert decide(verdict(tampered=True, is_veterinary_student=True),
                  "other", expect) == (None, "looks_edited")
    assert decide(verdict(expired=True, is_veterinary_student=True),
                  "other", expect) == (None, "expired")
    assert decide(verdict(name_matches=False, is_veterinary_student=True),
                  "other", expect) == (None, "does_not_match_profile")
    assert decide(None, "other", expect) == (None, None)               # no key -> a person

    class _Refused:
        stop_reason = "refusal"
        content = []

    assert read_verdict(_Refused()) is None

    class _Text:
        stop_reason = "end_turn"
        content = [type("B", (), {"type": "text", "text": '{"confidence": "high"}'})()]

    assert read_verdict(_Text()) == {"confidence": "high"}
    print("doc judge self-check OK")


if __name__ == "__main__":
    demo()

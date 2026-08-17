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
        "name_match": {
            "type": "string",
            "enum": ["same", "similar", "different", "unreadable"],
            "description": "How the printed name compares with the expected name. "
                           "'same' — the same name. "
                           "'similar' — the same person written differently: dropped or added "
                           "middle names, a different transliteration or script, a spelling "
                           "variant, an abbreviation, an added or missing title. "
                           "'different' — a different first or family name, i.e. another person. "
                           "'unreadable' — the name on the document cannot be made out, or no "
                           "expected name was given to compare against.",
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
                 "name_match", "tampered", "confidence", "reason"],
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
    "whereas a student card from كلية الطب البيطري means a student and not a veterinarian.\n\n"
    "Names need care, because a rejection on a name turns away a real applicant. Egyptian "
    "names run to four parts and people routinely register with fewer, in either script, so "
    "a name that is written differently but points at the same person is 'similar' and is "
    "as good as an exact match. Reserve 'different' for a name that is genuinely somebody "
    "else — a different first or family name. If you cannot read the name, say 'unreadable' "
    "rather than guessing in either direction."
)


def _block(image):
    """One image content block. `image` is (bytes, media_type)."""
    data, media_type = image
    return {"type": "image", "source": {
        "type": "base64", "media_type": media_type,
        "data": base64.standard_b64encode(data).decode("ascii"),
    }}


# ------------------------------- orientation -------------------------------
#
# A phone photographed a landscape card in portrait, so every line of Arabic ran
# vertically up the side of the frame. The model read a national ID with two digits
# transposed, could not read the name or the occupation at all, and said so: "الصورة
# مقلوبة". Rotated a quarter turn the same photograph read every field at high
# confidence. So orientation is not a detail of the image — it decides whether the
# document can be read, and asking the applicant to retake a photograph that was
# perfectly good is not the answer.

def _rotate(data, degrees):
    """Rotate JPEG/PNG bytes. Returns the original bytes if the image cannot be read."""
    import io

    try:
        from PIL import Image, ImageOps
    except ImportError:      # Pillow absent: fall back to sending it as it came
        return data
    try:
        with Image.open(io.BytesIO(data)) as image:
            # Phones usually record rotation as an EXIF flag rather than in the pixels.
            # Honouring it first is free and fixes the common case outright.
            image = ImageOps.exif_transpose(image)
            if degrees:
                image = image.rotate(degrees, expand=True)
            out = io.BytesIO()
            image.convert("RGB").save(out, format="JPEG", quality=90)
            return out.getvalue()
    except Exception:        # noqa: BLE001 — an unreadable image is the model's problem
        return data


def _is_portrait(data):
    import io

    try:
        from PIL import Image, ImageOps

        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            return image.height > image.width
    except Exception:        # noqa: BLE001
        return False


def orientations(images):
    """The orientations worth trying, best guess first.

    An identity card is wider than it is tall, so a portrait photograph of one is
    lying on its side — but which side depends on which way the phone was held, and
    nothing in the file says. Both quarter turns are tried; the upright image is
    tried first so a photograph that was already straight costs one call.
    """
    yield [(_rotate(data, 0), "image/jpeg") for data, _ in images]
    if not any(_is_portrait(data) for data, _ in images):
        return
    for degrees in (90, -90):        # counter-clockwise, then clockwise
        yield [(_rotate(data, degrees), "image/jpeg") for data, _ in images]


def readable(verdict):
    """Whether a verdict is worth stopping on, or whether to try another orientation."""
    return bool(verdict) and verdict.get("confidence") != "low"


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
    service is unavailable or declined — either way the request goes to a human.

    Tries the photograph the right way up before giving up on it: an unreadable
    answer from a sideways card is a fact about the frame, not about the document.
    """
    if not available():
        return None
    import anthropic

    client = anthropic.Anthropic()
    best = None
    for turned in orientations(images):
        verdict = read_verdict(client.messages.create(**build_request(turned, expect)))
        best = verdict or best
        if readable(verdict):
            return verdict
    return best


# ------------------------------- deciding on it -------------------------------

# The model reports; these rules decide. Kept apart so the policy is readable in one
# place and testable without a verdict ever having come from the API.

def decide(verdict, route, expect):
    """(grant, problem) — grant is 'baytarian', 'vet_student' or None.

    Three outcomes, and which one a case lands in is the whole policy:

    * a **problem** is a definite no, told to the applicant straight away;
    * a **grant** is a definite yes, taken without a person;
    * neither is "I cannot tell", which is the only thing that reaches the queue.

    The rule for choosing between them: reject when the document positively says the
    wrong thing, and defer only when it says nothing readable. A card naming another
    person is a rejection; a card too blurry to name anyone is a review.
    """
    if verdict is None:
        return None, None

    # A doctored image is never worth reading further, whatever it claims.
    if verdict.get("tampered"):
        return None, "looks_edited"

    name = verdict.get("name_match")
    if name == "different":
        # Positively somebody else. No amount of the rest being right fixes that, so it
        # is refused before anything else is weighed.
        return None, "name_does_not_match"

    # A national ID that disagrees with the one on file is the same kind of no: the
    # document belongs to a real person who is not the one holding this account.
    claimed = (verdict.get("national_id") or "").strip()
    if claimed and expect.get("national_id") and claimed != expect["national_id"]:
        return None, "national_id_does_not_match"

    # Everything from here needs the document to have been read at all.
    if verdict.get("confidence") == "low" or name == "unreadable":
        return None, None
    if verdict.get("expired"):
        return None, "expired"

    if route == "national_id":
        if not claimed:
            # No national ID printed on it means it is not a national ID card.
            return None, "not_a_national_id"
        # The occupation box is the whole question this route asks. It either says
        # veterinarian or it does not, and either way that is an answer.
        if verdict.get("occupation_is_veterinarian"):
            return "baytarian", None
        if verdict.get("occupation"):
            return None, "occupation_not_veterinarian"
        return None, None          # the box could not be read — a person looks

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
                "is_veterinary_student": False, "expired": False, "name_match": "same",
                "tampered": False, "confidence": "high", "reason": ""}
        base.update(over)
        return base

    # national ID route: the occupation box is the question, and it answers either way
    assert decide(verdict(national_id="27811291801536", occupation="طبيب بيطري",
                          occupation_is_veterinarian=True),
                  "national_id", expect) == ("baytarian", None)
    assert decide(verdict(national_id="27811291801536", occupation="مهندس"),
                  "national_id", expect) == (None, "occupation_not_veterinarian")
    # ...unless the box itself could not be read, which is not an answer
    assert decide(verdict(national_id="27811291801536"), "national_id", expect) == (None, None)
    assert decide(verdict(national_id="10000000000000", occupation_is_veterinarian=True),
                  "national_id", expect) == (None, "national_id_does_not_match")
    assert decide(verdict(occupation_is_veterinarian=True), "national_id", expect) == (
        None, "not_a_national_id")

    # other documents: a student card grants the student kind, a licence the licensed one
    assert decide(verdict(is_veterinary_student=True), "other", expect) == ("vet_student", None)
    assert decide(verdict(), "other", expect) == (None, None)          # unsure -> a person
    assert decide(verdict(confidence="low", is_veterinary_student=True),
                  "other", expect) == (None, None)
    assert decide(verdict(tampered=True, is_veterinary_student=True),
                  "other", expect) == (None, "looks_edited")
    assert decide(verdict(expired=True, is_veterinary_student=True),
                  "other", expect) == (None, "expired")
    assert decide(None, "other", expect) == (None, None)               # no key -> a person

    # ---- names: written differently is the same person; someone else is a refusal ----
    for match in ("same", "similar"):
        assert decide(verdict(name_match=match, is_veterinary_student=True),
                      "other", expect) == ("vet_student", None), match
    assert decide(verdict(name_match="different", is_veterinary_student=True),
                  "other", expect) == (None, "name_does_not_match")
    assert decide(verdict(name_match="unreadable", is_veterinary_student=True),
                  "other", expect) == (None, None)
    # a wrong name is refused even when everything else on the card is right
    assert decide(verdict(name_match="different", national_id="27811291801536",
                          occupation="طبيب بيطري", occupation_is_veterinarian=True),
                  "national_id", expect) == (None, "name_does_not_match")
    # ...and an unreadable one is not held against an applicant with no name on file
    assert decide(verdict(name_match="unreadable", is_veterinary_student=True),
                  "other", {"name": "", "national_id": ""}) == (None, None)

    class _Refused:
        stop_reason = "refusal"
        content = []

    assert read_verdict(_Refused()) is None

    class _Text:
        stop_reason = "end_turn"
        content = [type("B", (), {"type": "text", "text": '{"confidence": "high"}'})()]

    assert read_verdict(_Text()) == {"confidence": "high"}

    # ---- orientation ----
    assert readable({"confidence": "high"}) and readable({"confidence": "medium"})
    assert not readable({"confidence": "low"}) and not readable(None)

    import io

    from PIL import Image

    def jpeg(width, height):
        out = io.BytesIO()
        Image.new("RGB", (width, height), "white").save(out, format="JPEG")
        return out.getvalue()

    # A card photographed upright is read once; nothing is gained by turning it.
    assert len(list(orientations([(jpeg(1600, 900), "image/jpeg")]))) == 1
    # A portrait photograph of a landscape card is tried both ways round.
    turns = list(orientations([(jpeg(900, 1600), "image/jpeg")]))
    assert len(turns) == 3, len(turns)
    assert all(len(t) == 1 for t in turns)
    # ...and the turned frames really are landscape, not just re-encoded.
    for candidate in turns[1:]:
        with Image.open(io.BytesIO(candidate[0][0])) as turned:
            assert turned.width > turned.height, turned.size
    # Both sides turn together, so the pair still describes one card.
    pair = list(orientations([(jpeg(900, 1600), "image/jpeg"), (jpeg(900, 1600), "image/jpeg")]))
    assert len(pair) == 3 and all(len(p) == 2 for p in pair)
    # Bytes that are not an image at all are passed through rather than raising.
    assert _rotate(b"not an image", 90) == b"not an image"
    assert _is_portrait(b"not an image") is False

    print("doc judge self-check OK")


if __name__ == "__main__":
    demo()

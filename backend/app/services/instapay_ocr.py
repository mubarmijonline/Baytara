"""InstaPay receipt OCR + validation.

Two parts:
- extract_text(image_path): thin Google Vision wrapper (needs GOOGLE_APPLICATION_CREDENTIALS
  + google-cloud-vision installed). Imported lazily so the module loads without the lib/key.
- parse_receipt(text, ogs_accounts): PURE regex parser/validator — no I/O, unit-tested offline.

ogs_accounts: iterable of dicts/objects with .url and .number (the instapay_account whitelist).
"""
import re

APPROVAL_RE = re.compile(
    r"(Approved Transaction|Transaction Successful|Your transaction was successful|Transfer Amount"
    r"|تم التحويل بنجاح|تمت العملية بنجاح|معاملة ناجحة)"
)
CHECKMARK_RE = re.compile(r"[✓✔√☑✅]")
AMOUNT_RE = re.compile(r"([\d,]+(?:\.\d{1,2})?)\s?EGP")
TOTAL_RE = re.compile(r"Total Amount\s*([\d,]+(?:\.\d{1,2})?)\s?EGP")
FEES_RE = re.compile(r"Fees\s*([\d,]+)\s?EGP")
DATE_RE = re.compile(r"(\d{2} \w{3} \d{4} \d{2}:\d{2} (?:AM|PM))")
REFERENCE_RE = re.compile(r"(\d{12,})")
REFERENCE_LABEL_RE = re.compile(r"(Reference|الرقم المرجعي|المرجع)")
NOTE_RE = re.compile(r"(?i)Note\s*(.*)")
FROM_SECTION_RE = re.compile(r"(From|من)")
PHONE_RE = re.compile(r"01[0-9]{9,10}")

NF = "Not Found"


def _clean_amount(value):
    """Strip commas + decimal part -> int (per spec)."""
    return int(value.replace(",", "").split(".")[0])


def _base_result():
    return {
        "state": "Success",
        "transaction_approved": NF,
        "All_total_amount": NF,
        "total_amount": NF,
        "fees": NF,
        "date": NF,
        "reference": NF,
        "note": NF,
        "sender_name": NF,
        "sender_account": NF,
        "receiver_hash": NF,
        "receiver_account": NF,
        "ogs_account_found": NF,
    }


def parse_receipt(text, ogs_accounts=()):
    try:
        if not text or text.strip() == "" or text == "No text found":
            r = _base_result()
            r["state"] = "No text found"
            return r

        lines = text.split("\n")
        has_approval_text = bool(APPROVAL_RE.search(text))
        has_checkmark = bool(CHECKMARK_RE.search(text))
        has_reference_label = bool(REFERENCE_LABEL_RE.search(text))
        has_from_section = bool(FROM_SECTION_RE.search(text))

        # --- amounts ---
        transfer_amount = None
        for m in AMOUNT_RE.findall(text):
            cleaned = _clean_amount(m)
            if cleaned != 0:
                transfer_amount = cleaned
                break
        total_m = TOTAL_RE.search(text)
        total_amount = _clean_amount(total_m.group(1)) if total_m else transfer_amount
        fees_m = FEES_RE.search(text)
        fees = _clean_amount(fees_m.group(1)) if fees_m else 0

        has_amount = transfer_amount is not None

        # --- date / note ---
        date_m = DATE_RE.search(text)
        date = date_m.group(1) if date_m else NF
        note_m = NOTE_RE.search(text)
        note = note_m.group(1).strip() if note_m and note_m.group(1).strip() else NF

        # --- reference (only when a label exists) ---
        reference = NF
        if has_reference_label:
            refs = REFERENCE_RE.findall(text)
            if len(refs) == 1:
                reference = refs[0]
            elif len(refs) > 1:
                reference = refs[-1]

        # --- sender ---
        sender_name, sender_account = NF, NF
        for i, l in enumerate(lines):
            if l.strip().startswith("From"):
                if i + 1 < len(lines):
                    sender_name = lines[i + 1].strip() or NF
                if i + 2 < len(lines) and "@instapay" in lines[i + 2]:
                    sender_account = lines[i + 2].strip()
                break

        # --- receiver ---
        receiver_hash, receiver_account = NF, None
        to_idx = None
        for i, l in enumerate(lines):
            if ("To" in l or "إلى" in l) and "Total" not in l:
                to_idx = i
                break
        if to_idx is not None:
            for l in lines[to_idx + 1 : to_idx + 11]:
                if "**" in l and receiver_hash == NF:
                    receiver_hash = l.strip()
                if receiver_account is None:
                    if "@instapay" in l:
                        receiver_account = l.strip()
                    else:
                        pm = PHONE_RE.search(l)
                        if pm:
                            receiver_account = pm.group()
        if receiver_account is None:
            candidates = [l.strip() for l in lines if "@instapay" in l or PHONE_RE.search(l)]
            receiver_account = candidates[-1] if candidates else NF
        if receiver_account and receiver_account != NF:
            receiver_account = receiver_account.replace(" ", "")

        # --- approval decision ---
        structural = has_amount and has_reference_label and has_from_section
        transaction_approved = (
            "Transaction Approved"
            if (has_approval_text or has_checkmark or structural)
            else "Transaction Declined"
        )

        # --- OGS account (receiver whitelist) ---
        ogs_account_found = "Not Valid"
        if receiver_account and receiver_account != NF:
            recv_norm = receiver_account.lower().replace("@", "/")
            for a in ogs_accounts:
                url = (getattr(a, "url", None) or (a.get("url") if isinstance(a, dict) else None) or "")
                num = (getattr(a, "number", None) or (a.get("number") if isinstance(a, dict) else None) or "")
                if not url or not num:
                    continue
                if recv_norm in url.lower() or num == receiver_account:
                    ogs_account_found = "Exist"
                    break

        is_total_amount_correct = (total_amount - fees) == transfer_amount if has_amount else False

        return {
            "state": "Success",
            "transaction_approved": transaction_approved,
            "All_total_amount": total_amount if has_amount else NF,
            "total_amount": transfer_amount if has_amount else NF,
            "fees": fees,
            "date": date,
            "reference": reference,
            "note": note,
            "sender_name": sender_name,
            "sender_account": sender_account,
            "receiver_hash": receiver_hash,
            "receiver_account": receiver_account if receiver_account else NF,
            "ogs_account_found": ogs_account_found,
            "is_total_amount_correct": is_total_amount_correct,
        }
    except Exception as e:  # noqa: BLE001 — spec: return the same shape on any error
        r = _base_result()
        r["state"] = f"Error: {e}"
        return r


def extract_text(image_path):
    """Run Google Vision OCR on the saved receipt. Returns full text or 'No text found'.

    Auth is the service-account JSON at env GOOGLE_APPLICATION_CREDENTIALS (google-cloud-vision
    reads it automatically). Imported lazily so this module loads without the lib/key present.
    """
    from google.cloud import vision  # lazy

    client = vision.ImageAnnotatorClient()
    with open(image_path, "rb") as f:
        image = vision.Image(content=f.read())
    resp = client.text_detection(image=image)
    if resp.error.message:
        raise RuntimeError(f"Vision error: {resp.error.message}")
    texts = resp.text_annotations
    return texts[0].description if texts else "No text found"

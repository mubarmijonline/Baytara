"""Pure OCR-parser self-check — no Vision, no DB. Run: python -m tests.test_instapay_ocr

Exercises real InstaPay-style receipt text against parse_receipt(): approval detection,
amount/fees/total, reference-label gating, sender/receiver, receiver whitelist, integrity.
"""
from app.services.instapay_ocr import parse_receipt

# url stored normalized (@ -> /), matching how parse_receipt normalizes the receiver
OGS = [{"account_name": "OGS", "number": "01012345678", "url": "https://ipn.eg/ogs.center/instapay"}]

RECEIPT = """Transaction Successful
✓
1,000.00 EGP
Total Amount 1,010.00 EGP
Fees 10 EGP
12 Mar 2026 08:45 PM
Reference
123456789012
Note شكرا
From
Ahmed Diab
ahmed.diab@instapay
To
**** hash-block
ogs.center@instapay
"""


def demo():
    r = parse_receipt(RECEIPT, OGS)
    assert r["state"] == "Success", r
    assert r["transaction_approved"] == "Transaction Approved"
    assert r["total_amount"] == 1000 and r["All_total_amount"] == 1010 and r["fees"] == 10
    assert r["is_total_amount_correct"] is True  # 1010 - 10 == 1000
    assert r["reference"] == "123456789012"
    assert r["date"] == "12 Mar 2026 08:45 PM"
    assert r["sender_name"] == "Ahmed Diab" and r["sender_account"] == "ahmed.diab@instapay"
    assert r["receiver_account"] == "ogs.center@instapay", r["receiver_account"]
    assert r["ogs_account_found"] == "Exist"

    # reference NOT trusted without a label
    no_label = parse_receipt("Transfer Amount 500 EGP\n999888777666\nFrom\nX\n", OGS)
    assert no_label["reference"] == "Not Found", no_label["reference"]

    # receiver not in whitelist -> Not Valid
    stranger = parse_receipt(RECEIPT.replace("ogs.center@instapay", "someone.else@instapay"), OGS)
    assert stranger["ogs_account_found"] == "Not Valid"

    # declined: no approval text, no checkmark, not structural
    declined = parse_receipt("Total Amount 5 EGP\nsome random text\n", OGS)
    assert declined["transaction_approved"] == "Transaction Declined", declined

    # empty / no text
    assert parse_receipt("No text found", OGS)["state"] == "No text found"

    print("instapay OCR parser self-check OK")


if __name__ == "__main__":
    demo()

from flask import Blueprint, jsonify

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    return jsonify(status="ok", service="baytara-api", version="v1")

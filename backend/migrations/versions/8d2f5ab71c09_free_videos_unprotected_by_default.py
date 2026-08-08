"""free videos are not capture-protected by default

Screen-capture protection (macOS Safari only) now applies to paid videos always and
to free videos only when an admin ticks it. Existing free rows carry the old
`is_protected=True` default, which would keep blocking them, so clear it once.

Revision ID: 8d2f5ab71c09
Revises: 7c1a4be90d31
Create Date: 2026-08-08 17:45:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '8d2f5ab71c09'
down_revision = '7c1a4be90d31'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "UPDATE lessons SET is_protected = false "
        "WHERE access_type IN ('free', 'vet_free')"
    )


def downgrade():
    op.execute(
        "UPDATE lessons SET is_protected = true "
        "WHERE access_type IN ('free', 'vet_free')"
    )

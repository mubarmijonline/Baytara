"""add user specialties

Revision ID: 474c0a7b8074
Revises: f6a2c98e10b3
Create Date: 2026-08-16 12:45:20.636400

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '474c0a7b8074'
down_revision = 'f6a2c98e10b3'
branch_labels = None
depends_on = None


def upgrade():
    # Self-service specialties, held as category slugs. Nullable and unbackfilled:
    # nobody has picked any yet, and an empty list would be indistinguishable from
    # "this learner chose none".
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("specialties", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("specialties")

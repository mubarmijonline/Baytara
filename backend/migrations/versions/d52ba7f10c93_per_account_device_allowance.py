"""per-account device allowance

Revision ID: d52ba7f10c93
Revises: c41d90ab7e52
Create Date: 2026-08-14 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd52ba7f10c93'
down_revision = 'c41d90ab7e52'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('max_devices', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('max_devices')

"""users.is_review_account: the store reviewers' account

Set only by `flask create-review-account`. Exempts the account from the
suspicious-activity playback block; its events are still recorded.

Revision ID: a4e7c2d9b1f3
Revises: e5a1c9d3b7f2
"""
from alembic import op
import sqlalchemy as sa


revision = 'a4e7c2d9b1f3'
down_revision = 'e5a1c9d3b7f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_review_account', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('is_review_account')

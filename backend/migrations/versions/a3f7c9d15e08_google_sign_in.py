"""google sign-in: google_sub on users, password_hash nullable

Revision ID: a3f7c9d15e08
Revises: f7a3c8e21b40
Create Date: 2026-08-17 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f7c9d15e08'
down_revision = 'f7a3c8e21b40'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('google_sub', sa.String(length=64), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_google_sub'), ['google_sub'], unique=True)
        # Google-only accounts have no password.
        batch_op.alter_column('password_hash', existing_type=sa.String(length=255), nullable=True)


def downgrade():
    # Any password-less (Google-only) account has to go before the column can be
    # NOT NULL again, otherwise the alter fails on existing rows.
    op.execute("DELETE FROM users WHERE password_hash IS NULL")
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('password_hash', existing_type=sa.String(length=255), nullable=False)
        batch_op.drop_index(batch_op.f('ix_users_google_sub'))
        batch_op.drop_column('google_sub')

"""group a user's browsers by the machine they run on

The limit counts devices, but a device id is a localStorage UUID, so Chrome, Firefox
and Safari on one laptop were three of them. `device_group` is a signature the client
derives from the machine (platform, screen, timezone); rows sharing one count once.

Existing rows are backfilled with their own device_id, so nobody's registered browsers
are merged or evicted by this migration: they keep counting exactly as they did.

Revision ID: c5b18ad3f402
Revises: b7e41c2d90a3
Create Date: 2026-09-06 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c5b18ad3f402'
down_revision = 'b7e41c2d90a3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_devices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('device_group', sa.String(length=64), nullable=True))
        batch_op.create_index('ix_user_devices_user_group', ['user_id', 'device_group'], unique=False)
    op.execute("UPDATE user_devices SET device_group = device_id WHERE device_group IS NULL")


def downgrade():
    with op.batch_alter_table('user_devices', schema=None) as batch_op:
        batch_op.drop_index('ix_user_devices_user_group')
        batch_op.drop_column('device_group')

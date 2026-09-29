"""restore the self-hosted video source columns

f7a3c8e21b40 dropped these when VdoCipher became the only delivery path. They come
back because some content has to be served without a DRM provider — the columns are
the same three, so the model and the delivery code are the ones from before.

Not a revert of f7a3c8e21b40: that migration is applied in production, so the chain
moves forward rather than being rewritten.

Revision ID: b7e41c2d90a3
Revises: a3f7c9d15e08
Create Date: 2026-08-24 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7e41c2d90a3'
down_revision = 'a3f7c9d15e08'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source', sa.String(length=20), nullable=False,
                                      server_default='vdocipher'))
        batch_op.add_column(sa.Column('local_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('local_error', sa.String(length=200), nullable=True))
        batch_op.create_index(batch_op.f('ix_lessons_source'), ['source'], unique=False)


def downgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lessons_source'))
        batch_op.drop_column('local_error')
        batch_op.drop_column('local_status')
        batch_op.drop_column('source')

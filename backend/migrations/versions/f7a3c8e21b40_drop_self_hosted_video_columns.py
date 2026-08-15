"""drop the self-hosted video columns

Self-hosting was tested and removed: VdoCipher is the only delivery path again.

Revision ID: f7a3c8e21b40
Revises: d52ba7f10c93
Create Date: 2026-08-15 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7a3c8e21b40'
down_revision = 'd52ba7f10c93'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lessons_source'))
        batch_op.drop_column('local_error')
        batch_op.drop_column('local_status')
        batch_op.drop_column('source')


def downgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source', sa.String(length=20), nullable=False,
                                      server_default='vdocipher'))
        batch_op.add_column(sa.Column('local_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('local_error', sa.String(length=200), nullable=True))
        batch_op.create_index(batch_op.f('ix_lessons_source'), ['source'], unique=False)

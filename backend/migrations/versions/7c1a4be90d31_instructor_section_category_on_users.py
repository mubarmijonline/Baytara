"""instructor section (category) on users

Revision ID: 7c1a4be90d31
Revises: 91c3f6a8d2e4
Create Date: 2026-08-08 16:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c1a4be90d31'
down_revision = '91c3f6a8d2e4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('category_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_category_id'), ['category_id'], unique=False)
        batch_op.create_foreign_key('fk_users_category_id', 'categories', ['category_id'], ['id'])


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_category_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_users_category_id'))
        batch_op.drop_column('category_id')

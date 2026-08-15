"""profile fields and certificates

Cover image and location on users so the profile page has somewhere to put them, and
a certificates table issued on course completion.

Revision ID: e3b9d70c41f8
Revises: d1f0c62b8a47
Create Date: 2026-08-15 16:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3b9d70c41f8'
down_revision = 'd1f0c62b8a47'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cover_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('location', sa.String(length=120), nullable=True))

    op.create_table(
        'certificates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('serial', sa.String(length=32), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('serial'),
        sa.UniqueConstraint('user_id', 'course_id', name='uq_certificate_user_course'),
    )
    with op.batch_alter_table('certificates', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_certificates_serial'), ['serial'], unique=True)
        batch_op.create_index(batch_op.f('ix_certificates_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_certificates_course_id'), ['course_id'], unique=False)


def downgrade():
    with op.batch_alter_table('certificates', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_certificates_course_id'))
        batch_op.drop_index(batch_op.f('ix_certificates_user_id'))
        batch_op.drop_index(batch_op.f('ix_certificates_serial'))
    op.drop_table('certificates')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('location')
        batch_op.drop_column('cover_url')

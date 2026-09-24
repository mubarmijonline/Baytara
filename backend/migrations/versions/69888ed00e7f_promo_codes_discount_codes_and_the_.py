"""promo codes: discount codes and the payment columns that record them

Autogenerate also proposed dropping four unique constraints and reshaping an index on
`user_devices` — certificates.serial, learning_paths.slug,
video_playback_events.client_event_id and video_playback_sessions.public_id. None of those
belong to this change: they are pre-existing drift between the models and the live schema,
and dropping uniqueness on certificate serials in particular would quietly allow two
certificates to claim the same number. They have been removed from this migration. The
drift is real and should be looked at, but on its own and deliberately, not as a passenger
on a feature migration.

Revision ID: 69888ed00e7f
Revises: 2a4f7036ea19
Create Date: 2026-09-23 12:41:55.303265

"""
from alembic import op
import sqlalchemy as sa


revision = '69888ed00e7f'
down_revision = '2a4f7036ea19'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'promo_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=40), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('value', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('partner', sa.String(length=160), nullable=True),
        sa.Column('note', sa.String(length=300), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('per_user_limit', sa.Integer(), server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('promo_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_promo_codes_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_promo_codes_is_active'), ['is_active'], unique=False)

    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('promo_code_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('discount', sa.Numeric(precision=10, scale=2),
                                      server_default='0', nullable=False))
        batch_op.create_index(batch_op.f('ix_payments_promo_code_id'), ['promo_code_id'], unique=False)
        batch_op.create_foreign_key('fk_payments_promo_code_id', 'promo_codes',
                                    ['promo_code_id'], ['id'])


def downgrade():
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_payments_promo_code_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_payments_promo_code_id'))
        batch_op.drop_column('discount')
        batch_op.drop_column('promo_code_id')

    with op.batch_alter_table('promo_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_promo_codes_is_active'))
        batch_op.drop_index(batch_op.f('ix_promo_codes_code'))
    op.drop_table('promo_codes')

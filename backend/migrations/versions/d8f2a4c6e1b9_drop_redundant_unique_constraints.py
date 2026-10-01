"""schema drift: drop four unique constraints that duplicate a unique index

Each of these columns has been unique twice in Postgres: once as an unnamed UNIQUE
constraint from its create_table (Postgres names it <table>_<column>_key), and once as the
unique index ix_<table>_<column> that the model declares with unique=True, index=True.
Autogenerate reads the constraint as something the models do not have and proposes
dropping it; that is the drift noted in MILESTONES.md since the promo migration.

Dropping the constraint keeps every guarantee: the unique index is what the model says
and it still refuses a duplicate. Written by hand, and Postgres only. SQLite gives the
inline constraint no name, and its unique index already holds the line there too.

Revision ID: d8f2a4c6e1b9
Revises: c3d9e1a7f2b4
"""
from alembic import op


revision = 'd8f2a4c6e1b9'
down_revision = 'c3d9e1a7f2b4'
branch_labels = None
depends_on = None

# (table, column). The unique index ix_<table>_<column> stays in every case.
REDUNDANT = (
    ('certificates', 'serial'),
    ('learning_paths', 'slug'),
    ('video_playback_events', 'client_event_id'),
    ('video_playback_sessions', 'public_id'),
)


def _postgres():
    return op.get_bind().dialect.name == 'postgresql'


def upgrade():
    if not _postgres():
        return
    for table, column in REDUNDANT:
        op.execute(f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_{column}_key')


def downgrade():
    if not _postgres():
        return
    for table, column in REDUNDANT:
        op.execute(f'ALTER TABLE {table} ADD CONSTRAINT {table}_{column}_key UNIQUE ({column})')

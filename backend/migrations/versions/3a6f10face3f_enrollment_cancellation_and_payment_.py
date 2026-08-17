"""enrollment cancellation and payment refunds

Revision ID: 3a6f10face3f
Revises: 474c0a7b8074
Create Date: 2026-08-16 18:46:27.890457

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3a6f10face3f'
down_revision = '474c0a7b8074'
branch_labels = None
depends_on = None


def upgrade():
    # Un-enrolling keeps the row: the learner's progress survives a reinstatement, and
    # there is a record of who removed them and why.
    with op.batch_alter_table("enrollments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("cancel_reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("cancelled_by", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_enrollments_cancelled_by", "users", ["cancelled_by"], ["id"])

    # Refunds are bookkeeping — no gateway call returns the money — so the columns
    # record the agreed amount rather than a transfer. Existing rows refunded nothing.
    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("refunded_amount", sa.Numeric(10, 2),
                                      nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("refunded_by", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("refund_reason", sa.Text(), nullable=True))
        batch_op.create_foreign_key("fk_payments_refunded_by", "users", ["refunded_by"], ["id"])


def downgrade():
    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.drop_constraint("fk_payments_refunded_by", type_="foreignkey")
        batch_op.drop_column("refund_reason")
        batch_op.drop_column("refunded_by")
        batch_op.drop_column("refunded_at")
        batch_op.drop_column("refunded_amount")
    with op.batch_alter_table("enrollments", schema=None) as batch_op:
        batch_op.drop_constraint("fk_enrollments_cancelled_by", type_="foreignkey")
        batch_op.drop_column("cancelled_by")
        batch_op.drop_column("cancel_reason")
        batch_op.drop_column("cancelled_at")

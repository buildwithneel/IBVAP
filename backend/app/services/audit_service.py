import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.db.models.models import AuditRecord
from app.core.security import compute_audit_record_hash

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

class AuditService:
    @staticmethod
    def append_event(
        db: Session,
        event_id: str,
        event_type: str,
        payload: Dict[str, Any],
        operator_id: Optional[str] = None,
        operator_name: Optional[str] = None,
        operator_role: Optional[str] = None,
        action: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        details: Optional[str] = None,
        status: str = "SUCCESS"
    ) -> AuditRecord:
        """
        Appends a cryptographic SHA-256 audit record to the ledger chain.
        """
        last_record = db.query(AuditRecord).order_by(AuditRecord.sequence_number.desc()).first()
        previous_hash = last_record.record_hash if last_record else GENESIS_HASH

        payload_hash, record_hash = compute_audit_record_hash(previous_hash, payload)

        audit_entry = AuditRecord(
            timestamp=datetime.utcnow(),
            event_id=event_id,
            event_type=event_type,
            previous_hash=previous_hash,
            payload_hash=payload_hash,
            record_hash=record_hash,
            operator_id=operator_id,
            operator_name=operator_name,
            operator_role=operator_role,
            action=action or event_type,
            target_type=target_type,
            target_id=target_id,
            details=details,
            status=status
        )

        db.add(audit_entry)
        db.commit()
        db.refresh(audit_entry)
        return audit_entry

    @staticmethod
    def verify_chain(db: Session) -> Dict[str, Any]:
        """
        Verifies the cryptographic integrity of the entire audit record chain.
        Returns detailed verification report.
        """
        records = db.query(AuditRecord).order_by(AuditRecord.sequence_number.asc()).all()
        if not records:
            return {
                "valid": True,
                "is_valid": True,
                "records_checked": 0,
                "total_records": 0,
                "errors": [],
                "genesis_hash": GENESIS_HASH,
                "latest_hash": GENESIS_HASH
            }

        errors = []
        expected_prev_hash = GENESIS_HASH
        first_invalid_seq = None

        for rec in records:
            if rec.previous_hash != expected_prev_hash:
                err = f"Sequence #{rec.sequence_number}: previous_hash mismatch! Expected '{expected_prev_hash[:12]}...', got '{rec.previous_hash[:12]}...'"
                errors.append(err)
                if first_invalid_seq is None:
                    first_invalid_seq = rec.sequence_number

            # Verify combined record hash
            combined = f"{rec.previous_hash}:{rec.payload_hash}"
            import hashlib
            calc_record_hash = hashlib.sha256(combined.encode("utf-8")).hexdigest()
            if calc_record_hash != rec.record_hash:
                err = f"Sequence #{rec.sequence_number}: record_hash tampered! Calculated '{calc_record_hash[:12]}...', stored '{rec.record_hash[:12]}...'"
                errors.append(err)
                if first_invalid_seq is None:
                    first_invalid_seq = rec.sequence_number

            expected_prev_hash = rec.record_hash

        is_valid = len(errors) == 0

        return {
            "valid": is_valid,
            "is_valid": is_valid,
            "records_checked": len(records),
            "total_records": len(records),
            "first_invalid_sequence": first_invalid_seq,
            "errors": errors,
            "genesis_hash": GENESIS_HASH,
            "latest_hash": records[-1].record_hash if records else GENESIS_HASH
        }

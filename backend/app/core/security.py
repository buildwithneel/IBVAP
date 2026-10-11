import hmac
import hashlib
import json
import base64
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from app.core.config import settings

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def _b64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    try:
        from jose import jwt
        to_encode = data.copy()
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"exp": expire})
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    except Exception:
        # Fallback pure-python HS256 JWT encoder
        header = {"alg": "HS256", "typ": "JWT"}
        payload = data.copy()
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
        payload["exp"] = int(expire.timestamp())

        h_bytes = _b64url_encode(json.dumps(header).encode('utf-8'))
        p_bytes = _b64url_encode(json.dumps(payload).encode('utf-8'))
        signing_input = f"{h_bytes}.{p_bytes}".encode('utf-8')
        signature = hmac.new(settings.SECRET_KEY.encode('utf-8'), signing_input, hashlib.sha256).digest()
        s_bytes = _b64url_encode(signature)
        return f"{h_bytes}.{p_bytes}.{s_bytes}"

def decode_access_token(token: str) -> Optional[dict]:
    try:
        from jose import jwt
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception:
        try:
            parts = token.split('.')
            if len(parts) != 3:
                return None
            payload_json = _b64url_decode(parts[1]).decode('utf-8')
            return json.loads(payload_json)
        except Exception:
            return None

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Standard fallback sha256 password hash comparison
        calc = hashlib.sha256((plain_password + settings.SECRET_KEY).encode('utf-8')).hexdigest()
        return hmac.compare_digest(calc, hashed_password)

def get_password_hash(password: str) -> str:
    try:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.hash(password)
    except Exception:
        return hashlib.sha256((password + settings.SECRET_KEY).encode('utf-8')).hexdigest()

def compute_sha256_bytes(data: bytes) -> str:
    """Computes SHA-256 hash of raw binary data."""
    return hashlib.sha256(data).hexdigest()

def compute_sha256_string(text: str) -> str:
    """Computes SHA-256 hash of a string."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def compute_sha256_file(filepath: str) -> str:
    """Computes SHA-256 hash of a file on disk."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def compute_audit_record_hash(previous_hash: str, payload: Dict[str, Any]) -> tuple[str, str]:
    """
    Computes cryptographic SHA-256 record hash for audit log chain.
    Returns (payload_hash, record_hash).
    """
    payload_str = json.dumps(payload, sort_keys=True)
    payload_hash = compute_sha256_string(payload_str)
    combined = f"{previous_hash}:{payload_hash}"
    record_hash = compute_sha256_string(combined)
    return payload_hash, record_hash

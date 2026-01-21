from __future__ import annotations

import base64
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.fernet import Fernet


@dataclass
class Encryptor:
    passphrase: str

    @staticmethod
    def from_passphrase(passphrase: str) -> "Encryptor":
        return Encryptor(passphrase=passphrase)

    def _derive_key(self, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=200_000,
            backend=default_backend(),
        )
        return base64.urlsafe_b64encode(kdf.derive(self.passphrase.encode("utf-8")))

    def encrypt(self, plaintext: bytes) -> bytes:
        salt = os.urandom(16)
        f = Fernet(self._derive_key(salt))
        token = f.encrypt(plaintext)
        return b"WED1" + salt + token

    def decrypt(self, blob: bytes) -> bytes:
        if not blob.startswith(b"WED1"):
            raise ValueError("Unknown ciphertext header")
        salt = blob[4:20]
        token = blob[20:]
        f = Fernet(self._derive_key(salt))
        return f.decrypt(token)

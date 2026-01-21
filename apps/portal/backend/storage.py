from __future__ import annotations

import os
import json
import time
import glob
import uuid
from typing import Any, Dict, List


class IntakeStore:
    def __init__(self, data_dir: str, encryptor):
        self.data_dir = os.path.abspath(data_dir)
        self.encryptor = encryptor
        os.makedirs(self.data_dir, exist_ok=True)

    def _path(self, intake_id: str) -> str:
        return os.path.join(self.data_dir, f"{intake_id}.bin")

    def save(self, intake: Dict[str, Any]) -> str:
        intake_id = uuid.uuid4().hex[:12]
        record = {"id": intake_id, "submittedAt": time.strftime("%Y-%m-%d %H:%M:%S"), "intake": intake}
        plaintext = json.dumps(record, ensure_ascii=False).encode("utf-8")
        blob = self.encryptor.encrypt(plaintext)
        with open(self._path(intake_id), "wb") as f:
            f.write(blob)
        return intake_id

    def load(self, intake_id: str) -> Dict[str, Any]:
        with open(self._path(intake_id), "rb") as f:
            blob = f.read()
        plaintext = self.encryptor.decrypt(blob)
        record = json.loads(plaintext.decode("utf-8"))
        return record["intake"]

    def list_items(self) -> List[Dict[str, Any]]:
        items = []
        for fn in sorted(glob.glob(os.path.join(self.data_dir, "*.bin")), reverse=True):
            intake_id = os.path.splitext(os.path.basename(fn))[0]
            try:
                with open(fn, "rb") as f:
                    blob = f.read()
                plaintext = self.encryptor.decrypt(blob)
                record = json.loads(plaintext.decode("utf-8"))
                intake = record.get("intake") or {}
                items.append({"id": record.get("id") or intake_id, "submittedAt": record.get("submittedAt") or "", "summary": self._summary(intake)})
            except Exception:
                items.append({"id": intake_id, "submittedAt": "", "summary": {"client": "(unreadable)", "state": "", "services": [], "digital": []}})
        return items

    @staticmethod
    def _summary(intake: Dict[str, Any]) -> Dict[str, Any]:
        def get(path, default=""):
            cur = intake
            for p in path.split("."):
                if not isinstance(cur, dict) or p not in cur:
                    return default
                cur = cur[p]
            return cur

        services = []
        if get("services.will") is True: services.append("Will")
        if get("services.trust") is True: services.append("Trust")
        if get("services.poa") is True: services.append("POA")
        if get("services.health") is True: services.append("Health")
        if get("services.digital") is True: services.append("Digital")

        digital = []
        if str(get("digital.exchanges", "")).strip() or str(get("digital.wallets", "")).strip(): digital.append("Crypto")
        if str(get("digital.nfts", "")).strip(): digital.append("NFTs")
        if str(get("digital.social", "")).strip(): digital.append("Social")
        if str(get("digital.domains", "")).strip(): digital.append("Domains/Online")

        return {"client": str(get("client.fullName", "—")), "email": str(get("client.email", "")), "state": str(get("client.state", "—")), "services": services, "digital": digital}

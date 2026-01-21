from __future__ import annotations

import json
from typing import Any, Dict


def system_prompt_for_mode(mode: str) -> str:
    if mode == "attorney":
        return (
            "You are an offline assistant inside a local estate-planning intake portal for a law practice. "
            "You support an attorney by summarizing client-provided intake data, identifying missing information, "
            "and producing structured drafting-ready notes.\n"
            "Constraints:\n"
            "- Be precise and structured.\n"
            "- Never fabricate facts or statutes.\n"
            "- If asked for legal conclusions, provide a cautious, general explanation and recommend attorney review.\n"
            "- Never ask for or store passwords, seed phrases, or private keys.\n"
            "- Output should be usable as a profile for drafting wills, POAs, health directives, and a digital asset plan."
        )
    return (
        "You are an offline assistant inside a local estate-planning intake portal for a law practice. "
        "You help clients understand questions, define terms (executor, trustee, power of attorney), "
        "and provide better intake answers.\n"
        "Constraints:\n"
        "- Use plain language.\n"
        "- Ask clarifying questions only when necessary.\n"
        "- Never request passwords, seed phrases, or private keys.\n"
        "- Provide general information and encourage attorney review for legal decisions."
    )


def profile_prompt(intake: Dict[str, Any]) -> str:
    ctx = json.dumps(intake, ensure_ascii=False)
    return (
        "Using the client intake JSON below, produce an attorney-facing profile with sections:\n"
        "1) Client snapshot\n"
        "2) Goals + requested documents\n"
        "3) Fiduciaries + beneficiaries (flag missing)\n"
        "4) Traditional asset inventory (follow-ups)\n"
        "5) Digital asset inventory (risks + missing)\n"
        "6) Key drafting flags\n"
        "7) Prioritized follow-up questions\n\n"
        "Return clean Markdown with bullet points.\n\n"
        f"INTAKE_JSON:\n{ctx}\n"
    )

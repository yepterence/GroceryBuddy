"""Item identity (ADR 0001, docs/adr/0001-item-identity-by-normalized-name.md)."""


def normalize_item_name(name: str) -> str:
    """Lowercase and collapse whitespace runs; merges spellings, never meanings."""
    return " ".join(name.split()).lower()

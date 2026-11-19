"""Non-secret source identity; not provider provenance or deployment health."""
import hashlib
from pathlib import Path


def backend_source_fingerprint(root=None):
    root = Path(root) if root is not None else Path(__file__).resolve().parent
    # Include all runtime Python modules and the dependency declaration, never .env,
    # database data, credentials, bytecode, or tests. Relative names bind file layout.
    files = sorted(path for path in root.rglob('*.py')
                   if not {'tests', '__pycache__'} & set(path.relative_to(root).parts))
    files.append(root / 'requirements.txt')
    digest = hashlib.sha256()
    for path in files:
        name = path.relative_to(root).as_posix().encode('utf-8')
        content_hash = hashlib.sha256(path.read_bytes()).digest()
        digest.update(name + b'\0' + content_hash)
    return digest.hexdigest()

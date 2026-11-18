"""Process, filesystem and Git primitives used by the coordinator."""
import contextlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import uuid


class Failure(RuntimeError):
    pass


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                     delete=False) as out:
        json.dump(value, out, indent=2, ensure_ascii=False)
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())
    os.replace(out.name, path)


@contextlib.contextmanager
def lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        stream.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise Failure("Another coordinator owns the repository lock") from exc
        yield


def command(argv, cwd, timeout=120, stdin=None, log=None):
    """Use argv directly. Terminate the timed-out process group before retry."""
    if not argv or not all(isinstance(a, str) for a in argv):
        raise Failure("Expected a nonempty argument array")
    argv = [sys.executable if a == "{python}" else a for a in argv]
    opts = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
            if os.name == "nt" else {"start_new_session": True})
    with subprocess.Popen(argv, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, **opts) as proc:
        expired = False
        try:
            out, err = proc.communicate(stdin.encode() if stdin is not None else None,
                                        timeout=timeout)
        except subprocess.TimeoutExpired:
            expired = True
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                               capture_output=True, check=False)
            else:
                os.killpg(proc.pid, signal.SIGKILL)
            proc.kill()
            out, err = proc.communicate()
    out, err = (data.decode("utf-8", errors="replace") for data in (out, err))
    if log:
        save(log, {"command": argv, "returncode": proc.returncode,
                   "timeout": expired, "stdout": out, "stderr": err})
    if expired or proc.returncode:
        why = "timed out" if expired else f"exit {proc.returncode}"
        raise Failure(f"{argv[0]} {why}: {(err or out)[-1500:]}")
    return out


def git(cwd, *args):
    return command(["git", *args], cwd).strip()


def head(tree):
    return git(tree, "rev-parse", "HEAD")


def require_clean(tree, branch, expected=None):
    if git(tree, "symbolic-ref", "--short", "HEAD") != branch:
        raise Failure(f"Unexpected branch in {tree}")
    if expected and head(tree) != expected:
        raise Failure(f"Unexpected commit in {tree}")
    if git(tree, "status", "--porcelain", "--untracked-files=all",
           "--ignore-submodules=none"):
        raise Failure(f"Dirty worktree retained: {tree}")


def paths_changed(tree, base, tip):
    data = command(["git", "diff", "--name-only", "--no-renames", "-z", base, tip], tree)
    return [p for p in data.split("\0") if p]


def within(path, owner):
    return path == owner or path.startswith(owner + "/")


def overlap(left, right):
    return any(within(a.casefold(), b.casefold()) or within(b.casefold(), a.casefold())
               for a in left for b in right)


def create_tree(root, base, purpose):
    token = uuid.uuid4().hex[:16]
    branch = f"ai-team/{purpose}-{token}"
    tree = root.parent / f"ai-{purpose}-{token}"
    git(root, "worktree", "add", "-b", branch, str(tree), base)
    require_clean(tree, branch, base)
    return branch, tree


def probe(spec, root):
    exe = next((shutil.which(name) for name in spec["executables"] if shutil.which(name)), None)
    if not exe:
        raise Failure("CLI unavailable: " + ", ".join(spec["executables"]))
    version = command([exe, "--version"], root, 15).strip()
    help_text = command([exe, "--help"], root, 15)
    argv = spec.get("args")
    if argv is None:
        raise Failure(f"{version}: configure the verified noninteractive command in config.json")
    for sub in spec.get("subcommand", []):
        if not re.search(r"(?<![\w-])" + re.escape(sub) + r"(?![\w-])", help_text):
            raise Failure(f"{version}: {sub} absent from help")
        help_text = command([exe, *spec["subcommand"], "--help"], root, 15)
    for flag in argv:
        if flag.startswith("-") and flag != "-":
            if not re.search(r"(?<![\w-])" + re.escape(flag.split("=")[0]) + r"(?![\w-])", help_text):
                raise Failure(f"{version}: unsupported flag {flag}")
    return version, [exe, *spec.get("subcommand", []), *argv]

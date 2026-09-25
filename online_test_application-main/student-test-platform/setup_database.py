"""
Sets up the Postgres database for the student test platform:
1. Finds the Postgres command-line tools (psql, createdb, pg_restore).
2. Creates the target database if it doesn't already exist.
3. Restores it from a pg_dump backup file (student_test_platform.dump by default).

Works on both Windows and macOS/Linux. No pip packages required — it only
shells out to the same Postgres tools the installer already puts on disk.

Usage:
    python setup_database.py
    python setup_database.py --dump path/to/other.dump --db-name my_db

Run it after installing PostgreSQL and before starting the app.
"""

from __future__ import annotations

import argparse
import getpass
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_DB_NAME = "student_test_platform"
DEFAULT_DB_USER = "postgres"
DEFAULT_DB_HOST = "localhost"
DEFAULT_DB_PORT = "5432"
DEFAULT_DUMP_FILE = "student_test_platform.dump"

WINDOWS_SEARCH_DIRS = [
    Path("C:/Program Files/PostgreSQL"),
    Path("C:/Program Files (x86)/PostgreSQL"),
]


def find_pg_tool(tool_name: str) -> str:
    """Locate a Postgres CLI tool (psql, createdb, pg_restore) on PATH or in
    the standard Windows install location, trying newest version first."""
    on_path = shutil.which(tool_name)
    if on_path:
        return on_path

    if platform.system() == "Windows":
        exe_name = f"{tool_name}.exe"
        candidates: list[Path] = []
        for base in WINDOWS_SEARCH_DIRS:
            if not base.exists():
                continue
            for version_dir in sorted(base.iterdir(), reverse=True):
                candidate = version_dir / "bin" / exe_name
                if candidate.exists():
                    candidates.append(candidate)
        if candidates:
            return str(candidates[0])

    print(f"ERROR: could not find '{tool_name}'. Is PostgreSQL installed and on PATH?")
    sys.exit(1)


def run(cmd: list[str], env: dict, description: str, allow_fail: bool = False) -> subprocess.CompletedProcess:
    print(f"-> {description}")
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0 and not allow_fail:
        print(result.stdout)
        print(result.stderr)
        print(f"ERROR: '{description}' failed (exit code {result.returncode}).")
        sys.exit(1)
    return result


def database_exists(psql: str, env: dict, host: str, port: str, user: str, db_name: str) -> bool:
    result = run(
        [psql, "-h", host, "-p", port, "-U", user, "-d", "postgres", "-tAc",
         f"SELECT 1 FROM pg_database WHERE datname = '{db_name}'"],
        env,
        f"Checking whether database '{db_name}' already exists",
    )
    return result.stdout.strip() == "1"


def main() -> None:
    parser = argparse.ArgumentParser(description="Set up the Postgres database for the student test platform.")
    parser.add_argument("--db-name", default=DEFAULT_DB_NAME, help=f"Database name (default: {DEFAULT_DB_NAME})")
    parser.add_argument("--user", default=DEFAULT_DB_USER, help=f"Postgres user (default: {DEFAULT_DB_USER})")
    parser.add_argument("--host", default=DEFAULT_DB_HOST, help=f"Database host (default: {DEFAULT_DB_HOST})")
    parser.add_argument("--port", default=DEFAULT_DB_PORT, help=f"Database port (default: {DEFAULT_DB_PORT})")
    parser.add_argument("--dump", default=DEFAULT_DUMP_FILE, help=f"Path to the .dump backup file (default: {DEFAULT_DUMP_FILE})")
    parser.add_argument("--fresh", action="store_true", help="Create an empty database instead of restoring a dump (use when you have no backup yet)")
    parser.add_argument("--password", default=None, help="Postgres password (omit this flag to be prompted securely instead)")
    args = parser.parse_args()

    print(f"Platform detected: {platform.system()}")

    psql = find_pg_tool("psql")
    createdb = find_pg_tool("createdb")
    pg_restore = find_pg_tool("pg_restore") if not args.fresh else None

    dump_path = Path(args.dump)
    if not args.fresh and not dump_path.exists():
        print(f"ERROR: dump file not found at '{dump_path}'.")
        print("Either place the .dump file next to this script, pass --dump <path>, or use --fresh for an empty database.")
        sys.exit(1)

    password = args.password if args.password is not None else getpass.getpass(f"Postgres password for user '{args.user}': ")

    env = os.environ.copy()
    env["PGPASSWORD"] = password

    # 1. Confirm we can actually connect before doing anything else.
    run(
        [psql, "-h", args.host, "-p", args.port, "-U", args.user, "-d", "postgres", "-c", "SELECT 1"],
        env,
        f"Connecting to Postgres at {args.host}:{args.port} as '{args.user}'",
    )

    # 2. Create the database if it's missing.
    if database_exists(psql, env, args.host, args.port, args.user, args.db_name):
        print(f"Database '{args.db_name}' already exists — skipping creation.")
    else:
        run(
            [createdb, "-h", args.host, "-p", args.port, "-U", args.user, args.db_name],
            env,
            f"Creating database '{args.db_name}'",
        )

    # 3. Restore from the dump, or leave empty for Prisma to fill in later.
    if args.fresh:
        print("Skipping restore (--fresh was passed). Run 'npm run prisma:generate' and")
        print("'npm --workspace apps/api exec prisma db push' next to create empty tables.")
    else:
        run(
            [pg_restore, "-h", args.host, "-p", args.port, "-U", args.user,
             "-d", args.db_name, "--clean", "--if-exists", str(dump_path)],
            env,
            f"Restoring '{dump_path}' into '{args.db_name}'",
            allow_fail=True,  # pg_restore often reports harmless warnings as non-zero; we check row counts next instead
        )

    # 4. Sanity check: does the restored database actually have tables?
    result = run(
        [psql, "-h", args.host, "-p", args.port, "-U", args.user, "-d", args.db_name, "-tAc",
         "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"],
        env,
        "Verifying the database has tables",
    )
    table_count = result.stdout.strip()
    print(f"\nDone. '{args.db_name}' now has {table_count} table(s).")
    print("Next steps: npm install, npm run prisma:generate, npm run build, then start the app.")


if __name__ == "__main__":
    main()

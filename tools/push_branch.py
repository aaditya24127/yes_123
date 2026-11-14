"""Push the changes in this folder to GitHub as a new branch, ready for a pull request (the owner merges; never push to main).

    python tools/push_branch.py "Commit message"                 (branch name is made from the message)
    python tools/push_branch.py "Commit message" my-branch
    python tools/push_branch.py "Commit message" --dry-run       (shows what would be pushed, changes nothing on GitHub)

What it does: keeps a clone of the repository in a temporary folder, makes a branch from origin/main, copies every changed file from
this project folder into it (each file keeps the line endings it has in the repository, pictures / audio are copied untouched),
stops if something looks like a secret, commits with the Claude co-author line, pushes the branch and prints the pull-request link.
Needs: git, and GitHub sign-in on this computer (Git Credential Manager does it the first time, or use a personal access token).
Files that exist only here (deck, step guide, test audio) and npm lock-file noise are skipped on purpose: see SKIP.
Files you deleted here are NOT deleted on GitHub (it only lists them); remove those by hand in the pull request if needed.
"""
import os, re, subprocess, sys, tempfile

REPO = os.environ.get('CRP_REPO', 'https://github.com/aaditya24127/yes_123.git')
PR_BASE = REPO[:-4] if REPO.endswith('.git') else REPO
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WT = os.path.join(os.environ.get('LOCALAPPDATA') or tempfile.gettempdir(), 'Temp' if os.environ.get('LOCALAPPDATA') else '', 'crp_push')
TRAILER = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'
DIRS = ['backend', 'frontend', 'database', 'config', 'docs', 'teacher-app', 'landing', 'evaluation', 'generator', 'tools', 'sample data']
FILES = ['PROJECT_CONTEXT.md', 'HANDOVER.md', 'CLAUDE.md', 'AGENTS.md', '.env.example', 'docker-compose.yml', 'start.ps1', 'README.md', 'LICENSE']
SKIP_DIRS = {'node_modules', '.next', '.venv', '__pycache__', 'storage', 'out', 'app-build', 'pgsql', 'pgdata', '.git'}
SKIP_NAMES = {'next-env.d.ts', 'tsconfig.tsbuildinfo', '_pgstart.txt'}
SKIP = {'docs/CRP_Mentor_Copilot_Deck.pptx', 'landing/package-lock.json', 'tools/_pwfile'}          # not published until the owner asks
BINARY = ('.mp3', '.png', '.jpg', '.jpeg', '.pdf', '.ico', '.webp', '.woff', '.woff2', '.pptx', '.xlsx', '.docx', '.zip', '.wav', '.m4a')
SECRET = re.compile(r"sk-ant-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|postgres(?:ql)?://[^\s:@/]+:[^\s@/]{3,}@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}|"
                    r"(?i:(?:api[_-]?key|secret|password|service_key)\s*[=:]\s*['\"]?[A-Za-z0-9/+_-]{16,})")


def git(*a, check=True, text=True):
    r = subprocess.run(['git', '-C', WT, *a], capture_output=True, text=text)
    if check and r.returncode: sys.exit(f'git {" ".join(a)} failed:\n{r.stderr.strip()}')
    return r.stdout


def listing():
    for d in DIRS:
        for base, dirs, files in os.walk(os.path.join(ROOT, d)):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for f in files:
                if f in SKIP_NAMES or f.endswith('.log'): continue
                yield os.path.relpath(os.path.join(base, f), ROOT).replace('\\', '/')
    for f in FILES:
        if os.path.exists(os.path.join(ROOT, f)): yield f


def main():
    try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')           # Windows consoles cannot print the robot sign
    except Exception: pass
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    if not args: sys.exit(__doc__)
    msg = args[0]; branch = args[1] if len(args) > 1 else re.sub(r'[^a-z0-9]+', '-', msg.lower()).strip('-')[:40] or 'update'
    os.makedirs(os.path.dirname(WT), exist_ok=True)
    if not os.path.exists(os.path.join(WT, '.git')): subprocess.run(['git', 'clone', '-q', REPO, WT], check=True)
    git('fetch', 'origin', '--prune', '-q')
    git('reset', '--hard', '-q'); git('clean', '-fdq')                          # the temporary clone starts clean every time
    git('checkout', '-q', '-B', branch, 'origin/main')
    changed = []
    for rel in listing():
        if rel in SKIP: continue
        src, dst = os.path.join(ROOT, rel), os.path.join(WT, rel)
        new = open(src, 'rb').read()
        if not rel.lower().endswith(BINARY):
            head = subprocess.run(['git', '-C', WT, 'show', f'origin/main:{rel}'], capture_output=True).stdout
            crlf = b'\r\n' in head if head else b'\r\n' in new            # keep the repository's line endings for this file
            new = new.replace(b'\r\n', b'\n')
            if crlf: new = new.replace(b'\n', b'\r\n')
        old = open(dst, 'rb').read() if os.path.exists(dst) else None
        if old is None or (old.replace(b'\r\n', b'\n') != new.replace(b'\r\n', b'\n') if not rel.lower().endswith(BINARY) else old != new):
            os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(new); changed.append(rel)
    if not changed:
        git('checkout', '-q', 'main', check=False); print('Nothing to push: this folder matches origin/main.'); return
    git('add', '-A')
    print('Changed files:'); [print('  ', f) for f in changed]; print(git('diff', '--cached', '--stat').strip().splitlines()[-1])
    bad = [(l[:120]) for l in git('diff', '--cached', '-U0').splitlines() if l.startswith('+') and not l.startswith('+++') and SECRET.search(l)]
    if bad: git('reset', '-q'); sys.exit('STOPPED: this looks like a secret, not pushed:\n  ' + '\n  '.join(bad[:5]))
    if dry: git('reset', '-q'); print('Dry run: nothing committed or pushed.'); return
    subprocess.run(['git', '-C', WT, 'commit', '-q', '-m', msg, '-m', TRAILER], check=True)
    git('push', '-u', 'origin', branch)
    print(f'\nPushed branch {branch}. Open this link to create the pull request:\n{PR_BASE}/pull/new/{branch}\n'
          'PR description ends with: 🤖 Generated with [Claude Code](https://claude.com/claude-code)')


if __name__ == '__main__':
    main()

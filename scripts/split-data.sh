#!/bin/sh
# One-time: move the personal data in this checkout (data/, themes/custom/)
# into its own private repository, placed where the app keeps its data folder.
#
#   sh scripts/split-data.sh
#
# 1. Builds the app, so a build that fails stops here with nothing moved.
# 2. Makes ~/Library/Application Support/com.mschachner.tembo/data a git
#    repository holding library.txt, attempts.jsonl, settings.json and the
#    saved presets, and pushes it to a new private GitHub repository,
#    tembo-data.
# 3. Removes those files from this repository, points the daily task's
#    standing rules (watering-hole/_backlog.md) at the data repository,
#    commits and pushes.
# 4. Installs the app it built in /Applications.
#
# It stops before changing anything if something is not as expected. This
# repository's history is left as it is. Delete this script once it has run.
set -eu
cd "$(dirname "$0")/.."

dest="$HOME/Library/Application Support/com.mschachner.tembo/data"
repo=tembo-data
built=src-tauri/target/release/bundle/macos/Tembo.app

die() { echo "split-data: $*" >&2; exit 1; }

command -v gh >/dev/null || die "needs the GitHub CLI (gh)"
gh auth status >/dev/null 2>&1 || die "gh is not signed in (gh auth login)"
[ -f data/attempts.jsonl ] || die "data/attempts.jsonl is not here; has the data already been moved?"
[ -f data/library.txt ] || die "data/library.txt is not here"
[ ! -e "$dest/.git" ] || die "$dest is already a git repository"
[ ! -e "$dest/attempts.jsonl" ] || die "$dest already holds an attempt log"
[ ! -e "$dest/library.txt" ] || die "$dest already holds a library"
if pgrep -x Tembo >/dev/null 2>&1; then die "quit Tembo first"; fi
[ "$(git branch --show-current)" = main ] || die "this checkout is not on main"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "this checkout has uncommitted changes"

echo "Building the app"
npm install --no-audit --no-fund
npx tauri build --bundles app
[ -d "$built" ] || die "the build left no $built"

# Tembo must stay closed from here on: the installed app still writes to data/.
if pgrep -x Tembo >/dev/null 2>&1; then die "quit Tembo, then run this again"; fi
# Attempts and library changes that only the remote has yet.
git pull --quiet --rebase origin main

echo "Copying the data to $dest"
mkdir -p "$dest"
cp data/library.txt data/attempts.jsonl "$dest/"
for f in data/settings.json data/attempts.backup-*.jsonl; do
  if [ -e "$f" ]; then cp "$f" "$dest/"; fi
done
for f in themes/custom/*.json; do
  if [ -e "$f" ]; then
    mkdir -p "$dest/themes"
    cp "$f" "$dest/themes/"
  fi
done
printf 'attempts.backup-*.jsonl\n.DS_Store\n' > "$dest/.gitignore"

git -C "$dest" init --quiet -b main
git -C "$dest" add --all
git -C "$dest" commit --quiet -m "Data moved out of the Tembo repository"
echo "Creating the private repository $repo"
gh repo create "$repo" --private --source "$dest" --remote origin
git -C "$dest" push --quiet -u origin main

# Everything under data/ and themes/custom/ now has an identical copy.
for f in data/* themes/custom/*; do
  if [ -f "$f" ]; then
    case "$f" in
      data/*) copy="$dest/${f#data/}" ;;
      *) copy="$dest/themes/${f#themes/custom/}" ;;
    esac
    cmp -s "$f" "$copy" || die "$f was not copied to $copy; nothing has been removed from this checkout"
  fi
done

echo "Removing the data from this repository"
git rm --quiet -r data
rm -rf data themes/custom
perl -pi -e 's{`data/library\.txt`}{`library.txt` in the data repository (`tembo-data`)}g' watering-hole/_backlog.md
git add watering-hole/_backlog.md
git commit --quiet -m "Personal data moved to the tembo-data repository"
git push --quiet origin main

echo "Installing the app in /Applications"
rm -rf /Applications/Tembo.app
cp -R "$built" /Applications/

echo
echo "Done. Data: $dest (github: $repo, private)."
echo "Left to do by hand: attach $repo to the daily quiz task, which now reads"
echo "attempts.jsonl and library.txt at the root of $repo instead of data/ here."

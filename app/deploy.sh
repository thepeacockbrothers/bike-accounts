#!/bin/sh
# Builds the app and publishes it to the gh-pages branch (GitHub Pages serves that branch
# at accounts.themobilebikeman.co.uk). Run from the app folder: ./deploy.sh
set -e
cd "$(dirname "$0")"
npm test
npm run build
touch dist/.nojekyll
REMOTE=$(git -C .. remote get-url origin)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="Ryan Peacock" -c user.email="ryanxpeacock97@gmail.com" commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Published. Live at https://accounts.themobilebikeman.co.uk in a minute or two."

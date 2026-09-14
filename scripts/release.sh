#!/bin/bash
set -e

# ─── Config ───────────────────────────────────────────────────────────────────
REMOTE="p"  # GitHub remote: Paper-Crane-Devteam/better-sidebar-for-google-gemini-and-ai-studio
# ──────────────────────────────────────────────────────────────────────────────

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"
NOTES_FILE="src/entrypoints/overlay.content/shared/modules/whats-new/changelog/${VERSION}/en.md"

echo "📦 Releasing ${TAG}..."

# ─── Preflight checks ─────────────────────────────────────────────────────────
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is not installed. Install it with: brew install gh"
  exit 1
fi

if [ ! -f "$NOTES_FILE" ]; then
  echo "❌ Release notes not found: ${NOTES_FILE}"
  exit 1
fi

REPO="Paper-Crane-Devteam/better-sidebar-for-google-gemini-and-ai-studio"

# Check if release already exists
if gh release view "$TAG" --repo "$REPO" &> /dev/null; then
  echo "❌ Release ${TAG} already exists on GitHub!"
  echo "   Delete it first with: gh release delete ${TAG} --repo ${REPO}"
  exit 1
fi

# ─── Build ─────────────────────────────────────────────────────────────────────
echo "🔨 Building Chrome extension..."
npm run zip

echo "🔨 Building Firefox extension..."
npm run zip:firefox

# ─── Locate build artifacts ───────────────────────────────────────────────────
CHROME_ZIP=$(ls .output/*-${VERSION}-chrome.zip 2>/dev/null | head -1)
FIREFOX_ZIP=$(ls .output/*-${VERSION}-firefox.zip 2>/dev/null | head -1)

ASSETS=""
if [ -n "$CHROME_ZIP" ]; then
  echo "✅ Chrome zip: ${CHROME_ZIP}"
  ASSETS="${ASSETS} ${CHROME_ZIP}"
else
  echo "⚠️  Chrome zip not found, skipping..."
fi

if [ -n "$FIREFOX_ZIP" ]; then
  echo "✅ Firefox zip: ${FIREFOX_ZIP}"
  ASSETS="${ASSETS} ${FIREFOX_ZIP}"
else
  echo "⚠️  Firefox zip not found, skipping..."
fi

if [ -z "$ASSETS" ]; then
  echo "❌ No build artifacts found!"
  exit 1
fi

# ─── Create git tag (if not exists) ───────────────────────────────────────────
if git rev-parse "$TAG" &> /dev/null; then
  echo "ℹ️  Tag ${TAG} already exists locally"
else
  echo "🏷️  Creating tag ${TAG}..."
  git tag "$TAG"
  git push "$REMOTE" "$TAG"
fi

# ─── Publish GitHub Release ───────────────────────────────────────────────────
echo "🚀 Creating GitHub Release..."
gh release create "$TAG" \
  --repo "$REPO" \
  --title "$TAG" \
  --notes-file "$NOTES_FILE" \
  $ASSETS

echo ""
echo "✅ Release ${TAG} published successfully!"
echo "   View it at: $(gh release view "$TAG" --repo "$REPO" --json url -q .url)"

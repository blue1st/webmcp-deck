#!/bin/bash

# This script updates the Homebrew Cask definition in the tap repository.
# Expected environment variables:
# HOMEBREW_TAP_TOKEN: GitHub Personal Access Token or GitHub App token with repo scope
# VERSION (optional): Target version (defaults to package.json)
# SHA256_ARM (optional): SHA256 hash for arm64 DMG
# SHA256_X64 (optional): SHA256 hash for x64 DMG

set -e

TAP_REPO="blue1st/homebrew-taps"
CASK_NAME="webmcp-deck"
PACKAGE_JSON="package.json"

if [ -z "$HOMEBREW_TAP_TOKEN" ]; then
  echo "⚠️ HOMEBREW_TAP_TOKEN is not set. Skipping automated update."
  exit 0
fi

# Get version from package.json if not provided
if [ -z "$VERSION" ]; then
  VERSION=$(node -p "require('./$PACKAGE_JSON').version")
fi
echo "Updating Homebrew Cask to version $VERSION"

if [ -z "$SHA256_ARM" ] || [ -z "$SHA256_X64" ]; then
  DMG_ARM=$(find . -name "*arm64.dmg" | head -n 1)
  DMG_X64=$(find . \( -name "*x64.dmg" -o -name "*intel.dmg" \) | head -n 1)

  if [ -z "$DMG_ARM" ] || [ -z "$DMG_X64" ]; then
    echo "Error: Could not find both arm64 and x64 DMG files, and SHA256 hashes were not provided."
    echo "ARM: $DMG_ARM"
    echo "X64: $DMG_X64"
    exit 1
  fi

  SHA256_ARM=$(shasum -a 256 "$DMG_ARM" | awk '{print $1}')
  SHA256_X64=$(shasum -a 256 "$DMG_X64" | awk '{print $1}')
fi

echo "ARM SHA256: $SHA256_ARM"
echo "X64 SHA256: $SHA256_X64"

# Clone the tap repository
TMP_DIR=$(mktemp -d)
git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/${TAP_REPO}.git" "$TMP_DIR"

# Ensure Casks directory exists
mkdir -p "$TMP_DIR/Casks"
CASK_FILE="$TMP_DIR/Casks/${CASK_NAME}.rb"

# Create or update the Cask file
cat <<EOF > "$CASK_FILE"
cask "${CASK_NAME}" do
  arch arm: "arm64", intel: "x64"

  version "${VERSION}"
  sha256 arm:   "${SHA256_ARM}",
         intel: "${SHA256_X64}"

  url "https://github.com/blue1st/webmcp-deck/releases/download/v#{version}/WebMCP-Deck-#{version}-#{arch}.dmg"
  name "WebMCP Deck"
  desc "WebMCP Client & Desktop Browser for AI Agents"
  homepage "https://github.com/blue1st/webmcp-deck"

  app "WebMCP Deck.app"

  caveats <<~EOS
    WebMCP Deck is not notarized. If macOS blocks it from running, execute:
      xattr -cr "/Applications/WebMCP Deck.app"
  EOS

  zap trash: [
    "~/Library/Application Support/webmcp-deck",
    "~/Library/Preferences/com.blue1st.webmcp-deck.plist",
    "~/Library/Saved Application State/com.blue1st.webmcp-deck.savedState",
  ]
end
EOF

# Commit and push
cd "$TMP_DIR"
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add "Casks/${CASK_NAME}.rb"
if git diff --staged --quiet; then
  echo "No changes to commit in Cask file."
else
  git commit -m "Update ${CASK_NAME} to v${VERSION}"
  git push origin main || git push origin master
fi

echo "Homebrew tap updated successfully!"

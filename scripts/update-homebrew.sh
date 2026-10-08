#!/bin/bash

# This script updates the Homebrew Cask definition in the tap repository.
# Expected environment variables:
# HOMEBREW_TAP_TOKEN: GitHub Personal Access Token or GitHub App token with repo scope

set -e

TAP_REPO="blue1st/homebrew-taps"
CASK_NAME="webmcp-deck"
PACKAGE_JSON="package.json"

# Get version from package.json
VERSION=$(node -p "require('./$PACKAGE_JSON').version")
echo "Updating Homebrew Cask to version $VERSION"

DMG_ARM=$(find . -name "*arm64.dmg" | head -n 1)
DMG_X64=$(find . -name "*x64.dmg" | head -n 1)

if [ -z "$DMG_ARM" ] || [ -z "$DMG_X64" ]; then
  echo "Error: Could not find both arm64 and x64 DMG files"
  echo "ARM: $DMG_ARM"
  echo "X64: $DMG_X64"
  exit 1
fi

SHA256_ARM=$(shasum -a 256 "$DMG_ARM" | awk '{print $1}')
SHA256_X64=$(shasum -a 256 "$DMG_X64" | awk '{print $1}')

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
git commit -m "Update ${CASK_NAME} to v${VERSION}" || echo "No changes to commit"
git push origin main

echo "Homebrew tap updated successfully!"

#!/bin/bash
# Builds an actual iphoneos archive. The resulting IPA must be signed by the installer before use.
set -euo pipefail
cd "$(dirname "$0")/.."

xcodegen generate --quiet --spec sideload.yml
mkdir -p .build/Unsigned
archive="$PWD/.build/Unsigned/AlphaArc.xcarchive"
output="$PWD/.build/Unsigned/AlphaArc-unsigned.ipa"
xcodebuild archive -project SailBrowser.xcodeproj -scheme SailBrowser \
  -configuration Release -destination generic/platform=iOS \
  -archivePath "$archive" -derivedDataPath .build/UnsignedDerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= \
  CURRENT_PROJECT_VERSION="${CURRENT_PROJECT_VERSION:-1}" \
  SWIFT_TREAT_WARNINGS_AS_ERRORS=YES

app="$archive/Products/Applications/SailBrowser.app"
plist="$app/Info.plist"
[ "$(plutil -extract DTPlatformName raw -o - "$plist")" = iphoneos ]
[ "$(plutil -extract CFBundleIdentifier raw -o - "$plist")" = com.yoyovich.alphaarc ]
[ "$(plutil -extract CFBundleDisplayName raw -o - "$plist")" = AlphaArc ]
[ "$(plutil -extract SailCloudSyncEnabled raw -o - "$plist")" = NO ]
executable=$(plutil -extract CFBundleExecutable raw -o - "$plist")
[ "$(lipo -archs "$app/$executable")" = arm64 ]

packaging=$(mktemp -d)
trap 'rm -rf "$packaging"' EXIT
mkdir "$packaging/Payload"
ditto "$app" "$packaging/Payload/SailBrowser.app"
(cd "$packaging" && ditto -c -k --keepParent Payload "$output")
unzip -tq "$output"
echo "Unsigned device IPA: $output"

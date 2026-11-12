#!/usr/bin/env bash
# Shared by unsigned readiness and signed release; never runs a release lane.
set -euo pipefail
: "${FASTLANE_VERSION:?FASTLANE_VERSION is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_PATH:?GITHUB_PATH is required}"
export FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_HIDE_CHANGELOG=1 FASTLANE_OPT_OUT_USAGE=1
gem install fastlane --no-document --version "$FASTLANE_VERSION"
mkdir -p "$RUNNER_TEMP/rmc-bin"
printf '%s\n' '#!/usr/bin/env ruby' 'gem "fastlane", ENV.fetch("FASTLANE_VERSION")' 'load Gem.bin_path("fastlane", "fastlane", ENV.fetch("FASTLANE_VERSION"))' > "$RUNNER_TEMP/rmc-bin/fastlane"
chmod +x "$RUNNER_TEMP/rmc-bin/fastlane"
export PATH="$RUNNER_TEMP/rmc-bin:$PATH"
echo "$RUNNER_TEMP/rmc-bin" >> "$GITHUB_PATH"
ruby -e 'gem "fastlane", ENV.fetch("FASTLANE_VERSION"); require "fastlane"; abort "unexpected fastlane version" unless Fastlane::VERSION == ENV.fetch("FASTLANE_VERSION")'
# No Fastfile is evaluated, no credentials are used, and no build is uploaded.
fastlane --version

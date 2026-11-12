# Evaluate the real Fastfile with fail-closed local action doubles, never Fastlane.
require "tmpdir"

root = File.expand_path("..", __dir__)
fastfile = File.join(root, "frontend/ios/App/fastlane/Fastfile")
app = File.dirname(File.dirname(fastfile))
class StopBeforeBuild < StandardError; end

Dir.mktmpdir("rmc-fastlane-paths") do |unrelated|
  [app, File.dirname(fastfile), unrelated].each do |cwd|
    harness = Object.new
    captured = {}
    harness.define_singleton_method(:default_platform) { |_| }
    harness.define_singleton_method(:platform) { |_, &block| instance_eval(&block) }
    harness.define_singleton_method(:desc) { |_| }
    harness.define_singleton_method(:lane) { |_, &block| captured[:lane] = block }
    harness.define_singleton_method(:get_version_number) { |**args| captured[:version] = args; "1.0" }
    harness.define_singleton_method(:app_store_connect_api_key) { |**_| :fake_key }
    harness.define_singleton_method(:latest_testflight_build_number) { |**_| 14 }
    harness.define_singleton_method(:increment_build_number) { |**args| captured[:increment] = args }
    harness.define_singleton_method(:build_app) { |**args| captured[:build] = args; raise StopBeforeBuild }
    # Any unexpected action (including shell execution or upload) raises NoMethodError.
    Dir.chdir(cwd) do
      harness.instance_eval(File.read(fastfile), fastfile)
      paths = harness.rmc_release_paths
      expected = {
        project: File.join(app, "App.xcodeproj"), workspace: File.join(app, "App.xcworkspace"),
        output: File.join(app, "build/ios/ipa"), ipa: File.join(app, "build/ios/ipa/App.ipa"),
        verify: File.join(app, "build/ios/ipa/verify"),
        receipt: File.join(app, "build/ios/ipa/release-ipa-metadata.txt")
      }
      raise "Release paths depend on working directory" unless paths == expected
      # Fixture values only; no real provider or build implementation is loaded.
      fixture = {"ASC_KEY_ID" => "ABCDEFGHIJ", "ASC_ISSUER_ID" => "00000000-0000-0000-0000-000000000000", "ASC_KEY_P8" => "fixture"}
      old = fixture.keys.to_h { |key| [key, ENV[key]] }
      begin
        ENV.update(fixture)
        begin
          captured[:lane].call
          raise "Expected stop before build"
        rescue StopBeforeBuild
          # The test never builds, signs, uploads or invokes a shell.
        end
      ensure
        old.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
      end
      raise "Wrong version project" unless captured[:version][:xcodeproj] == paths[:project]
      raise "Wrong increment project" unless captured[:increment][:xcodeproj] == paths[:project]
      build = captured.fetch(:build)
      raise "Wrong archive workspace" unless build[:workspace] == paths[:workspace]
      raise "Artifact output mismatch" unless File.join(build[:output_directory], build[:output_name]) == paths[:ipa]
    end
  end
end
puts "Fastfile paths and build arguments passed from three working directories; no provider actions executed."

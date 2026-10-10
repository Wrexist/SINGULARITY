require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'SingularityCapacitorGameConnect'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'UNLICENSED'
  s.homepage = 'https://github.com/Wrexist/SINGULARITY'
  s.author = 'Singularity Inc.'
  s.source = { :git => 'https://github.com/Wrexist/SINGULARITY.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.frameworks = 'GameKit'
  s.swift_version = '5.9'
end

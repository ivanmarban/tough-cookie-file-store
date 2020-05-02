# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v2.0.0]
### Added
- `tough-cookie@4` support.
- Code style: ESLint + Standard + Prettier.
- Test coverage.

### Changed
- Refactored module.

### Removed
- isEmtpy() and isExpired() methods

## [v1.2.0] - 2016-08-09
### Added
- Added getAllCookies() method.

### Changed
- Updated tough-cookie dependency.

### Fixed
- Avoid redundant fs.writeFile() operations on same file.

## [v1.1.1] - 2016-08-09
### Changed
- Updated tough-cookie dependency.

## [v1.1.0] - 2016-02-10
### Added
- isEmpty() method.

## [v1.0.0] - 2016-02-10
- Initial version.

[unreleased]: https://github.com/ivanmarban/tough-cookie-file-store/compare/v2.0.0...develop
[v2.0.0]: https://github.com/ivanmarban/tough-cookie-file-store/compare/v1.2.0...v2.0.0
[v1.2.0]: https://github.com/ivanmarban/tough-cookie-file-store/compare/v1.1.1...v1.2.0
[v1.1.1]: https://github.com/ivanmarban/tough-cookie-file-store/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/ivanmarban/tough-cookie-file-store/compare/v1.0.0...v1.1.0
[v1.0.0]: https://github.com/ivanmarban/tough-cookie-file-store/releases/tag/v1.0.0

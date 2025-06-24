# tough-cookie-file-store

[![NPM](https://nodei.co/npm/tough-cookie-file-store.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/tough-cookie-file-store/)

A JSON file store implementation for [tough-cookie][0] module

[![Version npm](https://img.shields.io/npm/v/tough-cookie-file-store.svg)](https://www.npmjs.com/package/tough-cookie-file-store)
[![npm Downloads](https://img.shields.io/npm/dw/tough-cookie-file-store.svg)](https://npmcharts.com/compare/tough-cookie-file-store?minimal=true)
[![Tests Status](https://github.com/ivanmarban/tough-cookie-file-store/actions/workflows/ci.yaml/badge.svg?branch=master)](https://github.com/ivanmarban/tough-cookie-file-store/actions/workflows/tests.yml)
[![Coverage Status](https://codecov.io/gh/ivanmarban/tough-cookie-file-store/graph/badge.svg?token=J7gn5JV9dd)](https://codecov.io/gh/ivanmarban/tough-cookie-file-store)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Installation
``` sh
$ npm install tough-cookie-file-store
```

## Usage
``` js
import { CookieJar, Cookie } from 'tough-cookie'
import FileCookieStore from 'tough-cookie-file-store'
const cookieJar = new CookieJar(new FileCookieStore('./cookie.json'))
const cookie = Cookie.parse('foo=bar; Domain=example.com; Path=/')
cookieJar.setCookie(cookie, 'http://example.com', function (error, cookie) {
  console.log(cookie)
})
```

## License
MIT

[0]: https://github.com/salesforce/tough-cookie

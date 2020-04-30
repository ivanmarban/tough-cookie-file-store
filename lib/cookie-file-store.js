'use strict'
const { Store, permuteDomain, pathMatch, Cookie } = require('tough-cookie')
const util = require('util')
const fs = require('fs')

class FileCookieStore extends Store {
  constructor (filePath) {
    super()
    this.synchronous = true
    this.idx = {}
    this.filePath = filePath
    /* istanbul ignore else  */
    if (util.inspect.custom) {
      this[util.inspect.custom] = this.inspect
    }
    const self = this
    /* istanbul ignore else  */
    if (!filePath) {
      throw new Error('Unknown file for read/write cookies')
    }
    this._loadFromFile(this.filePath, function (dataJson) {
      /* istanbul ignore else  */
      if (dataJson) self.idx = dataJson
    })
  }

  inspect () {
    return `{ idx: ${util.inspect(this.idx, false, 2)} }`
  }

  findCookie (domain, path, key, cb) {
    if (!this.idx[domain]) {
      return cb(null, undefined)
    }
    if (!this.idx[domain][path]) {
      return cb(null, undefined)
    }
    return cb(null, this.idx[domain][path][key] || null)
  }

  findCookies (domain, path, cb) {
    const results = []

    if (!domain) {
      return cb(null, [])
    }

    let pathMatcher
    if (!path) {
      // null means "all paths"
      pathMatcher = function matchAll (domainIndex) {
        for (const curPath in domainIndex) {
          const pathIndex = domainIndex[curPath]
          for (const key in pathIndex) {
            results.push(pathIndex[key])
          }
        }
      }
    } else {
      pathMatcher = function matchRFC (domainIndex) {
        Object.keys(domainIndex).forEach(cookiePath => {
          if (pathMatch(path, cookiePath)) {
            const pathIndex = domainIndex[cookiePath]
            for (const key in pathIndex) {
              results.push(pathIndex[key])
            }
          }
        })
      }
    }

    const domains = permuteDomain(domain) || [domain]
    const idx = this.idx
    domains.forEach(curDomain => {
      const domainIndex = idx[curDomain]
      if (!domainIndex) {
        return
      }
      pathMatcher(domainIndex)
    })

    cb(null, results)
  }

  putCookie (cookie, cb) {
    if (!this.idx[cookie.domain]) {
      this.idx[cookie.domain] = {}
    }
    if (!this.idx[cookie.domain][cookie.path]) {
      this.idx[cookie.domain][cookie.path] = {}
    }
    this.idx[cookie.domain][cookie.path][cookie.key] = cookie
    this._saveToFile(this.filePath, this.idx, function () {
      cb(null)
    })
  }

  updateCookie (oldCookie, newCookie, cb) {
    // updateCookie() may avoid updating cookies that are identical.  For example,
    // lastAccessed may not be important to some stores and an equality
    // comparison could exclude that field.
    this.putCookie(newCookie, cb)
  }

  removeCookie (domain, path, key, cb) {
    /* istanbul ignore else  */
    if (this.idx[domain] && this.idx[domain][path] && this.idx[domain][path][key]) {
      delete this.idx[domain][path][key]
    }
    this._saveToFile(this.filePath, this.idx, function () {
      cb(null)
    })
  }

  removeCookies (domain, path, cb) {
    /* istanbul ignore else  */
    if (this.idx[domain]) {
      if (path) {
        delete this.idx[domain][path]
      } else {
        delete this.idx[domain]
      }
    }
    this._saveToFile(this.filePath, this.idx, function () {
      return cb(null)
    })
  }

  removeAllCookies (cb) {
    this.idx = {}
    this._saveToFile(this.filePath, this.idx, function () {
      return cb(null)
    })
  }

  getAllCookies (cb) {
    const cookies = []
    const idx = this.idx

    const domains = Object.keys(idx)
    domains.forEach(domain => {
      const paths = Object.keys(idx[domain])
      paths.forEach(path => {
        const keys = Object.keys(idx[domain][path])
        keys.forEach(key => {
          /* istanbul ignore else  */
          if (key !== null) {
            cookies.push(idx[domain][path][key])
          }
        })
      })
    })

    // Sort by creationIndex so deserializing retains the creation order.
    // When implementing your own store, this SHOULD retain the order too
    cookies.sort((a, b) => {
      return (a.creationIndex || 0) - (b.creationIndex || 0)
    })

    cb(null, cookies)
  }

  _loadFromFile (filePath, cb) {
    let data = null
    let dataJson = null

    /* istanbul ignore else  */
    if (fs.existsSync(filePath)) {
      data = fs.readFileSync(filePath, 'utf8')
    }

    /* istanbul ignore else  */
    if (data) {
      try {
        dataJson = JSON.parse(data)
      } catch (e) {
        throw new Error(`Could not parse cookie file ${filePath}. Please ensure it is not corrupted.`)
      }
    }

    for (var domainName in dataJson) {
      for (var pathName in dataJson[domainName]) {
        for (var cookieName in dataJson[domainName][pathName]) {
          dataJson[domainName][pathName][cookieName] = Cookie.fromJSON(
            JSON.stringify(dataJson[domainName][pathName][cookieName])
          )
        }
      }
    }

    cb(dataJson)
  }

  _saveToFile (filePath, data, cb) {
    fs.writeFileSync(filePath, JSON.stringify(data))
    cb()
  }
}

exports.FileCookieStore = FileCookieStore

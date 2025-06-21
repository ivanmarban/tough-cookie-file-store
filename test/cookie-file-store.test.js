/* eslint-env jest */

import FileCookieStore from '../dist/cookie-file-store'
import { fileURLToPath } from 'url'
import { Cookie, Store } from 'tough-cookie'
import { expect, should } from 'chai'
import * as chai from 'chai'
import chaiDatetime from 'chai-datetime'
import fs from 'fs'
import path from 'path'
let cookieStore
let cookieStoreOptions
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cookiesFile = path.join(__dirname, '/cookies.json')
const cookiesFileParseError = path.join(__dirname, '/cookies-parse-error.json')
const cookiesFileEmpty = path.join(__dirname, '/cookies-empty.json')
const expiresDate = new Date('Fri Jan 01 2021 10:00:00 GMT')
const creationDate = new Date('Wed, Jan 2020 10:00:00 GMT')
const lastAccessedDate = creationDate
chai.use(chaiDatetime)
should()

/**
 * Calls a callback method in the cookie store, and asserts that it was called synchronously or asynchronously
 * @param {Function} method - The method of the cookie store to call
 * @param {Array} args - Arguments to pass to the method
 */
function testCallbackMethod (method, args) {
  const callback = args.pop()
  let detached = false
  method.call(cookieStore, ...args, (cbErr, ...cbArgs) => {
    try {
      if (cookieStore.synchronous) {
        expect(detached).to.eq(false)
      }
    } catch (error) {
      // console.error(error)
      callback(error, undefined)
      return
    }
    callback(cbErr, ...cbArgs)
  })
  detached = true
}

/**
 * Calls a promise method in the cookie store, and calls a callback with the result or error
 * @param {Function} method - The method of the cookie store to call
 * @param {Array} args - Arguments to pass to the method
 */
function testAsyncMethod (method, args) {
  const callback = args.pop()
  let detached = false
  ;(async () => {
    let result
    try {
      const resultPromise = method.call(cookieStore, ...args)
      expect(resultPromise).to.be.instanceof(Promise)
      result = await resultPromise
      if (cookieStore.synchronous) {
        expect(detached).to.eq(false)
      }
    } catch (error) {
      callback(error, undefined)
      return
    }
    callback(null, result)
  })()
  // we need to delay 1 tick, because javascript promises resolve on the next microtick
  ;(async () => {
    await Promise.resolve()
    detached = true
  })()
}

/**
 * Tests the callback and promise versions of a method in the cookie store
 * @param {string} name - The name of the method to test
 * @param {Function} doTests - Defines the tests to run
 */
function storeMethodTests (name, doTests) {
  describe(`#${name} (callback)`, function () {
    doTests((...args) => {
      const method = cookieStore[name]
      testCallbackMethod(method, args)
    })
  })
  describe(`#${name} (promise)`, function () {
    doTests((...args) => {
      const method = cookieStore[name]
      testAsyncMethod(method, args)
    })
  })
}

/**
 * Wraps a callback function with a try-catch, to fail the test if an error is thrown.
 * @param {Function} done - The "done" method of the test to call if an error occurs
 * @param {Function} func - The callback function to wrap
 * @returns {Function} the wrapped callback function
 */
function callbackFunc (done, func) {
  return (...args) => {
    try {
      func(...args)
    } catch (error) {
      done(error)
    }
  }
}

/**
 * Creates a resolver that calls `done` after being called a given number of times.
 * @param {number} count - The number of times that the returned function should be called for `done` to be called
 * @param {Function} done - The function to call when the returned function is called the specified number of times
 * @returns {Function} the resolver function
 */
function resolverForCount (count, done) {
  let called = false
  let caughtError
  let callCount = 0
  return (error) => {
    if (error && !caughtError) {
      caughtError = error
    }
    callCount++
    if (callCount >= count) {
      if (called) {
        console.error(`Called resolver more than expected (${callCount} instead of ${count})`)
      } else {
        called = true
        if (caughtError) {
          done(caughtError)
        } else {
          done()
        }
      }
    }
  }
}

/**
 * Defines the common tests for a cookie store
 */
function fileCookieStoreTests () {
  describe('#constructor', function () {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('FileCookieStore should be instance of Store class', function (done) {
      expect(cookieStore).to.be.instanceof(Store)
      done()
    })

    it('Should create object of FileCookieStore class', function (done) {
      expect(cookieStore).to.be.instanceof(FileCookieStore)
      done()
    })

    it('Should throw an error when filePath is undefined', function (done) {
      ;(() => new FileCookieStore(undefined, cookieStoreOptions)).should.throw(Error, /Unknown/)
      done()
    })

    it('Should throw an error when file cannot be parsed', function (done) {
      if (cookieStoreOptions?.loadAsync) {
        ;(() => new FileCookieStore(cookiesFileParseError, {
          ...cookieStoreOptions,
          onLoad: callbackFunc(done, () => {
            cookieStoreOptions?.onLoad?.()
            done(new Error("Load didn't fail"))
          }),
          onLoadError: callbackFunc(done, (error) => {
            try {
              expect(error).to.be.instanceof(Error)
              cookieStoreOptions?.onLoadError?.(error)
            } catch (error) {
              done(error)
              return
            }
            done()
          })
        }))()
      } else {
        ;(() => new FileCookieStore(cookiesFileParseError, cookieStoreOptions)).should.throw(Error, /Could not parse cookie/)
        done()
      }
    })

    it('Should load cookie file successfully', function (done) {
      if (cookieStoreOptions?.loadAsync) {
        let detached = false
        ;(() => new FileCookieStore(cookiesFileEmpty, {
          ...cookieStoreOptions,
          onLoad: callbackFunc(done, (exists) => {
            try {
              expect(detached).to.eq(true)
              expect(exists).to.eq(true)
              cookieStoreOptions?.onLoad?.()
            } catch (error) {
              done(error)
              return
            }
            done()
          }),
          onLoadError: callbackFunc(done, (error) => {
            cookieStoreOptions?.onLoadError?.(error)
            done(error)
          })
        }))()
        detached = true
      } else {
        ;(() => new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)).should.not.throw()
        done()
      }
    })

    it('Should not throw when loading a non-existant file', function (done) {
      const nonexistantCookiesFile = path.join(__dirname, 'nonexistant-cookies-file.json')
      if (cookieStoreOptions?.loadAsync) {
        let detached = false
        cookieStore = new FileCookieStore(nonexistantCookiesFile, {
          ...cookieStoreOptions,
          onLoad: callbackFunc(done, (exists) => {
            try {
              expect(detached).to.eq(true)
              expect(exists).to.eq(false)
              expect(Object.keys(cookieStore.idx).length).to.eq(0)
              cookieStoreOptions?.onLoad?.()
            } catch (error) {
              done(error)
              return
            }
            done()
          }),
          onLoadError: callbackFunc(done, (error) => {
            cookieStoreOptions?.onLoadError?.(error)
            done(error)
          })
        })
        detached = true
      } else {
        try {
          cookieStore = new FileCookieStore(nonexistantCookiesFile, cookieStoreOptions)
          expect(Object.keys(cookieStore.idx).length).to.eq(0)
        } catch (error) {
          done(error)
          return
        }
        done()
      }
    })

    it('Should not throw when loading an empty file', function (done) {
      fs.writeFileSync(cookiesFileEmpty, '', { encoding: 'utf8', flag: 'w' })
      if (cookieStoreOptions?.loadAsync) {
        let detached = false
        cookieStore = new FileCookieStore(cookiesFileEmpty, {
          ...cookieStoreOptions,
          onLoad: callbackFunc(done, (exists) => {
            try {
              expect(detached).to.eq(true)
              expect(exists).to.eq(true)
              expect(Object.keys(cookieStore.idx).length).to.eq(0)
              cookieStoreOptions?.onLoad?.()
            } catch (error) {
              done(error)
              return
            }
            done()
          }),
          onLoadError: callbackFunc(done, (error) => {
            cookieStoreOptions?.onLoadError?.(error)
            done(error)
          })
        })
        detached = true
      } else {
        try {
          cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
          expect(Object.keys(cookieStore.idx).length).to.eq(0)
        } catch (error) {
          done(error)
          return
        }
        done()
      }
    })

    it('Should throw when json file holds an array', function (done) {
      fs.writeFileSync(cookiesFileEmpty, '[]', { encoding: 'utf8', flag: 'w' })
      if (cookieStoreOptions?.loadAsync) {
        ;(() => new FileCookieStore(cookiesFileEmpty, {
          ...cookieStoreOptions,
          onLoad: callbackFunc(done, () => {
            cookieStoreOptions?.onLoad?.()
            done(new Error("Load didn't fail"))
          }),
          onLoadError: callbackFunc(done, (error) => {
            try {
              expect(error).to.be.instanceof(Error)
              cookieStoreOptions?.onLoadError?.(error)
            } catch (error) {
              done(error)
              return
            }
            done()
          })
        }))()
      } else {
        ;(() => new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)).should.throw(Error, /[Ii]nvalid/)
        done()
      }
    })

    it('Should throw when json file holds a boolean', function (done) {
      fs.writeFileSync(cookiesFileEmpty, 'true', { encoding: 'utf8', flag: 'w' })
      if (cookieStoreOptions?.loadAsync) {
        ;(() => new FileCookieStore(cookiesFileEmpty, {
          ...cookieStoreOptions,
          onLoad: callbackFunc(done, () => {
            cookieStoreOptions?.onLoad?.()
            done(new Error("Load didn't fail"))
          }),
          onLoadError: callbackFunc(done, (error) => {
            try {
              expect(error).to.be.instanceof(Error)
              cookieStoreOptions?.onLoadError?.(error)
            } catch (error) {
              done(error)
              return
            }
            done()
          })
        }))()
      } else {
        ;(() => new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)).should.throw(Error, /[Ii]nvalid/)
        done()
      }
    })
  })

  describe('#inspect', function () {
    it('idx should contain object ', function (done) {
      try {
        const idx = cookieStore._inspect()
        expect(idx).to.not.eq(null)
      } finally {
        done()
      }
    })
  })

  storeMethodTests('findCookie', function (findCookie) {
    it('Should find a cookie with the given domain, path and key (example.com, /, foo)', function (done) {
      findCookie('example.com', '/', 'foo', callbackFunc(done, (error, cookie) => {
        expect(error).to.eq(null)
        expect(cookie).to.be.instanceof(Cookie)
        expect(cookie.key).to.eq('foo')
        expect(cookie.value).to.eq('foo')
        expect(cookie.expires).to.equalDate(expiresDate)
        expect(cookie.domain).to.eq('example.com')
        expect(cookie.path).to.eq('/')
        expect(cookie.hostOnly).to.eq(false)
        expect(cookie.creation).to.equalDate(creationDate)
        expect(cookie.lastAccessed).to.equalDate(lastAccessedDate)
        done()
      }))
    })

    it('Should not find a cookie with the given domain, path and key (foo.com, /, bar)', function (done) {
      findCookie('foo.com', '/', 'bar', callbackFunc(done, (error, cookie) => {
        expect(error).to.eq(null)
        expect(cookie).to.eq(undefined)
        done()
      }))
    })

    it('Should not find a cookie with the given domain, path and key (example.com, /home, bar)', function (done) {
      findCookie('example.com', '/home', 'bar', callbackFunc(done, (error, cookie) => {
        expect(error).to.eq(null)
        expect(cookie).to.eq(undefined)
        done()
      }))
    })

    it('Should not find a cookie with the given domain, path and key (exmaple.com, /, c)', function (done) {
      findCookie('example.com', '/', 'c', callbackFunc(done, (error, cookie) => {
        expect(error).to.eq(null)
        expect(cookie).to.eq(undefined)
        done()
      }))
    })
  })

  storeMethodTests('findCookies', function (findCookies) {
    it('Should find cookies matching the given domain and path (example.com, all paths)', function (done) {
      findCookies('example.com', null, callbackFunc(done, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(2)
        expect(cookies[0]).to.be.instanceof(Cookie)
        expect(cookies[0].key).to.eq('foo')
        expect(cookies[0].value).to.eq('foo')
        expect(cookies[0].expires).to.equalDate(expiresDate)
        expect(cookies[0].domain).to.eq('example.com')
        expect(cookies[0].path).to.eq('/')
        expect(cookies[0].hostOnly).to.eq(false)
        expect(cookies[0].creation).to.equalDate(creationDate)
        expect(cookies[0].lastAccessed).to.equalDate(lastAccessedDate)
        done()
      }))
    })

    it('Should find cookies matching the given domain and path (example.com, /login)', function (done) {
      findCookies('example.com', '/login', callbackFunc(done, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(2)
        expect(cookies[1]).to.be.instanceof(Cookie)
        expect(cookies[1].key).to.eq('bar')
        expect(cookies[1].value).to.eq('bar')
        expect(cookies[1].expires).to.equalDate(expiresDate)
        expect(cookies[1].domain).to.eq('example.com')
        expect(cookies[1].path).to.eq('/login')
        expect(cookies[1].hostOnly).to.eq(false)
        expect(cookies[1].creation).to.equalDate(creationDate)
        expect(cookies[1].lastAccessed).to.equalDate(lastAccessedDate)
        done()
      }))
    })

    it('Should not find cookies matching the given domain and path (foo.com, all paths)', function (done) {
      findCookies('foo.com', '/', callbackFunc(done, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(0)
        done()
      }))
    })

    it('Should not find cookies matching the given domain and path (no domain)', function (done) {
      findCookies('', '/', callbackFunc(done, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(0)
        done()
      }))
    })

    it('Should not find cookies matching the given domain (.co domain)', function (done) {
      findCookies('.co', '/', callbackFunc(done, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(0)
        done()
      }))
    })

    it('Should not find cookies matching the given domain and path (no domain)', function (done) {
      findCookies('', '/', null, callbackFunc(done, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(0)
        done()
      }))
    })
  })

  storeMethodTests('putCookie', function (putCookie) {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('Should add a new "baz" cookie to the store', function (done) {
      const cookie = Cookie.parse('baz=baz; Domain=example.com; Path=/')
      cookie.expires = expiresDate
      cookie.creation = creationDate
      cookie.lastAccessed = lastAccessedDate
      putCookie(cookie, callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        cookieStore.findCookie('example.com', '/', 'baz', callbackFunc(done, (error, cookie) => {
          expect(error).to.eq(null)
          expect(cookie).to.be.instanceof(Cookie)
          expect(cookie.key).to.eq('baz')
          expect(cookie.value).to.eq('baz')
          expect(cookie.expires).to.equalDate(expiresDate)
          expect(cookie.domain).to.eq('example.com')
          expect(cookie.path).to.eq('/')
          expect(cookie.creation).to.equalDate(creationDate)
          expect(cookie.lastAccessed).to.equalDate(lastAccessedDate)
          cookieStore.removeCookie('example.com', '/', 'baz', callbackFunc(done, () => {
            done()
          }))
        }))
      }))
    })
  })

  storeMethodTests('updateCookie', function (updateCookie) {
    afterAll(async function () {
      const cookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      cookie.expires = expiresDate
      cookie.creation = creationDate
      cookie.hostOnly = false
      cookie.lastAccessed = lastAccessedDate
      await cookieStore.putCookie(cookie)
    })

    it('Should update the value of an existing "foo" cookie', function (done) {
      const oldCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      oldCookie.expires = expiresDate
      oldCookie.creation = creationDate
      oldCookie.hostOnly = false
      oldCookie.lastAccessed = lastAccessedDate
      const newCookie = oldCookie
      newCookie.value = 'bar'
      updateCookie(oldCookie, newCookie, callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        cookieStore.findCookie('example.com', '/', 'foo', callbackFunc(done, (error, cookie) => {
          expect(error).to.eq(null)
          expect(cookie).to.be.instanceof(Cookie)
          expect(cookie.key).to.eq('foo')
          expect(cookie.value).to.eq('bar')
          expect(cookie.expires).to.equalDate(expiresDate)
          expect(cookie.domain).to.eq('example.com')
          expect(cookie.path).to.eq('/')
          expect(cookie.creation).to.equalDate(creationDate)
          expect(cookie.lastAccessed).to.equalDate(lastAccessedDate)
          done()
        }))
      }))
    })
  })

  storeMethodTests('removeCookie', function (removeCookie) {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('Removing a cookie that doesn\'t exist shouldn\'t cause a file write', function (done) {
      let saveCount = 0
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      const innerSaveToFileAsync = cookieStore._saveToFileAsync
      cookieStore._saveToFileAsync = function (...args) {
        saveCount += 1
        return innerSaveToFileAsync.call(this, ...args)
      }
      const innerSaveToFileSync = cookieStore._saveToFileSync
      cookieStore._saveToFileSync = function (...args) {
        saveCount += 1
        return innerSaveToFileSync.call(this, ...args)
      }
      removeCookie('example.com', '/', 'foo', callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        expect(saveCount).to.eq(0)
        done()
      }))
    })

    it('Removing a cookie that doesn\'t exist shouldn\'t cause a file write', function (done) {
      const cookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(cookie, callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        let saveCount = 0
        const innerSaveToFileAsync = cookieStore._saveToFileAsync
        cookieStore._saveToFileAsync = function (...args) {
          saveCount += 1
          return innerSaveToFileAsync.call(this, ...args)
        }
        const innerSaveToFileSync = cookieStore._saveToFileSync
        cookieStore._saveToFileSync = function (...args) {
          saveCount += 1
          return innerSaveToFileSync.call(this, ...args)
        }
        removeCookie('example.com', '/login', 'foo', callbackFunc(done, (error) => {
          expect(error).to.eq(null)
          expect(saveCount).to.eq(0)
          done()
        }))
      }))
    })

    it('Should remove a cookie from the store', function (done) {
      const resolveOne = resolverForCount(2, done)
      const cookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(cookie, resolveOne)
      removeCookie('example.com', '/', 'foo', callbackFunc(resolveOne, () => {
        cookieStore.findCookies('example.com', '/', callbackFunc(resolveOne, (error, cookies) => {
          expect(error).to.eq(null)
          expect(cookies).to.be.an('array')
          expect(cookies).to.have.lengthOf(0)
          resolveOne()
        }))
      }))
    })
  })

  storeMethodTests('removeCookies', function (removeCookies) {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('Removing the only cookie should cause idx to be empty', function (done) {
      const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(fooCookie, callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        removeCookies('example.com', '/', callbackFunc(done, () => {
          expect(Object.keys(cookieStore.idx).length).to.eq(0)
          done()
        }))
      }))
    })

    it('Removing cookies that don\'t exist shouldn\'t cause a file write', function (done) {
      let saveCount = 0
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      const innerSaveToFileAsync = cookieStore._saveToFileAsync
      cookieStore._saveToFileAsync = function (...args) {
        saveCount += 1
        return innerSaveToFileAsync.call(this, ...args)
      }
      const innerSaveToFileSync = cookieStore._saveToFileSync
      cookieStore._saveToFileSync = function (...args) {
        saveCount += 1
        return innerSaveToFileSync.call(this, ...args)
      }
      removeCookies('example.com', '/', callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        expect(saveCount).to.eq(0)
        done()
      }))
    })

    it('Should remove matching cookies from the store (domain + path)', function (done) {
      const resolveOne = resolverForCount(3, done)
      const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar')
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(fooCookie, resolveOne)
      cookieStore.putCookie(barCookie, resolveOne)
      removeCookies('example.com', '/', callbackFunc(resolveOne, () => {
        cookieStore.findCookies('example.com', '/', callbackFunc(resolveOne, (error, cookies) => {
          expect(error).to.eq(null)
          expect(cookies).to.be.an('array')
          expect(cookies).to.have.lengthOf(0)
          resolveOne()
        }))
      }))
    })

    it('Should remove matching cookies from the store (domain)', function (done) {
      const resolveOne = resolverForCount(3, done)
      const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar')
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(fooCookie, resolveOne)
      cookieStore.putCookie(barCookie, resolveOne)
      removeCookies('example.com', null, callbackFunc(resolveOne, () => {
        cookieStore.findCookies('example.com', null, callbackFunc(resolveOne, (error, cookies) => {
          expect(error).to.eq(null)
          expect(cookies).to.be.an('array')
          expect(cookies).to.have.lengthOf(0)
          resolveOne()
        }))
      }))
    })
  })

  storeMethodTests('removeAllCookies', function (removeAllCookies) {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('Clearing an empty store shouldn\'t cause a file write', function (done) {
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      let saveCount = 0
      const innerSaveToFileAsync = cookieStore._saveToFileAsync
      cookieStore._saveToFileAsync = function (...args) {
        saveCount += 1
        return innerSaveToFileAsync.call(this, ...args)
      }
      const innerSaveToFileSync = cookieStore._saveToFileSync
      cookieStore._saveToFileSync = function (...args) {
        saveCount += 1
        return innerSaveToFileSync.call(this, ...args)
      }
      removeAllCookies(callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        expect(saveCount).to.eq(0)
        done()
      }))
    })

    it('Clearing a non-empty store should cause a single file write', function (done) {
      const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(fooCookie, callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        let saveCount = 0
        const innerSaveToFileAsync = cookieStore._saveToFileAsync
        cookieStore._saveToFileAsync = function (...args) {
          saveCount += 1
          return innerSaveToFileAsync.call(this, ...args)
        }
        const innerSaveToFileSync = cookieStore._saveToFileSync
        cookieStore._saveToFileSync = function (...args) {
          saveCount += 1
          return innerSaveToFileSync.call(this, ...args)
        }
        removeAllCookies(callbackFunc(done, (error) => {
          expect(error).to.eq(null)
          expect(saveCount).to.eq(1)
          done()
        }))
      }))
    })

    it('Should remove all cookies from the store', function (done) {
      const resolveOne = resolverForCount(3, done)
      const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar')
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(fooCookie, resolveOne)
      cookieStore.putCookie(barCookie, resolveOne)
      removeAllCookies(callbackFunc(resolveOne, () => {
        cookieStore.findCookies('example.com', '/', callbackFunc(resolveOne, (error, cookies) => {
          expect(error).to.eq(null)
          expect(cookies).to.be.an('array')
          expect(cookies).to.have.lengthOf(0)
          resolveOne()
        }))
      }))
    })
  })

  storeMethodTests('getAllCookies', function (getAllCookies) {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('Should return an "Array" of cookies', function (done) {
      getAllCookies(callbackFunc(done, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(2)
        done()
      }))
    })

    it('Should return an "Array" of cookies', function (done) {
      const resolveOne = resolverForCount(3, done)
      const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/')
      const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar')
      fooCookie.creationIndex = null
      barCookie.creationIndex = null
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      cookieStore.putCookie(fooCookie, resolveOne)
      cookieStore.putCookie(barCookie, resolveOne)
      getAllCookies(callbackFunc(resolveOne, (error, cookies) => {
        expect(error).to.eq(null)
        expect(cookies).to.be.an('array')
        expect(cookies).to.have.lengthOf(2)
        resolveOne()
      }))
    })
  })
}

/**
 * Defines the tests for the async version of the cookie store
 */
function fileCookieStoreAsyncTests () {
  describe('#_save', function () {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('Writing, once read promise is finished, after switching from async to sync after a delay, should cause 2 async file writes and 1 sync file write', function (done) {
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      // read cookies to make sure that read promise is done
      cookieStore.getAllCookies(callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        // hook async / sync file writes
        let asyncSaveCount = 0
        let syncSaveCount = 0
        const resolveOne = resolverForCount(3, () => {
          try {
            expect(syncSaveCount).to.eq(1)
            expect(asyncSaveCount).to.eq(2)
          } catch (error) {
            done(error)
            return
          }
          done()
        })
        const innerSaveToFileAsync = cookieStore._saveToFileAsync
        cookieStore._saveToFileAsync = function (...args) {
          asyncSaveCount += 1
          return innerSaveToFileAsync.call(this, ...args)
        }
        const innerSaveToFileSync = cookieStore._saveToFileSync
        cookieStore._saveToFileSync = function (...args) {
          syncSaveCount += 1
          return innerSaveToFileSync.call(this, ...args)
        }
        // write to store
        const buzCookie = Cookie.parse('buz=buz; Domain=example.com; Path=/buz')
        cookieStore.putCookie(buzCookie, callbackFunc(resolveOne, (error) => {
          expect(error).to.eq(null)
          resolveOne()
        }))
        ;(async () => {
          // delay
          await Promise.resolve()
          // make sure a write promise exists and that only 1 async write has happened
          try {
            expect(cookieStore._writePromise != null).to.eq(true)
            expect(syncSaveCount).to.eq(0)
            expect(asyncSaveCount).to.eq(1)
          } catch (error) {
            done(error)
            return
          }
          // switch to synchronous
          cookieStore.synchronous = true
          try {
            // cause another sync and async file write
            cookieStore.removeAllCookies(callbackFunc(resolveOne, (error) => {
              expect(error).to.eq(null)
              resolveOne()
            }))
          } catch (error) {
            resolveOne(error)
          }
          try {
            cookieStore._nextWritePromise.then(resolveOne, resolveOne)
          } catch (error) {
            resolveOne(error)
          }
        })()
      }))
    })
  })

  describe('#_saveAsync', function () {
    afterAll(function () {
      fs.writeFileSync(cookiesFileEmpty, '{}', { encoding: 'utf8', flag: 'w' })
    })

    it('Multiple calls to mutating methods within tick should only cause a single write', function (done) {
      let saveCount = 0
      const resolveOne = resolverForCount(2, () => {
        try {
          expect(saveCount).to.eq(1)
        } catch (error) {
          done(error)
          return
        }
        done()
      })
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      const innerSaveToFileAsync = cookieStore._saveToFileAsync
      cookieStore._saveToFileAsync = function (...args) {
        saveCount += 1
        return innerSaveToFileAsync.call(this, ...args)
      }
      const buzCookie = Cookie.parse('buz=buz; Domain=example.com; Path=/buz')
      cookieStore.putCookie(buzCookie, callbackFunc(resolveOne, (error) => {
        expect(error).to.eq(null)
        resolveOne()
      }))
      cookieStore.removeAllCookies(callbackFunc(resolveOne, (error) => {
        expect(error).to.eq(null)
        resolveOne()
      }))
    })

    it('Multiple sequential calls to mutating methods across ticks should cause an equal number of writes', function (done) {
      let saveCount = 0
      const resolveOne = resolverForCount(2, () => {
        try {
          expect(saveCount).to.eq(2)
        } catch (error) {
          done(error)
          return
        }
        done()
      })
      cookieStore = new FileCookieStore(cookiesFileEmpty, cookieStoreOptions)
      // read cookies to make sure that read promise is done
      cookieStore.getAllCookies(callbackFunc(done, (error) => {
        expect(error).to.eq(null)
        // count number of times the file is saved
        const innerSaveToFileAsync = cookieStore._saveToFileAsync
        cookieStore._saveToFileAsync = function (...args) {
          saveCount += 1
          return innerSaveToFileAsync.call(this, ...args)
        }
        // add a cookie to the store
        const buzCookie = Cookie.parse('buz=buz; Domain=example.com; Path=/buz')
        cookieStore.putCookie(buzCookie, callbackFunc(resolveOne, (error) => {
          expect(error).to.eq(null)
          resolveOne()
        }))
        // delay and remove the cookies from the store
        ;(async () => {
          try {
            await Promise.resolve()
            cookieStore.removeAllCookies(callbackFunc(resolveOne, (error) => {
              expect(error).to.eq(null)
              resolveOne()
            }))
          } catch (error) {
            resolveOne(error)
          }
        })()
      }))
    })
  })
}

// Define the tests for each variant of the cookie store
describe('Test cookie-file-store', function () {
  // Test synchronous methods without options
  describe('options: undefined', function () {
    beforeEach(function () {
      cookieStoreOptions = undefined
      cookieStore = new FileCookieStore(cookiesFile, cookieStoreOptions)
      expect(cookieStore.synchronous).to.eq(true)
    })

    fileCookieStoreTests()
  })

  // Test synchronous methods
  describe('options: {async: false}', function () {
    beforeEach(function () {
      cookieStoreOptions = {
        async: false
      }
      cookieStore = new FileCookieStore(cookiesFile, cookieStoreOptions)
      expect(cookieStore.synchronous).to.eq(true)
    })

    fileCookieStoreTests()
  })

  // Test asynchronous methods on a store loaded synchronously
  describe('options: {async: true, loadAsync: false}', function () {
    beforeEach(function () {
      cookieStoreOptions = {
        async: true,
        loadAsync: false
      }
      cookieStore = new FileCookieStore(cookiesFile, cookieStoreOptions)
      expect(cookieStore.synchronous).to.eq(false)
    })

    fileCookieStoreTests()
    fileCookieStoreAsyncTests()
  })

  // Test asynchronous methods on a store loaded asynchronously
  describe('options: {async: true, loadAsync: true}', function () {
    beforeEach(function () {
      cookieStoreOptions = {
        async: true,
        loadAsync: true
      }
      cookieStore = new FileCookieStore(cookiesFile, cookieStoreOptions)
      expect(cookieStore.synchronous).to.eq(false)
    })

    fileCookieStoreTests()
    fileCookieStoreAsyncTests()
  })
})

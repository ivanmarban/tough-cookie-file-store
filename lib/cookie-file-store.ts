import * as tough from 'tough-cookie'
import fs from 'fs'
import util from 'util'
import type {
  CookiesIndex,
  CookiesDomainData
} from './cookies-index'
import { parseCookiesJson, stringifyCookiesJson } from './formats/cookies-json'
import { parseNetscapeCookiesTxtToIndex, stringifyNetscapeCookiesTxt } from './formats/netscape-cookies-txt'

export enum FileFormat {
  json = 'json',
  txt = 'txt'
}

export const DefaultFileFormat = FileFormat.json

export type FileCookieStoreOptions = {
  /// Whether to write the file asynchronously
  async?: boolean
  /// Whether to write the file asynchronously
  loadAsync?: boolean
  /// The format of the file. If not specified, the format will be auto-detected.
  /// If not specified and the file doesn't exist, the format will default to txt.
  fileFormat?: FileFormat
  /// Continue parsing the file and if an invalid line was found. This only applies to the txt format.
  forceParse?: boolean
  /// Detect the #HttpOnly_ prefix for http only cookies. If false, HttpOnly cookies will not be loaded. This only affects txt parsing. Defaults to true.
  httpOnlyExtension?: boolean
  /// Called when the file successfuly loads asynchronously. Unused if `loadAsync` is false.
  onLoad?: (exists: boolean) => void
  /// Called when an error is encountered on a line of the loaded file. This is only called if forceParse is true, and only for the txt format.
  onLoadLineError?: (line: string, lineNumber: number) => void
  /// Optional callback for any async file-load error. Unused if `loadAsync` is false.
  onLoadError?: (err: Error) => void
}

/**
 * Internal options for loading a cookies file
 */
type LoadOptions = {
  /// Determines whether to continue parsing the file if an error is encountered. This only applies to the txt format.
  forceParse: boolean
  /// Called when an error is encountered on a line of the loaded file. This is only called if forceParse is true, and only for the txt format.
  onLineError?: (line: string, lineNumber: number) => void
}

/**
 * Class representing a JSON file store.
 *
 * @augments Store
 */
export default class FileCookieStore extends tough.Store {
  synchronous: boolean
  filePath: string
  fileFormat?: FileFormat
  idx: CookiesIndex = {}

  httpOnlyExtension: boolean

  private _readPromise: Promise<boolean> | undefined
  private _writePromise: Promise<void> | undefined
  private _nextWritePromise: Promise<void> | undefined

  /**
   * Creates a new JSON file store in the specified file.
   *
   * @param {string} filePath - The file in which the store will be created.
   * @param {object} options - Options for initializing the store.
   * @param {boolean} options.async - Whether to write the file asynchronously.
   * @param {boolean} options.loadAsync - Whether to read the file asynchronously.
   * @param {FileFormat} options.fileFormat - The format of the file. If not specified, the format will be auto-detected. If not specified and the file doesn't exist, the format will default to txt.
   * @param {boolean} options.forceParse - Continue parse file and don't throw exception if a bad line was found. This only applies to the txt format.
   * @param {boolean} options.httpOnlyExtension - Detect the #HttpOnly_ prefix for http only cookies. Defaults to true.
   * @param {Function} options.onLoad - Called when the file successfuly loads asynchronously. Unused if `loadAsync` is false.
   * @param {Function} options.onLoadError - Optional callback for any async file-load error. Unused if `loadAsync` is false.
   */
  constructor (
    filePath: string,
    options?: FileCookieStoreOptions
  ) {
    super()
    this.synchronous = !options?.async
    this.filePath = filePath
    if (options?.fileFormat) {
      this.fileFormat = options.fileFormat
    }
    this.idx = {}
    this.httpOnlyExtension = options?.httpOnlyExtension ?? true
    if (util.inspect.custom) {
      this[util.inspect.custom] = this._inspect
    }
    // load from file
    if (!filePath) {
      throw new Error('Unknown file for read/write cookies')
    }
    const loadOptions: LoadOptions = {
      forceParse: options?.forceParse ?? false,
      onLineError: options?.onLoadLineError
    }
    if (options?.loadAsync) {
      const promise = this._loadFromFileAsync(this.filePath, loadOptions)
      this._readPromise = promise
      promise.then((exists) => {
        delete this._readPromise
        // istanbul ignore next
        options?.onLoad?.(exists)
      }, (error) => {
        delete this._readPromise
        // istanbul ignore next
        if (options?.onLoadError) {
          options.onLoadError(error)
        } else {
          // istanbul ignore next
          console.error(error)
        }
      }).catch(
        // istanbul ignore next
        (error) => {
          // istanbul ignore next
          console.error(error)
        }
      )
    } else {
      this._loadFromFileSync(this.filePath, loadOptions)
    }
  }

  /**
   * Waits for the initial load to finish if unfinished, and then performs the given synchronous read action.
   * Afterwards, the callback will be called with an error or a result. If no callback is passed, a promise
   * will be returned instead.
   * @param {Function} action - The synchronous read action to execute
   * @param {Function} cb - The callback to call with the error or result
   * @returns {Promise} a promise if no callback was passed.
   */
  private _doSyncReadAsAsync<TResult> (action: () => TResult, cb: tough.Callback<TResult> | undefined): (void | Promise<TResult>) {
    if (this._readPromise) {
      // wait for read promise to finish
      const promise = this._readPromise
      if (typeof cb === 'function') {
        // handle with callback
        const continueFunc = () => {
          try {
            let result: TResult
            try {
              result = action()
            } catch (error) /* istanbul ignore next */ {
              cb(error, undefined)
              return
            }
            cb(null, result)
          } catch (error) {
            // istanbul ignore next
            console.error(error)
          }
        }
        promise.then(continueFunc, continueFunc)
      } else {
        // handle with promise
        const continueFunc = () => action()
        return promise.then(continueFunc, continueFunc)
      }
    } else {
      // do action immediately
      if (typeof cb === 'function') {
        let result
        try {
          result = action()
        } catch (error) /* istanbul ignore next */ {
          cb(error, undefined)
          return
        }
        cb(null, result)
      } else {
        return (async () => action())()
      }
    }
  }

  /**
   * Waits for the initial load to finish if unfinished, and then performs the given synchronous write action.
   * Afterwards, if the store has changed, then changes to the store will be saved to its file, and then
   * the callback will be called with an error if any, or `null` if no error. If no callback is passed, a
   * promise will be returned instead.
   * @param {Function} action - The synchronous write action to execute. This should return a boolean indicating whether the store has changed.
   * @param {Function} cb - The callback to call with the error or result
   * @returns {Promise} a promise if no callback was passed.
   */
  _doSyncWriteAsAsync (action: () => boolean, cb: (((error: Error | null) => void) | undefined)): (void | Promise<void>) {
    if (this._readPromise) {
      // wait for read promise to finish
      const promise = this._readPromise
      if (typeof cb === 'function') {
        // handle with callback
        const continueFunc = () => {
          let done = false
          try {
            // perform write action
            if (action()) {
              // save to file
              this._saveAsync((error) => {
                // done
                // istanbul ignore next
                if (!done) {
                  done = true
                  cb(error)
                } else {
                  // istanbul ignore next
                  console.error(error)
                }
              })
            } else {
              // no need to save to file, so done
              done = true
              cb(null)
            }
          } catch (error) /* istanbul ignore next */ {
            // only pass error to callback if it hasnt been called yet
            if (!done) {
              done = true
              cb(error)
            } else {
              console.error(error)
            }
          }
        }
        promise.then(continueFunc, continueFunc)
      } else {
        // handle with promise
        const continueFunc = () => {
          if (action()) {
            return this._saveAsync()
          }
        }
        return promise.then(continueFunc, continueFunc)
      }
    } else {
      // do action immediately
      let changed
      try {
        changed = action()
      } catch (error) /* istanbul ignore next */ {
        if (typeof cb === 'function') {
          cb(error)
          return
        } else {
          return Promise.reject(error)
        }
      }
      if (changed) {
        return this._saveAsync(cb)
      } else {
        if (typeof cb === 'function') {
          cb(null)
        } else {
          return Promise.resolve()
        }
      }
    }
  }

  /** @inheritdoc */
  findCookie(domain: tough.Nullable<string>, path: tough.Nullable<string>, key: tough.Nullable<string>, cb: tough.Callback<tough.Cookie | undefined>): void;
  /** @inheritdoc */
  findCookie(domain: tough.Nullable<string>, path: tough.Nullable<string>, key: tough.Nullable<string>): Promise<tough.Cookie | undefined>;
  /** @inheritdoc */
  findCookie (domain: tough.Nullable<string>, path: tough.Nullable<string>, key: tough.Nullable<string>, cb?: tough.Callback<tough.Cookie | undefined>): (void | Promise<tough.Cookie | undefined>) {
    if (this.synchronous) {
      if (typeof cb === 'function') {
        let cookie
        try {
          cookie = this._findCookieSync(domain, path, key)
        } catch (error) /* istanbul ignore next */ {
          cb(error, undefined)
          return
        }
        cb(null, cookie)
      } else {
        return (async () => this._findCookieSync(domain, path, key))()
      }
    } else {
      return this._findCookieAsync(domain, path, key, cb)
    }
  }

  /**
   * Searches for a cookie after waiting for the initial read to finish.
   * @see _doSyncReadAsAsync
   * @param {string} domain - The cookie domain.
   * @param {string} path - The cookie path.
   * @param {string} key - The cookie key.
   * @param {Function} cb - The callback that will be called with the result.
   * @returns {Promise<tough.Cookie>} a promise if no callback was passed.
   */
  private _findCookieAsync (domain: tough.Nullable<string>, path: tough.Nullable<string>, key: tough.Nullable<string>, cb: tough.Callback<tough.Cookie | undefined> | undefined): (void | Promise<tough.Cookie | undefined>) {
    return this._doSyncReadAsAsync(() => this._findCookieSync(domain, path, key), cb)
  }

  /**
   * Searches for a cookie and returns it or null.
   * @param {string} domain - The cookie domain.
   * @param {string} path - The cookie path.
   * @param {string} key - The cookie key.
   * @returns {Cookie} the matching cookie if found.
   */
  private _findCookieSync (domain: tough.Nullable<string>, path: tough.Nullable<string>, key: tough.Nullable<string>): (tough.Cookie | undefined) {
    // istanbul ignore next
    if (domain == null || path == null || key == null) {
      return undefined
    }
    return this.idx[domain]?.[path]?.[key]
  }

  /** @inheritdoc */
  findCookies(domain: tough.Nullable<string>, path: tough.Nullable<string>, allowSpecialUseDomain?: boolean, cb?: tough.Callback<tough.Cookie[]>): void;
  /** @inheritdoc */
  findCookies(domain: tough.Nullable<string>, path: tough.Nullable<string>, allowSpecialUseDomain?: boolean): Promise<tough.Cookie[]>;
  /** @inheritdoc */
  findCookies (domain: tough.Nullable<string>, path: tough.Nullable<string>, allowSpecialUseDomain?: boolean, cb?: tough.Callback<tough.Cookie[]>): (void | Promise<tough.Cookie[]>) {
    if (typeof allowSpecialUseDomain === 'function') {
      cb = allowSpecialUseDomain
      allowSpecialUseDomain = undefined
    }
    // istanbul ignore next
    allowSpecialUseDomain ??= false
    if (this.synchronous) {
      if (typeof cb === 'function') {
        let cookies
        try {
          cookies = this._findCookiesSync(domain, path, allowSpecialUseDomain)
        } catch (error) /* istanbul ignore next */ {
          cb(error, undefined)
          return
        }
        cb(null, cookies)
      } else {
        return (async () => this._findCookiesSync(domain, path, allowSpecialUseDomain))()
      }
    } else {
      return this._findCookiesAsync(domain, path, allowSpecialUseDomain, cb)
    }
  }

  /**
   * Searches for cookies after waiting for the initial read to finish
   * @see _doSyncReadAsAsync
   * @param {string} domain - The cookies domain.
   * @param {string} path - The cookies path.
   * @param {boolean} allowSpecialUseDomain - If `true` then special-use domain suffixes will be allowed in matches. Defaults to `false`.
   * @param {Function} cb - The callback that will be called with the result.
   * @returns {Promise<tough.Cookie[]>} a promise if no callback was passed.
   */
  private _findCookiesAsync (domain: tough.Nullable<string>, path: tough.Nullable<string>, allowSpecialUseDomain: boolean, cb?: tough.Callback<tough.Cookie[]>): (void | Promise<tough.Cookie[]>) {
    return this._doSyncReadAsAsync(() => this._findCookiesSync(domain, path, allowSpecialUseDomain), cb)
  }

  /**
   * Searches for matching cookies and returns them.
   * @param {string} domain - The cookies domain.
   * @param {string} path - The cookies path.
   * @param {boolean} allowSpecialUseDomain - If `true` then special-use domain suffixes will be allowed in matches. Defaults to `false`.
   * @returns {Cookie[]} the matching cookies if any were found.
   */
  private _findCookiesSync (domain: tough.Nullable<string>, path: tough.Nullable<string>, allowSpecialUseDomain: boolean): tough.Cookie[] {
    const results: tough.Cookie[] = []

    if (!domain) {
      return results
    }

    let pathMatcher: (domainIndex: CookiesDomainData) => void
    if (!path) {
      pathMatcher = function matchAll (domainIndex: CookiesDomainData) {
        for (const curPath of Object.keys(domainIndex)) {
          const pathIndex = domainIndex[curPath]
          for (const key of Object.keys(pathIndex)) {
            results.push(pathIndex[key])
          }
        }
      }
    } else {
      pathMatcher = function matchRFC (domainIndex: CookiesDomainData) {
        for (const cookiePath of Object.keys(domainIndex)) {
          if (tough.pathMatch(path, cookiePath)) {
            const pathIndex = domainIndex[cookiePath]
            for (const key of Object.keys(pathIndex)) {
              results.push(pathIndex[key])
            }
          }
        }
      }
    }

    const domains = tough.permuteDomain(domain, allowSpecialUseDomain) || [domain]
    const idx = this.idx
    for (const curDomain of domains) {
      const domainIndex = idx[curDomain]
      if (!domainIndex) {
        continue
      }
      pathMatcher(domainIndex)
    }

    return results
  }

  /** @inheritdoc */
  putCookie(cookie: tough.Cookie, cb: tough.ErrorCallback): void;
  /** @inheritdoc */
  putCookie(cookie: tough.Cookie): Promise<void>;
  /** @inheritdoc */
  putCookie (cookie: tough.Cookie, cb?: tough.ErrorCallback): (void | Promise<void>) {
    if (this.synchronous) {
      if (typeof cb === 'function') {
        try {
          this._putCookieSync(cookie)
        } catch (error) /* istanbul ignore next */ {
          cb(error)
          return
        }
        cb(null)
      } else {
        return (async () => this._putCookieSync(cookie))()
      }
    } else {
      return this._putCookieAsync(cookie, cb)
    }
  }

  /**
   * Puts a cookie in the store after waiting for the initial read to finish, then saves the store to its file.
   * @see _doSyncReadAsAsync
   * @param {Cookie} cookie - The cookie to add to the store.
   * @param {Function} cb - The callback to be called when finished.
   * @returns {Promise} a promise if no callback was passed.
   */
  private _putCookieAsync (cookie: tough.Cookie, cb?: tough.ErrorCallback): (void | Promise<void>) {
    return this._doSyncWriteAsAsync(() => {
      return this._putCookieSyncInternal(cookie)
    }, cb)
  }

  /**
   * Puts a cookie in the store without saving to a file.
   * @param {Cookie} cookie - The cookie to add to the store.
   * @returns {boolean} true if the store was changed, or false if the store was not changed.
   */
  private _putCookieSyncInternal (cookie: tough.Cookie): boolean {
    const { domain, path, key } = cookie
    const canDomain = tough.canonicalDomain(domain)
    // Guarding against invalid input
    // istanbul ignore next
    if (canDomain == null || path == null || key == null) {
      return false
    }
    let domainVal = this.idx[canDomain]
    if (!domainVal) {
      domainVal = {}
      this.idx[canDomain] = domainVal
    }
    let pathVal = domainVal[path]
    if (!pathVal) {
      pathVal = {}
      domainVal[path] = pathVal
    }
    pathVal[key] = cookie
    return true
  }

  /**
   * Puts a cookie in the store, then saves synchronously.
   * @param {Cookie} cookie - The cookie to add to the store.
   */
  private _putCookieSync (cookie: tough.Cookie) {
    if (this._putCookieSyncInternal(cookie)) {
      this._saveSync()
    }
  }

  /** @inheritdoc */
  updateCookie(oldCookie: tough.Cookie, newCookie: tough.Cookie, cb: tough.ErrorCallback): void;
  /** @inheritdoc */
  updateCookie(oldCookie: tough.Cookie, newCookie: tough.Cookie): Promise<void>;
  /** @inheritdoc */
  updateCookie (oldCookie: tough.Cookie, newCookie: tough.Cookie, cb?: tough.ErrorCallback): (void | Promise<void>) {
    // TODO delete old cookie?
    if (cb) {
      return this.putCookie(newCookie, cb)
    } else {
      return this.putCookie(newCookie)
    }
  }

  /** @inheritdoc */
  removeCookie(domain: string, path: string, key: string, cb: tough.ErrorCallback): void;
  /** @inheritdoc */
  removeCookie(domain: string, path: string, key: string): Promise<void>;
  /** @inheritdoc */
  removeCookie (domain: string, path: string, key: string, cb?: tough.ErrorCallback): (void | Promise<void>) {
    if (this.synchronous) {
      if (typeof cb === 'function') {
        try {
          this._removeCookieSync(domain, path, key)
        } catch (error) /* istanbul ignore next */ {
          cb(error)
          return
        }
        cb(null)
      } else {
        return (async () => this._removeCookieSync(domain, path, key))()
      }
    } else {
      return this._removeCookieAsync(domain, path, key, cb)
    }
  }

  /**
   * Removes a cookie from the store after waiting for the initial read to finish, then saves the store to its file if removed.
   * @see _doSyncReadAsAsync
   * @param {string} domain - The domain of the cookie to remove.
   * @param {string} path - The path of the cookie to remove.
   * @param {string} key - The key of the cookie to remove.
   * @param {Function} cb - The callback to be called when finished.
   * @returns {Promise} a promise if no callback was passed.
   */
  private _removeCookieAsync (domain: string, path: string, key: string, cb?: tough.ErrorCallback): (void | Promise<void>) {
    return this._doSyncWriteAsAsync(() => {
      return this._removeCookieSyncInternal(domain, path, key)
    }, cb)
  }

  /**
   * Removes a cookie from the store without saving to a file.
   * @param {string} domain - The domain of the cookie to remove.
   * @param {string} path - The path of the cookie to remove.
   * @param {string} key - The key of the cookie to remove.
   * @returns {boolean} true if a cookie was removed, or false if no change occured.
   */
  private _removeCookieSyncInternal (domain: string, path: string, key: string): boolean {
    const domainVal = this.idx[domain]
    if (!domainVal) {
      return false
    }
    const pathVal = domainVal[path]
    if (!pathVal) {
      return false
    }
    const deleted = (delete pathVal[key])
    // clean up entries if empty
    if (deleted && Object.keys(pathVal).length === 0) {
      delete domainVal[path]
      if (Object.keys(domainVal).length === 0) {
        delete this.idx[domain]
      }
    }
    return deleted
  }

  /**
   * Removes a cookie from the store, then saves synchronously if removed.
   * @param {string} domain - The domain of the cookie to remove.
   * @param {string} path - The path of the cookie to remove.
   * @param {string} key - The key of the cookie to remove.
   */
  private _removeCookieSync (domain: string, path: string, key: string) {
    if (this._removeCookieSyncInternal(domain, path, key)) {
      this._saveSync()
    }
  }

  /** @inheritdoc */
  removeCookies(domain: string, path: tough.Nullable<string>, cb: tough.ErrorCallback): void;
  /** @inheritdoc */
  removeCookies(domain: string, path: tough.Nullable<string>): Promise<void>;
  /** @inheritdoc */
  removeCookies (domain: string, path: tough.Nullable<string>, cb?: tough.ErrorCallback): (void | Promise<void>) {
    if (this.synchronous) {
      if (typeof cb === 'function') {
        try {
          this._removeCookiesSync(domain, path)
        } catch (error) /* istanbul ignore next */ {
          cb(error)
          return
        }
        cb(null)
      } else {
        return (async () => this._removeCookiesSync(domain, path))()
      }
    } else {
      return this._removeCookiesAsync(domain, path, cb)
    }
  }

  /**
   * Removes cookies from the store after waiting for the initial read to finish, then saves the store to its file if any were removed.
   * @see _doSyncReadAsAsync
   * @param {string} domain - The domain of the cookies to remove.
   * @param {string} path - The path of the cookies to remove.
   * @param {Function} cb - The callback to be called when finished.
   * @returns {Promise} a promise if no callback was passed.
   */
  private _removeCookiesAsync (domain: string, path: tough.Nullable<string>, cb?: tough.ErrorCallback): (void | Promise<void>) {
    return this._doSyncWriteAsAsync(() => {
      return this._removeCookiesSyncInternal(domain, path)
    }, cb)
  }

  /**
   * Removes cookies from the store without saving to a file.
   * @param {string} domain - The domain of the cookies to remove.
   * @param {string} path - The path of the cookies to remove.
   * @returns {boolean} true if any cookies were removed, or false if no change occured
   */
  private _removeCookiesSyncInternal (domain: string, path: tough.Nullable<string>): boolean {
    if (path != null) {
      const domainVal = this.idx[domain]
      if (domainVal) {
        const deleted = (delete domainVal[path])
        // clean up entries if empty
        if (deleted && Object.keys(domainVal).length === 0) {
          delete this.idx[domain]
        }
        return deleted
      }
      return false
    } else {
      const deleted = (delete this.idx[domain])
      return deleted
    }
  }

  /**
   * Removes cookies from the store, then saves synchronously if any were removed.
   * @param {string} domain - The domain of the cookies to remove.
   * @param {string} path - The path of the cookies to remove.
   */
  private _removeCookiesSync (domain: string, path: tough.Nullable<string>) {
    if (this._removeCookiesSyncInternal(domain, path)) {
      this._saveSync()
    }
  }

  /** @inheritdoc */
  removeAllCookies(cb: tough.ErrorCallback): void;
  /** @inheritdoc */
  removeAllCookies(): Promise<void>;
  /** @inheritdoc */
  removeAllCookies (cb?: tough.ErrorCallback): (void | Promise<void>) {
    if (this.synchronous) {
      if (typeof cb === 'function') {
        try {
          this._removeAllCookiesSync()
        } catch (error) /* istanbul ignore next */ {
          cb(error)
          return
        }
        cb(null)
      } else {
        return (async () => this._removeAllCookiesSync())()
      }
    } else {
      return this._removeAllCookiesAsync(cb)
    }
  }

  /**
   * Removes all cookies after waiting for the initial read to finish, then saves the store to its file if any were removed.
   * @param {Function} cb - The callback to be called when finished.
   * @returns {Promise} a promise if no callback was passed.
   */
  private _removeAllCookiesAsync (cb?: tough.ErrorCallback): (void | Promise<void>) {
    return this._doSyncWriteAsAsync(() => {
      return this._removeAllCookiesSyncInternal()
    }, cb)
  }

  /**
   * Removes all cookies from the store without saving to a file.
   * @returns {boolean} true if any cookies were removed, or false if no change occured
   */
  private _removeAllCookiesSyncInternal (): boolean {
    if (Object.keys(this.idx).length === 0) {
      return false
    }
    this.idx = {}
    return true
  }

  /**
   * Removes all cookies from the store, then saves synchronously if any were removed.
   */
  private _removeAllCookiesSync () {
    if (this._removeAllCookiesSyncInternal()) {
      this._saveSync()
    }
  }

  /** @inheritdoc */
  getAllCookies(cb: tough.Callback<tough.Cookie[]>): void;
  /** @inheritdoc */
  getAllCookies(): Promise<tough.Cookie[]>;
  /** @inheritdoc */
  getAllCookies (cb?: tough.Callback<tough.Cookie[]>): (void | Promise<tough.Cookie[]>) {
    if (this.synchronous) {
      if (typeof cb === 'function') {
        let cookies
        try {
          cookies = this._getAllCookiesSync()
        } catch (error) /* istanbul ignore next */ {
          cb(error, undefined)
          return
        }
        cb(null, cookies)
      } else {
        return (async () => this._getAllCookiesSync())()
      }
    } else {
      return this._getAllCookiesAsync(cb)
    }
  }

  /**
   * Gets all the cookies after waiting for the initial read to finish.
   * @param {Function} cb - The callback to be called with the results.
   * @returns {Promise<tough.Cookie[]>} a promise if no callback was passed.
   */
  private _getAllCookiesAsync (cb?: tough.Callback<tough.Cookie[]>): (void | Promise<tough.Cookie[]>) {
    return this._doSyncReadAsAsync(() => this._getAllCookiesSync(), cb)
  }

  /**
   * Gets all the cookies in the store and returns them.
   * @returns {Cookie[]} an array of all the cookies in the store.
   */
  private _getAllCookiesSync (): tough.Cookie[] {
    const cookies: tough.Cookie[] = []
    for (const domain of Object.keys(this.idx)) {
      const domainVal = this.idx[domain]
      for (const p of Object.keys(domainVal)) {
        const pVal = domainVal[p]
        for (const key of Object.keys(pVal)) {
          const cookie = pVal[key]
          if (key != null) {
            cookies.push(cookie)
          }
        }
      }
    }

    cookies.sort((a, b) => {
      return (a.creationIndex || 0) - (b.creationIndex || 0)
    })

    return cookies
  }

  [util.inspect.custom]: () => string

  /**
   * Returns a string representation of the store object for debugging purposes.
   *
   * @returns {string} - The string representation of the store.
   */
  private _inspect (): string {
    return `{ idx: ${util.inspect(this.idx, false, 2)} }`
  }

  /**
   * Load the store from a file asynchronously.
   *
   * @param {string} filePath - The file to load the store from.
   * @param {object} options - Options for loading the file
   * @returns {Promise<CookiesIndex>} a promise that resolves with the parsed data from the file.
   */
  private async _loadFromFileAsync (filePath: string, options: LoadOptions): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK)
    } catch {
      if (!this.fileFormat) {
        this.fileFormat = DefaultFileFormat
      }
      return false
    }
    const data = await fs.promises.readFile(filePath, 'utf8')
    return this._loadFromStringSync(data, filePath, options)
  }

  /**
   * Load the store from a file synchronously.
   *
   * @param {string} filePath - The file to load the store from.
   * @param {object} options - Options for loading the file
   * @returns {CookiesIndex} the parsed data from the file
   */
  private _loadFromFileSync (filePath: string, options: LoadOptions): boolean {
    if (!fs.existsSync(this.filePath)) {
      if (!this.fileFormat) {
        this.fileFormat = DefaultFileFormat
      }
      return false
    }
    const data = fs.readFileSync(filePath, 'utf8')
    return this._loadFromStringSync(data, filePath, options)
  }

  /**
   * Loads the store from a json string.
   * @param {string} data - The string data that was loaded from a file.
   * @param {string} filePath - The path of the file that the string data was loaded from.
   * @param {object} options - Options for loading the file.
   * @returns {CookiesIndex} the parsed data
   */
  private _loadFromStringSync (data: string, filePath: string, options: LoadOptions): boolean {
    // determine file format
    let fileFormat = this.fileFormat
    if (!fileFormat) {
      if (data.startsWith('{') || data.startsWith('[')) {
        // file is empty or starts with a json character
        fileFormat = FileFormat.json
      } else {
        fileFormat = FileFormat.txt
      }
    }
    // load depending on format
    let cookies: CookiesIndex
    switch (fileFormat) {
      case FileFormat.json:
        cookies = parseCookiesJson(data, {
          ...options,
          filePath
        })
        break

      case FileFormat.txt:
        cookies = parseNetscapeCookiesTxtToIndex(data, {
          ...options,
          filePath,
          httpOnlyExtension: this.httpOnlyExtension
        })
        break

      default:
        throw new Error(`Unknown cookies file format ${fileFormat}`)
    }
    // apply loaded file
    this.fileFormat = fileFormat
    if (cookies) {
      this.idx = cookies
    }
    return (cookies !== undefined)
  }

  /**
   * Saves the store to its file asynchronously.
   * @param {Function} cb - The callback to be called when finished.
   * @returns {Promise} a promise if no callback was passed.
   */
  private _saveAsync (cb?: tough.ErrorCallback): (void | Promise<void>) {
    if (!this._nextWritePromise) {
      // create next write promise
      this._nextWritePromise = (async () => {
        // wait for active write to finish if any
        if (this._writePromise) {
          // wait for write to finish
          try {
            await this._writePromise
          } catch {
            // ignore error
          }
        } else {
          // delay atleast 1 tick, in case of multiple writes
          await Promise.resolve()
        }
        // this is now the active write, so update the write promises
        this._writePromise = this._nextWritePromise
        this._nextWritePromise = undefined
        // save to the file
        try {
          await this._saveToFileAsync(this.filePath, this.idx)
        } finally {
          // clear write promise
          this._writePromise = undefined
        }
      })()
    }
    // wait for next write promise
    if (typeof cb === 'function') {
      this._nextWritePromise
        .then(() => {
          cb(null)
        },
        // istanbul ignore next
        (error) => {
          cb(error)
        })
        .catch(
          // istanbul ignore next
          (error) => {
            // istanbul ignore next
            console.error(error)
          }
        )
    } else {
      return this._nextWritePromise
    }
  }

  /**
   * Saves the store to its file synchronously.
   */
  private _saveSync () {
    this._saveToFileSync(this.filePath, this.idx)
    if (this._writePromise) {
      // since we're actively writing, also save async to ensure file gets written correctly
      this._saveAsync((error) => {
        // istanbul ignore next
        if (error) {
          // istanbul ignore next
          console.error(error)
        }
      })
    }
  }

  /**
   * Saves the store to a file asynchronously.
   * @param {string} filePath - The file path to save the store to.
   * @param {CookiesIndex} data - The cookies to save to the file.
   * @returns {Promise} a promise for the write task
   */
  private _saveToFileAsync (filePath: string, data: CookiesIndex): Promise<void> {
    const dataString = this._saveToStringSync(data)
    return fs.promises.writeFile(filePath, dataString)
  }

  /**
   * Saves the store to a file synchronously.
   * @param {string} filePath - The file path to save the store to.
   * @param {CookiesIndex} data - The cookies to save to the file.
   */
  private _saveToFileSync (filePath: string, data: CookiesIndex): void {
    const dataString = this._saveToStringSync(data)
    fs.writeFileSync(filePath, dataString)
  }

  /**
   * Serializes the cookies data to a string
   * @param {CookiesIndex} data - The cookies data to serialize
   * @returns {string} the serialized cookies data
   */
  private _saveToStringSync (data: CookiesIndex): string {
    if (!this.fileFormat) {
      throw new Error('File format has not been determined')
    }
    switch (this.fileFormat) {
      case FileFormat.json:
        return stringifyCookiesJson(data)

      case FileFormat.txt:
        return stringifyNetscapeCookiesTxt(data, {
          httpOnlyExtension: this.httpOnlyExtension
        })

      default:
        throw new Error(`Unknown cookies file format ${this.fileFormat}`)
    }
  }
}

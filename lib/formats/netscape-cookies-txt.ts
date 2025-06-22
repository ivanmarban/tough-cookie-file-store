import * as tough from 'tough-cookie'
import { CookiesIndex } from '../cookies-index'

const HttpOnlyPrefix = '#HttpOnly_'
const AllWhitespaceRegex = /^\s*$/
const CommentRegex = /^\s*#/
const LeadingDotRegex = /^\./

export type ParseNetscapeCookiesOptions = {
  forceParse?: boolean
  httpOnlyExtension?: boolean
  filePath?: string
  onLineError?: (line: string, lineNumber: number) => void
}

/**
 * Parses the text of a netscape cookies.txt file line-by-line, yielding each cookie and its canonical domain.
 * @param {string} data - The string content of the cookies file.
 * @param {object} options - Options for loading the cookies file.
 * @returns {Generator} a generator that yields each cookie
 */
export function * parseNetscapeCookiesTxtLineByLine (data: string, options?: ParseNetscapeCookiesOptions): Generator<{domain:string, cookie:tough.Cookie}> {
  // code adapted from https://github.com/JSBizon/file-cookie-store/blob/61795ac4806504e1baaa3b459bcdaa1517ccad1f/index.js#L188

  // if file is empty, dont bother parsing
  if (!data) {
    return
  }

  // split file into separate lines
  const lines = data.split(/\r\n|\n/)

  // ensure file is actually a cookie file
  const magic = lines[0]
  if ((!magic || !/^#(?: Netscape)? HTTP Cookie File/.test(magic)) && !options?.forceParse) {
    throw new Error(`${options?.filePath || 'File'} does not look like a netscape cookies file`)
  }

  // parse file line by line
  let lineNum = 0
  for (let line of lines) {
    lineNum++

    // ignore if line is blank
    if (AllWhitespaceRegex.test(line)) {
      continue
    }
    // ignore if line is a comment
    const httpOnly = line.startsWith(HttpOnlyPrefix)
    if (CommentRegex.test(line) && (!httpOnly || !options?.httpOnlyExtension)) {
      continue
    }

    // remove #HttpOnly_ prefix
    if (httpOnly) {
      line = line.substring(HttpOnlyPrefix.length)
    }

    // split line parts
    const parsed = line.split(/\t/)
    if (parsed.length !== 7) {
      if (!options?.forceParse) {
        const filePathDescr = options?.filePath ? ` in cookies file ${options.filePath}` : ''
        throw new Error(`Line ${lineNum} is not valid${filePathDescr}`)
      } else {
        options.onLineError?.(line, lineNum)
        continue
      }
    }

    // create cookie object
    const domain = parsed[0]
    const canDomain = tough.canonicalDomain(domain)
    // istanbul ignore next
    if (!canDomain) {
      console.warn(`Empty canonical domain for ${domain}`)
      continue
    }
    // const flag = parsed[1].toUpperCase() // flag is legacy and should be ignored
    const expireSeconds = parseInt(parsed[4])
    const cookie = new tough.Cookie({
      httpOnly,
      domain: canDomain,
      hostOnly: !LeadingDotRegex.test(domain),
      path: parsed[2],
      secure: (parsed[3].toUpperCase() === 'TRUE'),
      expires: expireSeconds ? new Date(expireSeconds * 1000) : 'Infinity',
      key: decodeURIComponent(parsed[5]),
      value: decodeURIComponent(parsed[6])
    })
    yield {
      domain: canDomain,
      cookie
    }
  }
}

/**
 * Parses the text of a netscape cookies.txt file into an array of cookies
 * @param {string} data - The string content of the cookies file.
 * @param {object} options - Options for loading the cookies file.
 * @returns {Cookie[]} the parsed cookies
 */
export function parseNetscapeCookiesTxtToIndex (data: string, options: ParseNetscapeCookiesOptions): CookiesIndex {
  const cookies: CookiesIndex = {}
  for (const { domain, cookie } of parseNetscapeCookiesTxtLineByLine(data, options)) {
    if (domain && cookie.path && cookie.key) {
      let domainVal = cookies[domain]
      if (!domainVal) {
        domainVal = {}
        cookies[domain] = domainVal
      }
      let pathVal = domainVal[cookie.path]
      if (!pathVal) {
        pathVal = {}
        domainVal[cookie.path] = pathVal
      }
      pathVal[cookie.key] = cookie
    }
  }
  return cookies
}

export type StringifyNetscapeCookiesOptions = {
  httpOnlyExtension?: boolean
}

/**
 * Serializes the text of a netscape cookies.txt file from a cookies index.
 * @param {CookiesIndex} cookies - The object containing all the cookies.
 * @param {object} options - Options for serializing the cookies file.
 * @returns {string} the serialized netscape cookies file.
 */
export function stringifyNetscapeCookiesTxt (cookies: CookiesIndex, options?: StringifyNetscapeCookiesOptions): string {
  // code adapted from https://github.com/JSBizon/file-cookie-store/blob/61795ac4806504e1baaa3b459bcdaa1517ccad1f/index.js#L146

  const lines: string[] = [
    '# Netscape HTTP Cookie File\n',
    '# http://www.netscape.com/newsref/std/cookie_spec.html\n',
    '# This is a generated file!  Do not edit.\n\n'
  ]
  for (const domain of Object.keys(cookies)) {
    const domainVal = cookies[domain]
    for (const path of Object.keys(domainVal)) {
      const pathVal = domainVal[path]
      for (const key of Object.keys(pathVal)) {
        const cookie = pathVal[key]
        if (cookie) {
          lines.push(stringifyNetscapeCookiesTxtLine(cookie, options) + '\n')
        }
      }
    }
  }
  return lines.join('')
}

/**
 * Serializes a Cookie object into a line for a cookies.txt file. This does not include the trailing newline.
 * @param {Cookie} cookie - The cookie to serialize
 * @param {object} options - Options for serializing the cookie
 * @returns {string} the serialized netscape cookies.txt line.
 */
export function stringifyNetscapeCookiesTxtLine (cookie: tough.Cookie, options?: StringifyNetscapeCookiesOptions): string {
  let cookieDomain = cookie.domain
  if (!cookie.hostOnly) {
    cookieDomain = '.' + cookieDomain
  }
  return [
    // domain
    ((options?.httpOnlyExtension && cookie.httpOnly)
      ? `${HttpOnlyPrefix}${cookieDomain}`
      : cookieDomain),
    // flag
    ((cookieDomain && LeadingDotRegex.test(cookieDomain)) ? 'TRUE' : 'FALSE'), // hostOnly is legacy and should be determined from the domain
    // path
    cookie.path,
    // secure
    (cookie.secure ? 'TRUE' : 'FALSE'),
    // expires
    (cookie.expires && cookie.expires !== 'Infinity')
      ? Math.round(cookie.expires.getTime() / 1000)
      : 0,
    // key
    encodeURIComponent(cookie.key),
    // value
    encodeURIComponent(cookie.value)
  ].join('\t')
}

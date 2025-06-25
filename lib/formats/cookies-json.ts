import * as tough from 'tough-cookie'
import { CookiesIndex } from '../cookies-index'

export type ParseCookiesJsonOptions = {
  filePath?: string
}

/**
 * Parses the text of a cookies json file.
 * @param {string} data - The json string to parse
 * @param {object} options - Options for parsing the cookies
 * @returns {CookiesIndex} the parsed cookies index
 */
export function parseCookiesJson (data: string, options?: ParseCookiesJsonOptions): CookiesIndex {
  if (!data) {
    // file is empty, so nothing to load
    return {}
  }

  // de-serialize json
  let dataJson: (CookiesIndex | null) = null
  try {
    dataJson = JSON.parse(data)
  } catch {
    // istanbul ignore next
    const filePathStr = options?.filePath ? ` ${options.filePath}` : ''
    throw new Error(`Could not parse cookie file${filePathStr}. Please ensure it is not corrupted.`)
  }

  // parse object
  return parseCookiesJsonObject(dataJson)
}

/**
 * Processes the json object of a cookies json file, converting cookie objects to tough.Cookie instances
 * @param {any} data - The json object to parse
 * @returns {CookiesIndex} the parsed cookies index
 */
export function parseCookiesJsonObject (data: any): CookiesIndex {
  // ensure object is a json object
  if (!data || (typeof data) !== 'object' || data instanceof Array) {
    throw new Error('Invalid cookies file')
  }
  // create Cookie instances of all entries
  for (const d of Object.keys(data)) {
    const dVal = data[d]
    for (const p of Object.keys(dVal)) {
      const pVal = dVal[p]
      for (const k of Object.keys(pVal)) {
        // since Cookie is a class, we need to create an instance of it
        const valJson = JSON.stringify(pVal[k])
        const cookie = tough.Cookie.fromJSON(valJson)
        // istanbul ignore else
        if (cookie) {
          pVal[k] = cookie
        } else if (valJson) {
          console.warn(`Failed to parse cookie object ${valJson}`)
        }
      }
    }
  }
  return data
}

/**
 * Serializes a cookies index to json
 * @param {CookiesIndex} cookies - The cookies index to serialize
 * @returns {string} the serialized cookies index
 */
export function stringifyCookiesJson (cookies: CookiesIndex): string {
  return JSON.stringify(cookies)
}

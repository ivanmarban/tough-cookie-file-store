import * as tough from 'tough-cookie'

export type CookiesMap = {
  [key: string]: tough.Cookie
}

export type CookiesDomainData = {
  [path: string]: CookiesMap
}

export type CookiesIndex = {
  [domain: string]: CookiesDomainData
}

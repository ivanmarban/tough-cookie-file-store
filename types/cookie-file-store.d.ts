/**
 * Class representing a JSON file store.
 *
 * @augments Store
 */
export default class FileCookieStore extends Store {
    /**
     * Creates a new JSON file store in the specified file.
     *
     * @param {string} filePath - The file in which the store will be created.
     */
    constructor(filePath: string);
    idx: {};
    filePath: string;
    /**
     * The findCookie callback.
     *
     * @callback FileCookieStore~findCookieCallback
     * @param {Error} error - The error if any.
     * @param {Cookie} cookie - The cookie found.
     */
    /**
     * Retrieve a cookie with the given domain, path and key.
     *
     * @param {string} domain - The cookie domain.
     * @param {string} path - The cookie path.
     * @param {string} key - The cookie key.
     * @param {FileCookieStore~findCookieCallback} cb - The callback.
     */
    findCookie(domain: string, path: string, key: string, cb: any): void;
    /**
     * The findCookies callback.
     *
     * @callback FileCookieStore~allowSpecialUseDomainCallback
     * @param {Error} error - The error if any.
     * @param {Cookie[]} cookies - Array of cookies.
     */
    /**
     * The findCookies callback.
     *
     * @callback FileCookieStore~findCookiesCallback
     * @param {Error} error - The error if any.
     * @param {Cookie[]} cookies - Array of cookies.
     */
    /**
     * Locates cookies matching the given domain and path.
     *
     * @param {string} domain - The cookie domain.
     * @param {string} path - The cookie path.
     * @param {FileCookieStore~allowSpecialUseDomainCallback} allowSpecialUseDomain - The callback.
     * @param {FileCookieStore~findCookiesCallback} cb - The callback.
     */
    findCookies(domain: string, path: string, allowSpecialUseDomain: any, cb: any): void;
    /**
     * The putCookie callback.
     *
     * @callback FileCookieStore~putCookieCallback
     * @param {Error} error - The error if any.
     */
    /**
     * Adds a new cookie to the store.
     *
     * @param {Cookie} cookie - The cookie.
     * @param {FileCookieStore~putCookieCallback} cb - The callback.
     */
    putCookie(cookie: Cookie, cb: any): void;
    /**
     * The updateCookie callback.
     *
     * @callback FileCookieStore~updateCookieCallback
     * @param {Error} error - The error if any.
     */
    /**
     * Update an existing cookie.
     *
     * @param {Cookie} oldCookie - The old cookie.
     * @param {Cookie} newCookie - The new cookie.
     * @param {FileCookieStore~updateCookieCallback} cb - The callback.
     */
    updateCookie(oldCookie: Cookie, newCookie: Cookie, cb: any): void;
    /**
     * The removeCookie callback.
     *
     * @callback FileCookieStore~removeCookieCallback
     * @param {Error} error - The error if any.
     */
    /**
     * Remove a cookie from the store.
     *
     * @param {string} domain - The cookie domain.
     * @param {string} path - The cookie path.
     * @param {string} key - The cookie key.
     * @param {FileCookieStore~removeCookieCallback} cb - The callback.
     */
    removeCookie(domain: string, path: string, key: string, cb: any): void;
    /**
     * The removeCookies callback.
     *
     * @callback FileCookieStore~removeCookiesCallback
     * @param {Error} error - The error if any.
     */
    /**
     * Removes matching cookies from the store.
     *
     * @param {string} domain - The cookie domain.
     * @param {string} path - The cookie path.
     * @param {FileCookieStore~removeCookiesCallback} cb - The callback.
     */
    removeCookies(domain: string, path: string, cb: any): void;
    /**
     * The removeAllCookies callback.
     *
     * @callback FileCookieStore~removeAllCookiesCallback
     * @param {Error} error - The error if any.
     */
    /**
     * Removes all cookies from the store.
     *
     * @param {FileCookieStore~removeAllCookiesCallback} cb - The callback.
     */
    removeAllCookies(cb: any): void;
    /**
     * The getAllCookies callback.
     *
     * @callback FileCookieStore~getAllCookiesCallback
     * @param {Error} error - The error if any.
     * @param {Array} cookies - An array of cookies.
     */
    /**
     * Produces an Array of all cookies from the store.
     *
     * @param {FileCookieStore~getAllCookiesCallback} cb - The callback.
     */
    getAllCookies(cb: any): void;
    /**
     * Returns a string representation of the store object for debugging purposes.
     *
     * @returns {string} - The string representation of the store.
     * @private
     */
    private _inspect;
    /**
     * The loadFromFile callback.
     *
     * @callback FileCookieStore~loadFromFileCallback
     * @param {object} dataJson - The content of the store.
     */
    /**
     * Load the store from file.
     *
     * @param {string} filePath - The file in which the store will be created.
     * @param {FileCookieStore~loadFromFileCallback} cb - The callback.
     * @private
     */
    private _loadFromFile;
    /**
     * The saveToFile callback.
     *
     * @callback FileCookieStore~saveToFileCallback
     */
    /**
     * Saves the store to a file.
     *
     * @param {string} filePath - The file in which the store will be created.
     * @param {object} data - The data to be saved.
     * @param {FileCookieStore~saveToFileCallback} cb - The callback.
     * @private
     */
    private _saveToFile;
}
import { Store } from 'tough-cookie';
import { Cookie } from 'tough-cookie';

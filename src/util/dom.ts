import * as R from "remeda";

/**  DOM helper functions that return HTMLElement(s) (or `null`) */

type MaybeHTML = Maybe<Document | Element | EventTarget>;

/**
 * Create an `HTMLElement` with classes, dataset, and children
 * @param nodeName  A valid HTML element tag name,
 * @param options Additional options for adjusting the created element
 * @param options.classes A list of class names
 * @param options.dataset An object of keys and values with which to populate the `dataset`: nullish values and `false`
 *                        will be excluded. A value of `true` will result in an empty-string value.
 * @param options.aria An object of keys and values with which to populate the `dataset`: nullish values and `false`
 *                     will be excluded.
 * @param options.children A list of child elements as well as strings that will be converted to text nodes
 * @param options.innerHTML A string to set as the inner HTML of the created element. Only one of `children` and
 *                          `innerHTML` can be used.
 * @returns The HTML element with all options applied
 */
function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
    nodeName: K,
    options?: CreateHTMLElementOptionsWithChildren,
): HTMLElementTagNameMap[K];
function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
    nodeName: K,
    options?: CreateHTMLElementOptionsWithInnerHTML,
): HTMLElementTagNameMap[K];
function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
    nodeName: K,
    options?: CreateHTMLElementOptionsWithNeither,
): HTMLElementTagNameMap[K];
function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
    nodeName: K,
    { classes = [], dataset = {}, aria = {}, children = [], innerHTML }: CreateHTMLElementOptions = {},
): HTMLElementTagNameMap[K] {
    const element = document.createElement(nodeName);
    if (classes.length > 0) element.classList.add(...classes);

    for (const [key, value] of Object.entries(dataset)) {
        if (R.isNullish(value) || value === false) continue;
        element.dataset[key] = value === true ? "" : String(value);
    }
    for (const [key, value] of Object.entries(aria)) {
        if (R.isNullish(value) || value === false) continue;
        element.setAttribute(`aria-${key}`, value);
    }

    if (innerHTML) {
        element.innerHTML = innerHTML;
    } else {
        for (const child of children) {
            const childElement = child instanceof HTMLElement ? child : new Text(child);
            element.appendChild(childElement);
        }
    }

    return element;
}

interface CreateHTMLElementOptions {
    classes?: string[];
    dataset?: Record<string, Maybe<string | number | boolean>>;
    aria?: Record<string, Maybe<string | false>>;
    children?: (HTMLElement | string)[];
    innerHTML?: string;
}

interface CreateHTMLElementOptionsWithChildren extends CreateHTMLElementOptions {
    children: (HTMLElement | string)[];
    innerHTML?: never;
}

interface CreateHTMLElementOptionsWithInnerHTML extends CreateHTMLElementOptions {
    children?: never;
    innerHTML: string;
}

interface CreateHTMLElementOptionsWithNeither extends CreateHTMLElementOptions {
    children?: never;
    innerHTML?: never;
}

function htmlQuery<K extends keyof HTMLElementTagNameMap>(
    parent: MaybeHTML,
    selectors: K,
): HTMLElementTagNameMap[K] | null;
function htmlQuery(parent: MaybeHTML, selectors: string): HTMLElement | null;
function htmlQuery<E extends HTMLElement = HTMLElement>(parent: MaybeHTML, selectors: string): E | null;
function htmlQuery(parent: MaybeHTML, selectors: string): HTMLElement | null {
    if (!(parent instanceof Element || parent instanceof Document)) return null;
    return parent.querySelector<HTMLElement>(selectors);
}

function htmlQueryAll<K extends keyof HTMLElementTagNameMap>(
    parent: MaybeHTML,
    selectors: K,
): HTMLElementTagNameMap[K][];
function htmlQueryAll(parent: MaybeHTML, selectors: string): HTMLElement[];
function htmlQueryAll<E extends HTMLElement = HTMLElement>(parent: MaybeHTML, selectors: string): E[];
function htmlQueryAll(parent: MaybeHTML, selectors: string): HTMLElement[] {
    if (!(parent instanceof Element || parent instanceof Document)) return [];
    return Array.from(parent.querySelectorAll<HTMLElement>(selectors));
}

function htmlClosest<K extends keyof HTMLElementTagNameMap>(
    parent: MaybeHTML,
    selectors: K,
): HTMLElementTagNameMap[K] | null;
function htmlClosest(child: MaybeHTML, selectors: string): HTMLElement | null;
function htmlClosest<E extends HTMLElement = HTMLElement>(parent: MaybeHTML, selectors: string): E | null;
function htmlClosest(child: MaybeHTML, selectors: string): HTMLElement | null {
    if (!(child instanceof Element)) return null;
    return child.closest<HTMLElement>(selectors);
}

/** Create a reasonably specific selector for an HTML element */
function htmlSelectorFor(element: HTMLElement): string {
    const nodeName = element.nodeName.toLowerCase();
    const classes = element.className.split(" ").filter(R.isTruthy);
    const classesString = classes.length > 0 ? `.${classes.join(".")}` : "";
    const datasetEntries = Object.entries(element.dataset).map(([k, v]) => [
        k.replace(/([A-Z])/g, "-$1").toLowerCase(),
        v,
    ]);
    const datasetString = datasetEntries.map(([k, v]) => `[data-${k}="${v}"]`).join("");

    return `${nodeName}${classesString}${datasetString}`;
}

export { createHTMLElement, htmlClosest, htmlQuery, htmlQueryAll, htmlSelectorFor };

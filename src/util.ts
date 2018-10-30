import { THING_TYPE } from "./thing-type";

export function number(value: string, defaultVal: number) {
    let num = Number(value);
    return isNaN(num) ? defaultVal : num;
}

export function string(value: string, defaultVal: string) {
    return typeof value !== 'undefined' ? value : defaultVal;
}

export function bool(value: string, defaultVal: boolean) {
    if (typeof value === 'undefined') {
        return defaultVal;
    }

    value = (value || '').trim().toLocaleLowerCase();

    return value === 'true';
}

export function getEnvVal(key: string): string
export function getEnvVal<T>(key: string, converter: (str: string, defaultVal: T) => T, defaultVal?: T): T
export function getEnvVal<T>(key: string, converter?: (str: string, defaultVal: T) => T, defaultVal?: T): T | string {
    let strValue = process.env[key];

    if (typeof converter !== 'undefined') {
        return converter(strValue, defaultVal);
    }

    return strValue;
}

/**
 * Determines the type of thing based on the format.
 * @param thing The thing to check
 */
export function getThingType(thing: string): THING_TYPE {
    // users start with <, things start with `
    return thing && (thing[0] === '<' ? THING_TYPE.user : thing[0] === '`' ? THING_TYPE.thing : THING_TYPE.unknown);
}

export function isUser(thing: string) {
    return getThingType(thing) === THING_TYPE.user;
}

export function isThing(thing: string) {
    return getThingType(thing) === THING_TYPE.thing;
}

export function sanitizeUser(thing: string) {
    if (isUser(thing)) {
        thing = thing.replace(/\|\w+>/, '>');
    }

    return thing;
}
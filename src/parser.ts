import { sanitizeUser } from "./util";

// match <@user-mention> or `something` or :some-emoji: ++ --
const karmaParser = /(?:(<@[WU][^>]+?>)|((?:`[^`]+`)|(?::[-+'\w]+:)))\s*([+-]{2,})/gi;

/**
 * Converts a string of + or - to a Number.
 * @param str A string of + or -.
 */
function strToNum(str: string): number {
    let num = 0,
        change = str && str.length - 1,
        c = str && str[0];

    // assume all characters are the same
    switch (c) {
        case '+':
            num = change;
            break;
        case '-':
            num = change * -1;
            break;
        default:
            console.warn(`strToNum: unknown character '${c}'`);
            break;
    }

    return num;
}

/**
 * Parses a message and returns the karma changes.
 * @param messageText The text of the message from Slack
 */
export function getChanges(messageText: string) {
    let changes = new Map<string, number>();
    let match;

    if (messageText) {
        do {
            match = karmaParser.exec(messageText);

            if (match) {
                let [, user, thing, change] = match;

                if (!changes.has(thing)) {
                    changes.set(sanitizeUser(user) || thing, strToNum(change));
                }
            }
        } while (match);
    }

    return changes;
}
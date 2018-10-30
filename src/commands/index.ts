import { CommandFn } from './command';
import help from './help';
import queryBuilder from './query-builder';
import * as db from '../db';
import { THING_TYPE } from '../thing-type';
import { sanitizeUser } from '../util';

const commands: { [command: string]: CommandFn } = {
    help,
    users: queryBuilder(THING_TYPE.user),
    things: queryBuilder(THING_TYPE.thing)
};

async function lookupThing(thing: string) {
    thing = sanitizeUser(thing);
    const result = await db.get(thing);
    return result || { id: 0, karma: 0, thing: '', type: THING_TYPE.unknown };
}

export function getCommand(message: string) {
    let command = 'help';
    let flags: string[] = [];
    let words = message.split(' ');

    for (let word of words) {
        if (word[0] === ':') {
            flags.push(word);
        } else {
            command = word;
            break;
        }
    }

    let fn = commands[command];

    if (!fn && !command) {
        fn = commands.help;
    }

    if (!fn) {
        fn = async (tags, req, res) => {
            const record = await lookupThing(command);
            res.send(`${record.thing || command} has ${record.karma || 0} karma.`);
        };
    }

    return {
        command,
        fn,
        flags
    };
}

export default getCommand;
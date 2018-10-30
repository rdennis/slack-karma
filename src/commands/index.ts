import { CommandFn } from './command';

import help from './help';
import queryBuilder from './query-builder';
import * as db from '../db';

const commands: { [command: string]: CommandFn } = {
    help,
    users: queryBuilder(db.THING_TYPE.user),
    things: queryBuilder(db.THING_TYPE.thing)
};

async function lookupThing(thing: string) {
    const result = await db.get(thing);
    return result;
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
    } else {
        fn = async (tags, req, res) => {
            const record = await lookupThing(command);
            res.send(`${record.thing} has ${record.karma || 0} karma.`);
        };
    }

    return {
        command,
        fn,
        flags
    };
}

export default getCommand;
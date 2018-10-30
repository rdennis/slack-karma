import { CommandFn } from './command';

import help from './help';
import queryBuilder from './query-builder';
import { THING_TYPE } from '../db';

const commands: { [command: string]: CommandFn } = {
    help,
    users: queryBuilder(THING_TYPE.user),
    things: queryBuilder(THING_TYPE.thing)
};

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

    return {
        command: command,
        fn: commands[command] || commands.help,
        flags
    };
}

export default getCommand;
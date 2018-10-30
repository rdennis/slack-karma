import { CommandFn } from './command';

import help from './help';
import users from './users';
import things from './things';

const commands: { [command: string]: CommandFn } = {
    help,
    users,
    things
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
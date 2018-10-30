import { CommandFn } from './command';
import * as db from '../db';

interface Config {
    top: boolean
    bottom: boolean
    [flag: string]: boolean
}

function parseFlags(flags: string[]) {
    let config: Config = {
        top: false,
        bottom: false
    };

    for (let flag of flags) {
        if (flag[0] === ':') {
            flag = flag.substr(1);
        }

        config[flag] = true;
    }

    return config;
}

export const users: CommandFn = async (flags, req, res) => {
    const config = parseFlags(flags);
    let result: db.KarmaRecord[];
    let message = 'The users with the ';

    if ((config.bottom && config.top) || (!config.bottom && !config.top)) {
        res.send('You must specify :top or :bottom.');
        return;
    }

    if (config.bottom) {
        message += 'least';
        result = await db.getBottom(db.THING_TYPE.user);
    } else {
        message += 'most';
        result = await db.getTop(db.THING_TYPE.user);
    }

    res.send(`${message} karma:
${result.map(record => `\n   ${record.karma}  ${record.thing}`)}`);
};

export default users;
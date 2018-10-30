import { CommandFn } from './command';

export const users: CommandFn = (flags, req, res) => {
    res.send(`users: ${flags.join(', ')}`);
};

export default users;
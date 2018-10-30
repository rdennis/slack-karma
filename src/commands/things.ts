import { CommandFn } from './command';

export const things: CommandFn = (flags, req, res) => {
    res.send(`things: ${flags.join(', ')}`);
};

export default things;
const help = require('./help');
const users = require('./users');
const things = require('./things');

const commands = {
    help,
    users,
    things
};

function getCommand(message) {
    let command = 'help';
    let flags = [];
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

module.exports = {
    getCommand
};
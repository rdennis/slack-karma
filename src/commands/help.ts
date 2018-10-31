import { CommandFn } from './command';

export const help: CommandFn = (flags, req, res) => {
    res.json({
        response_type: 'ephemeral', // only visible to user
        text: 'Karma bot is back baby!',
        attachments: [{
            title: 'Usage',
            text:
                // don't forget to account for the \ not appearing in the output
                `
\`\`\`
/karma                  print this help message
/karma :top things      show top 10 things
/karma :bottom things   show bottom 10 things
/karma :top users       show top 10 users
/karma :bottom users    show bottom 10 users
/karma \`thing\`          lookup thing's current karma
/karma @user            lookup a user's current karma
\`thing\`++               add 1 karma to thing
\`thing\`---              remove 2 karma from thing
\`subject phrase\`++      add 1 karma to a subject phrase
@user++                 add 1 karma to a user
\`\`\`
`
        }]
    });
};

export default help;
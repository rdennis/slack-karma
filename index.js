require('dotenv').load();

const { getEnvVal } = require('./util');

// ENV variables
const PORT = getEnvVal('PORT', 3000);
const ENABLE_BUZZKILL = getEnvVal('ENABLE_BUZZKILL', true);
const BUZZKILL = getEnvVal('BUZZKILL_LIMIT', 5);
const SLACK_SIGNING_SECRET = getEnvVal('SLACK_SIGNING_SECRET');
const SLACK_OAUTH_ACCESS_TOKEN = getEnvVal('SLACK_OAUTH_ACCESS_TOKEN');

// Initialize using signing secret from env variables
const { createEventAdapter } = require('@slack/events-api');
const slackEvents = createEventAdapter(SLACK_SIGNING_SECRET, { includeBody: true });

// Initialize client with oauth token
const { WebClient: SlackClient } = require('@slack/client');
const slack = new SlackClient(SLACK_OAUTH_ACCESS_TOKEN);

const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

const { getCommand } = require('./commands');

// match <@user-mention> or "something" ++ --
const karmaParser = /(?:(?:(<@[WU].+?>))|(?:(`[^`]+`)))\s*([+-]{2,})/gi;

const KARMA = new Map();

/**
 * Converts a string of + or - to a Number.
 * @param {string} str A string of + or -.
 * @returns {Number}
 */
function strToNum(str) {
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
 * Checks if the thing is the user.
 * @param {string} thing The thing being changed
 * @param {string} user The user requesting changes
 * @returns {boolean}
 */
function thingIsUser(thing, user) {
    return thing === `<@${user}>`;
}

/**
 * Parses a message and returns the karma changes.
 * @param {string} messageText The text of the message from Slack
 * @returns {Map}
 */
function getChanges(messageText) {
    let changes = new Map();
    let match;

    if (messageText) {
        do {
            match = karmaParser.exec(messageText);

            if (match) {
                let [, user, thing, change] = match;
                // thing = match[1] || match[2];
                // change = strToNum(match[3]);

                if (!changes.has(thing)) {
                    changes.set(user || thing, strToNum(change));
                }
            }
        } while (match);
    }

    return changes;
}

/**
 * Makes the changes to Karma.
 * @param {Map} changes Changes requested
 * @param {string} user
 * @returns {Array}
 */
function makeChanges(changes, user) {
    let updates = [];

    if (changes.size > 0) {
        for (let [thing, change] of changes) {
            let prev = 0,
                now = 0,
                buzzkill = false,
                sabotage = thingIsUser(thing, user);

            if (!sabotage) {
                if (ENABLE_BUZZKILL && Math.abs(change) > BUZZKILL) {
                    buzzkill = true;
                    change = BUZZKILL * (change > 0 ? 1 : -1);
                }

                if (KARMA.has(thing)) {
                    prev = KARMA.get(thing);
                }

                now = prev + change;

                console.log(`${thing}: ${prev} => ${now}${(buzzkill ? ' (buzzkill)' : '')}`);

                KARMA.set(thing, now);
            }

            updates.push({
                sabotage,
                thing,
                buzzkill,
                change,
                prev,
                now
            });
        }
    }

    return updates;
}

/**
 * Creates the message to be sent back to Slack after an update is made.
 * @param {Object} update The update
 * @returns {string}
 */
function getMessageText(update) {
    let { sabotage, thing, change, now, prev, buzzkill } = update,
        text = `SABOTAGE!! You can't change your own karma! SHAME!`;

    if (!sabotage) {
        text = `${thing}'s karma has ${Math.abs(change) > 0 ? 'increased' : 'decreased'} from ${prev} to ${now}${(buzzkill ? ` (Buzzkill Mode™️ has enforced a maximum change of ${BUZZKILL} point${BUZZKILL === 1 ? '' : 's'})` : '')}.`;
    }

    return text;
}

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

app.use('/slack/command', (req, res, next) => {
    console.log('/slack/command');
    console.dir(req.body);

    let command = getCommand(req.body.text);

    if (!command.fn) {
        res.send(`Unknown command '${command.command}'.`);
        return;
    }

    command.fn(command.flags, req, res, next);
});

app.use('/slack/events', slackEvents.expressMiddleware());

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', event => {
    // only allow users to make karma changes
    if (event.user) {
        console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);

        let changes = getChanges(event.text);
        let updates = makeChanges(changes, event.user);

        if (updates) {
            console.log(`USER: ${event.user}`);
            for (let update of updates) {
                let text = getMessageText(update);

                slack.chat.postMessage({
                    channel: event.channel,
                    text
                })
                    .then(res => {
                        console.log('Message sent:', res.ts);
                    })
                    .catch(console.error);
            }
        }
    }
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

// Start a basic HTTP server
http.createServer(app).listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
});
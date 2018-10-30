import { config as envLoad } from 'dotenv';
envLoad();

import { getEnvVal, number, bool, getThingType, sanitizeUser } from './util';

// ENV variables
const PORT = getEnvVal('PORT', number, 3000);
const ENABLE_BUZZKILL = getEnvVal('ENABLE_BUZZKILL', bool, true);
const BUZZKILL = getEnvVal('BUZZKILL_LIMIT', number, 5);
const SLACK_SIGNING_SECRET = getEnvVal('SLACK_SIGNING_SECRET');
const SLACK_OAUTH_ACCESS_TOKEN = getEnvVal('SLACK_OAUTH_ACCESS_TOKEN');

// Initialize using signing secret from env variables
import { createEventAdapter, Message } from '@slack/events-api';
const slackEvents = createEventAdapter(SLACK_SIGNING_SECRET, { includeBody: true });

// Initialize client with oauth token
import { WebClient as SlackClient, WebAPICallResult } from '@slack/client';
const slack = new SlackClient(SLACK_OAUTH_ACCESS_TOKEN);

import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';

import getCommand from './commands';
import * as db from './db';

// match <@user-mention> or "something" ++ --
const karmaParser = /(?:(?:(<@[WU].+?>))|(?:(`[^`]+`)))\s*([+-]{2,})/gi;

interface Update {
    sabotage: boolean
    thing: string
    buzzkill: boolean
    change: number
    prev: number
    now: number
}

/**
 * Converts a string of + or - to a Number.
 * @param {string} str A string of + or -.
 * @returns {Number}
 */
function strToNum(str: string): number {
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
function thingIsCurrentUser(thing: string, user: string) {
    return thing === `<@${user}>`;
}

/**
 * Parses a message and returns the karma changes.
 * @param {string} messageText The text of the message from Slack
 * @returns {Map}
 */
function getChanges(messageText: string) {
    let changes = new Map<string, number>();
    let match;

    if (messageText) {
        do {
            match = karmaParser.exec(messageText);

            if (match) {
                let [, user, thing, change] = match;

                if (!changes.has(thing)) {
                    changes.set(sanitizeUser(user) || thing, strToNum(change));
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
async function makeChanges(changes: Map<string, number>, user: string): Promise<Update[]> {
    let updates = [];

    if (changes.size > 0) {
        for (let [thing, change] of changes) {
            let prev = 0,
                now = 0,
                buzzkill = false,
                sabotage = thingIsCurrentUser(thing, user);

            if (!sabotage) {
                if (ENABLE_BUZZKILL && Math.abs(change) > BUZZKILL) {
                    buzzkill = true;
                    change = BUZZKILL * (change > 0 ? 1 : -1);
                }

                let record = await db.get(thing);

                if (record) {
                    prev = record.karma;
                }

                now = prev + change;

                console.log(`${thing}: ${prev} => ${now}${(buzzkill ? ' (buzzkill)' : '')}`);

                await db.createOrUpdate({ id: record && record.id, type: getThingType(thing), karma: now, thing });
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
function getMessageText(update: Update) {
    let { sabotage, thing, change, now, prev, buzzkill } = update,
        text = change > 0 ? `Don't be a weasel.` : `Aw, don't be so hard on yourself.`;

    if (!sabotage) {
        text = `${thing}'s karma has ${change > 0 ? 'increased' : 'decreased'} from ${prev} to ${now}${(buzzkill ? ` (Buzzkill Mode™️ has enforced a maximum change of ${BUZZKILL} point${BUZZKILL === 1 ? '' : 's'})` : '')}.`;
    }

    return text;
}

const app = express();

app.use('/slack/events', slackEvents.expressMiddleware());

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', async (event: Message) => {
    // only allow users to make karma changes
    if (event.user) {
        console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);

        let changes = getChanges(event.text);
        let updates = await makeChanges(changes, event.user);

        if (updates) {
            console.log(`USER: ${event.user}`);
            for (let update of updates) {
                let text = getMessageText(update);

                slack.chat.postMessage({
                    channel: event.channel,
                    text
                })
                    .then((res: WebAPICallResult) => {
                        console.log('Message sent:', res.ok);
                    })
                    .catch(console.error);
            }
        }
    }
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

// slash command config
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/slack/command', (req, res, next) => {
    let command = getCommand(req.body.text);

    if (!command.fn) {
        console.error(`Unknown command: '${command.command}'.`);
        res.send(`Unknown command '${command.command}'.`);
        return;
    }

    console.log(`Calling command: ${(command.flags && command.flags.length > 0 ? `${command.flags.join(' ')} ` : '')}${command.command}`);
    command.fn(command.flags, req, res, next);
});

app.use('/', async (req, res) => {
    const records = await db.getAll();

    res.send(`<h1>Slack Karma ☯</h1>
<p>Slack Karma is up and running.</p>
<h2>Leaderboard</h2>
${
        records.length < 1 ?
            '<p><i>Empty!</i></p>' :
            `<ol>${records.map(r => `<li>${r.karma} - ${r.thing}</li>`)}</ol>`
        }`);
});


// Start a basic HTTP server
http.createServer(app).listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
});
import 'newrelic';
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
import { WebClient as SlackClient, WebAPICallResult, ChatPostMessageArguments, MessageAttachment } from '@slack/client';
const slack = new SlackClient(SLACK_OAUTH_ACCESS_TOKEN);

import http from 'http';
import express from 'express';
import bodyParser from 'body-parser';

import getCommand from './commands';
import * as db from './db';
import { getChanges } from './parser';

interface Update {
    sabotage: boolean
    thing: string
    buzzkill: boolean
    change: number
    prev: number
    now: number
    success: boolean
}

/**
 * Checks if the thing is the user.
 * @param thing The thing being changed
 * @param user The user requesting changes
 */
function thingIsCurrentUser(thing: string, user: string) {
    return thing === `<@${user}>`;
}

/**
 * Makes the changes to Karma.
 * @param changes Changes requested
 * @param user
 */
async function makeChanges(changes: Map<string, number>, user: string): Promise<Update[]> {
    let updates = [];

    if (changes.size > 0) {
        for (let [thing, change] of changes) {
            let prev = 0,
                now = 0,
                buzzkill = false,
                sabotage = thingIsCurrentUser(thing, user),
                success = true;

            if (!sabotage) {
                try {
                    if (ENABLE_BUZZKILL && Math.abs(change) > BUZZKILL) {
                        buzzkill = true;
                        change = BUZZKILL * (change > 0 ? 1 : -1);
                    }

                    let record = await db.get(thing);

                    if (record) {
                        prev = record.karma;
                    }

                    now = prev + change;

                    console.log(`${thing}: ${change} ${prev} => ${now}${buzzkill ? ' (buzzkill)' : ''}`);

                    const karmaRecord: db.CreateOrUpdateRecord = {
                        id: record && record.id,
                        type: getThingType(thing),
                        karma: now,
                        thing
                    };

                    success = await db.createOrUpdate(karmaRecord, change, user);
                } catch (ex) {
                    success = false;
                }
            }

            updates.push({
                sabotage,
                thing,
                buzzkill,
                change,
                prev,
                now,
                success
            });
        }
    }

    return updates;
}

/**
 * Creates the message to be sent back to Slack after an update is made.
 * @param update The update
 */
function getMessageText(update: Update) {
    const { sabotage, thing, change, now, prev, buzzkill, success } = update;

    if (!success) {
        throw `Something went wrong. Failed to update karma for ${thing}.`;
    }

    if (sabotage) {
        return change > 0 ? `Don't be a weasel.` : `Aw, don't be so hard on yourself.`;
    } else {
        return `${thing}'s karma has ${change > 0 ? 'increased' : 'decreased'} from ${prev} to ${now}${(buzzkill ? ` (Buzzkill Mode™️ has enforced a maximum change of ${BUZZKILL} point${BUZZKILL === 1 ? '' : 's'})` : '')}.`;
    }
}

/**
 * Get the ts to use when replying to a thread.
 * @param event The event
 */
function getParentMessage(event: Message) {
    let ts = event.ts,
        thread_ts = ts;

    if (Object.prototype.hasOwnProperty.call(event, 'thread_ts')) {
        thread_ts = (<any>event).thread_ts;
    }

    return ts !== thread_ts ? thread_ts : ts;
}

/**
 * Send a chat message.
 * @param message The message to be sent
 */
function postMessage(message: ChatPostMessageArguments) {
    const promise = slack.chat.postMessage(message);

    promise
        .then(res => console.log('Message sent:', res.ok))
        .catch(console.error);

    return promise;
}

const app = express();

app.use('/slack/events', slackEvents.expressMiddleware());

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', async (event: Message) => {
    // only allow users to make karma changes
    if (event.user) {
        console.log(`Received a message event: user ${event.user} in channel ${event.channel} says ${event.text}`);
        const thread_ts = getParentMessage(event);

        const postErrorMessage = (attachments: MessageAttachment[] = []) => {
            // put generic error message in front of other attachments
            attachments.unshift({
                fallback: `An error occurred. Tell Robert to fix it.`,
                title: 'Uh oh!',
                text: `An error occurred. Tell Robert to fix it.`,
                color: 'danger'
            });

            postMessage({
                channel: event.channel,
                thread_ts,
                text: '',
                icon_emoji: ':poop:',
                attachments
            });
        };


        try {
            let changes = getChanges(event.text);
            let updates = await makeChanges(changes, event.user);

            if (updates) {
                console.log(`USER: ${event.user}`);
                for (let update of updates) {
                    try {
                        postMessage({
                            channel: event.channel,
                            thread_ts,
                            text: getMessageText(update)
                        });
                    } catch (err) {
                        postErrorMessage([{
                            fallback: err,
                            title: 'Error',
                            text: err,
                            color: 'danger'
                        }]);
                    }
                }
            }
        } catch (err) {
            console.error('An error occurred in the message event handler.');
            console.error(err);
            postErrorMessage();
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
    const changesN = 100;

    const records = await db.getAll();
    const changes = await db.getChanges(changesN);

    res.send(`
<style>
    table {
        border-collapse: collapse;
        border: 1px solid #f5f5f5;
        background: #f5f5f5;
    }

    th, td {
        padding: 5px 10px;
    }

    tbody > tr:nth-of-type(odd) {
        background: #ffffff;
    }
</style>

<h1>Slack Karma ☯</h1>
<p>Slack Karma is up and running.</p>
<h2>Leaderboard</h2>
    ${records.length < 1
            ?
            '<p><i>Empty!</i></p>'
            :
            `<table>
                <thead>
                    <tr>
                        <th>Karma</th>
                        <th>Name</th>
                        <th>Updated</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(r => `
                        <tr>
                            <td>${r.karma}</td>
                            <td>${r.thing}</td>
                            <td>${r.edited_on.toISOString()}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`
        }
        
    ${changes.length < 1
            ?
            ''
            :
            `<details>
                <summary>Latest ${changesN} Changes</summary>
                <table>
                    <thead>
                        <tr>
                            <th>Delta</th>
                            <th>Name</th>
                            <th>Editor</th>
                            <th>Edited On</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${changes.map(c => `
                            <tr>
                                <td>${c.delta}</td>
                                <td>${c.thing}</td>
                                <td>${c.editor}</td>
                                <td>${c.edited_on.toISOString()}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </details>`
        }`);
});


// Start a basic HTTP server
http.createServer(app).listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
});
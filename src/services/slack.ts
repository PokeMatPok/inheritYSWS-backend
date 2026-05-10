import { App } from '@slack/bolt';

const slackApp = new App({
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    port: process.env.SLACK_PORT ? parseInt(process.env.SLACK_PORT) : 3001,
});

export async function sendMessageToSlack(channel: string, text: string, blocks?: any[]) {
    await slackApp.client.chat.postMessage({
        channel: channel,
        text: text,
        blocks: blocks
    }).catch((err) => {
        console.error('Error sending message to Slack:', err);
    })
}
export default slackApp;
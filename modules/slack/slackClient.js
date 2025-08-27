const { WebClient } = require('@slack/web-api');

// Створюємо інстанс WebClient з токеном бота
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = slackClient;






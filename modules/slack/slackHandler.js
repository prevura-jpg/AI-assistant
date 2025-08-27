const express = require('express');
const router = express.Router();
const slackClient = require('./slackClient');

// Імпортуємо всі обробники
const { handleAlert } = require('./alertsHandler');
const { handleWixezAlert } = require('./wixezHandler');
const { checkManagerAlert } = require('./managerAlertsHandler');
const { checkHarixxReport } = require('./harixxReportHandler');
const { checkProxiAlert } = require('./proxiAlertHandler');
const { initReportChecker, handleWarehouseReport } = require('./reportChecker');

// Змінна для зберігання ID бота
let botId = null;

// Функція для отримання ID нашого бота
async function getMyBotId() {
    try {
        const authTest = await slackClient.auth.test();
        botId = authTest.bot_id;
        console.log(`Successfully retrieved bot ID: ${botId}`);
    } catch (error) {
        console.error('Error fetching bot ID:', error.message);
    }
}

// Мапа каналів та їх обробників
const channelHandlers = {
    [process.env.SLACK_MANAGER_ALERT_CHANNEL_ID]: checkManagerAlert,
    [process.env.SLACK_PARSER_ORDERS_ALERTS_CHANNEL_ID]: handleAlert,
    [process.env.SLACK_WIXEZ_ALERT_CHANNEL_ID]: handleWixezAlert,
    [process.env.SLACK_HARIXX_REPORT_CHANNEL_ID]: checkHarixxReport,
    [process.env.SLACK_PROXI_ALERT_CHANNEL_ID]: checkProxiAlert,
    [process.env.SLACK_WAREHOUSE_ALERT_CHANNEL_ID]: handleWarehouseReport,
};

// ====== Додатковий wrapper для безпечної обробки подій ======
function safeHandleSlackEvent(payload) {
    // Debug: показуємо повний об’єкт події
    console.log('Slack event received (debug):', JSON.stringify(payload, null, 2));

    let event;
    if (payload.type === 'event_callback' && payload.event) {
        event = payload.event;
    } else if (payload.type === 'message') {
        event = payload;
    } else {
        console.log('Ignored payload type:', payload.type);
        return;
    }

    // Ігноруємо повідомлення від самого бота
    if (event.bot_id && event.bot_id === botId) {
        console.log('Ignoring message from self (the bot).');
        return;
    }

    // Ігноруємо системні subtype, залишаємо лише повідомлення, які треба обробляти
    if (event.subtype && !['bot_message', 'slackbot_message', 'message_changed'].includes(event.subtype)) {
        console.log(`Ignoring message with subtype: ${event.subtype}`);
        return;
    }

    // Динамічне вилучення тексту з різних полів
    let messageText = '';
    if (event.text) {
        messageText = event.text;
    } else if (event.attachments && event.attachments.length > 0) {
        messageText = event.attachments[0].text || event.attachments[0].fallback;
    } else if (event.blocks && event.blocks.length > 0) {
        messageText = event.blocks.map(block => {
            if (block.type === 'section' && block.text && block.text.text) {
                return block.text.text;
            }
            return '';
        }).join(' ');
    }

    // Перевірка обов’язкових полів
    const { channel, ts } = event;
    if (!messageText || !channel || !ts) {
        console.log(`Ignoring event: Missing required fields (text, channel, or ts). Subtype: ${event.subtype}`);
        return;
    }

    // Створюємо новий об'єкт події з нормалізованим полем тексту
    const normalizedEvent = {
        ...event,
        text: messageText,
    };

    // Виклик обробника для каналу
    if (channelHandlers[channel]) {
        console.log(`Dispatching message to handler for channel: ${channel}`);
        channelHandlers[channel](normalizedEvent);
    } else {
        console.log(`No handler found for channel: ${channel}`);
    }
}

// --------- Events (URL verification та повідомлення) ---------
router.post('/events', async (req, res) => {
    const { type, challenge } = req.body || {};

    if (type === 'url_verification') {
        return res.json({ challenge });
    }

    safeHandleSlackEvent(req.body);

    res.status(200).send('OK');
});

// --------- Slash command ---------
router.post('/commands', (req, res) => {
    const { command, text, user_id } = req.body;
    console.log(`Slash command received: ${command}, text: ${text}, from user: ${user_id}`);

    return res.json({
        response_type: 'in_channel',
        text: `Привіт <@${user_id}>, ти надіслав команду: ${text}`
    });
});

// Експортуємо router та функцію для ініціалізації
module.exports = {
    router,
    getMyBotId,
    safeHandleSlackEvent
};
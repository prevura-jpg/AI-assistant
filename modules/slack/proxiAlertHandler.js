const slackClient = require('./slackClient');

/**
 * Перевіряє чи містить повідомлення ключову фразу.
 * @param {Object} event - об'єкт події Slack.
 * @param {string} phrase - ключова фраза для пошуку.
 * @returns {boolean}
 */
function doesMessageContainPhrase(event, phrase) {
  const normalizedPhrase = phrase.toLowerCase();
 
  // 1. Перевіряємо в полі text
  if (event.text && event.text.toLowerCase().includes(normalizedPhrase)) {
    return true;
  }
 
  // 2. Перевіряємо в блоках rich_text_section
  if (event.blocks && Array.isArray(event.blocks)) {
    for (const block of event.blocks) {
      if (block.type === 'rich_text' && block.elements) {
        for (const element of block.elements) {
          if (element.type === 'rich_text_section' && element.elements) {
            for (const textElement of element.elements) {
              if (textElement.type === 'text' && textElement.text && textElement.text.toLowerCase().includes(normalizedPhrase)) {
                return true;
              }
            }
          }
        }
      }
    }
  }
 
  return false;
}

/**
 * Додає коментар до повідомлення в тред.
 * @param {string} channel - ID каналу.
 * @param {string} threadTimestamp - timestamp оригінального повідомлення.
 * @param {string} comment - текст коментаря.
 */
function addCommentToThread(channel, threadTimestamp, comment) {
  slackClient.chat.postMessage({
    channel: channel,
    text: comment,
    unfurl_links: false,
    thread_ts: threadTimestamp,
    reply_broadcast: false
  }).then(() => {
    console.log('Proxy alert comment added to thread:', comment);
  }).catch(error => {
    console.error('Error adding proxy alert comment to thread:', error.message);
  });
}

/**
 * Додає реакцію до повідомлення.
 * @param {string} channel - ID каналу.
 * @param {string} timestamp - timestamp повідомлення.
 * @param {string} reactionName - ім'я реакції.
 */
function addReactionToMessage(channel, timestamp, reactionName) {
  slackClient.reactions.add({
    channel: channel,
    timestamp: timestamp,
    name: reactionName
  }).then(() => {
    console.log(`Added reaction :${reactionName}: to message`);
  }).catch(error => {
    if (error.data && error.data.error === 'already_reacted') {
      console.log('Already reacted to this message.');
    } else {
      console.error('Error adding reaction to message:', error.message);
    }
  });
}

/**
 * Перевіряє та обробляє проксі-алерт.
 * @param {Object} event - об'єкт події Slack (text, channel, ts).
 */
function checkProxiAlert(event) {
  const { text, channel, ts } = event;
 
  // Перевіряємо чи це правильний канал
  if (channel !== process.env.SLACK_PROXI_ALERT_CHANNEL_ID) {
    console.log('Message not in proxi alert channel, ignoring');
    return;
  }
 
  console.log('Processing proxi alert:', { text: text?.substring(0, 100), channel, ts });
 
  // Перевіряємо чи містить повідомлення "Failed Proxies Alert"
  if (doesMessageContainPhrase(event, 'Failed Proxies Alert')) {
    console.log('Failed Proxies Alert detected, sending notification and adding reaction.');
 
    // Створюємо повідомлення з усіма тегами в одному коментарі
    const alertMessage = `<@${process.env.SLACK_DEV_USER_NESEN_ID}> Проблема з проксі, перегляньте, будь ласка, чи все коректно. Для інформації: <@${process.env.SLACK_OWNER_USER_RADCHENKO_ID}> <@${process.env.SLACK_OWNER_USER_REVURA_ID}>`;
 
    // Додаємо коментар у тред
    addCommentToThread(channel, ts, alertMessage);
 
    // Додаємо критичну реакцію
    addReactionToMessage(channel, ts, 'rotating_light');
 
  } else {
    console.log('Message does not contain "Failed Proxies Alert", ignoring');
  }
}

module.exports = { checkProxiAlert };





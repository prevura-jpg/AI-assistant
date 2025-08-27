const slackClient = require('./slackClient');

// Константи для алертів
const ALERT_REPEAT_SECONDS = 10;
const ALERT_ESCALATION_COOLDOWN_SECONDS = 300; // 5 хв

// Стан алертів
const alertStates = {};

/**
 * Нормалізація тексту
 */
function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Класифікація алерту
 */
function classifyAlert(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes('sqlstate') ||
      normalized.includes('connection refused') ||
      normalized.includes('an exception occurred in the driver') ||
      normalized.includes('is the server running on that host')) {
    return 'critical';
  }
  if (normalized.includes('new orders for:')) return 'info_old_parser';
  return 'repeating';
}

/**
 * Додає реакцію до повідомлення
 * @param {string} channel - ID каналу
 * @param {string} timestamp - timestamp повідомлення
 * @param {string} reactionName - назва реакції
 */
function addReaction(channel, timestamp, reactionName) {
  slackClient.reactions.add({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    timestamp,
    name: reactionName
  }).then(() => {
    console.log(`Added ${reactionName} reaction to message`);
  }).catch(err => {
    if (err.data && err.data.error !== 'already_reacted') console.error('Error adding reaction:', err.message);
  });
}

/**
 * Додає коментар до повідомлення в тред
 * @param {string} channel - ID каналу
 * @param {string} threadTimestamp - timestamp оригінального повідомлення
 * @param {string} comment - текст коментаря
 */
function addCommentToThread(channel, threadTimestamp, comment) {
  slackClient.chat.postMessage({
    channel,
    text: comment,
    unfurl_links: false,
    thread_ts: threadTimestamp,
    reply_broadcast: false
  }).then(() => {
    console.log('Comment added to thread:', comment);
  }).catch(err => console.error('Error adding comment to thread:', err.message));
}

/**
 * Критичний алерт
 */
function handleCriticalAlert(channel, ts) {
  addReaction(channel, ts, 'exclamation');
  addCommentToThread(channel, ts, 
    `<@${process.env.SLACK_DEV_USER_VITRYK_ID}> Критичний алерт! Перевірте, будь ласка, негайно. ` +
    `<@${process.env.SLACK_OWNER_USER_REVURA_ID}> для інформації.`
  );
}

/**
 * Старий парсер
 */
function handleOldParserAlert(channel, ts) {
  addReaction(channel, ts, 'exclamation');
  addCommentToThread(channel, ts,
    `<@${process.env.SLACK_DEV_USER_VITRYK_ID}> Старий парсер знайшов нові замовлення, яких нема в нотифікаціях. Перевірте, будь ласка. ` +
    `<@${process.env.SLACK_OWNER_USER_REVURA_ID}> для інформації.`
  );
}

/**
 * Повторюваний алерт
 */
function handleRepeatingAlert(normalizedText, channel, ts) {
  const now = Date.now();
  let state = alertStates[normalizedText] || { lastSeen: 0, escalated: false, lastEscalation: 0 };
  alertStates[normalizedText] = state; // Зберігаємо стан

  const timeSinceLastSeen = (now - state.lastSeen) / 1000;
  const timeSinceLastEscalation = (now - state.lastEscalation) / 1000;

  if (state.lastSeen === 0) {
    // Перший раз бачимо цей алерт, ставимо лайк
    addReaction(channel, ts, 'thumbsup');
  }

  if (timeSinceLastSeen <= ALERT_REPEAT_SECONDS && !state.escalated && timeSinceLastEscalation >= ALERT_ESCALATION_COOLDOWN_SECONDS) {
    addCommentToThread(channel, ts,
      `<@${process.env.SLACK_DEV_USER_VITRYK_ID}> Повторюваний алерт кожні 10с — перевірте, будь ласка, чи все ок. ` +
      `<@${process.env.SLACK_OWNER_USER_REVURA_ID}> для інформації.`
    );
    state.escalated = true;
    state.lastEscalation = now;
    console.log('Repeating alert escalated');
  } else if (timeSinceLastSeen > ALERT_REPEAT_SECONDS) {
    // Якщо інтервал більше 10 секунд, скидаємо прапорець ескалації
    state.escalated = false;
  }

  state.lastSeen = now;
}

/**
 * Основний обробник алерту
 */
function handleAlert(event) {
  const { text, ts, channel } = event;
  
  if (!text || !channel || !ts) {
    console.error('Missing text, channel, or timestamp in event object.');
    return;
  }
  
  const alertType = classifyAlert(text);
  const normalizedText = normalizeText(text);

  console.log(`Processing alert type: ${alertType} for text: ${text.substring(0, 100)}...`);

  switch (alertType) {
    case 'critical':
      handleCriticalAlert(channel, ts);
      break;

    case 'info_old_parser':
      handleOldParserAlert(channel, ts);
      break;

    case 'repeating':
      handleRepeatingAlert(normalizedText, channel, ts);
      break;
    default:
      console.log('Unknown alert type, ignoring.');
      break;
  }
}

module.exports = { handleAlert };

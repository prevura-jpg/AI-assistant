// managerAlertsHandler.js
const slackClient = require('./slackClient');

// --- Константи ---
const ACT_TO_DAY_BFR_REPORT_NAME = 'ActToDayBfr';
const ALERT_THRESHOLD = -3.0;
const CHECK_WINDOW_START = { hour: 13, minute: 25 };
const CHECK_WINDOW_END = { hour: 13, minute: 35 };
const CHECK_INTERVAL_MS = 60 * 1000; // 1 хвилина

const DEV_USER_BONDARENKO_ID = process.env.SLACK_DEV_USER_BONDARENKO_ID;
const OWNER_USER_REVURA_ID = process.env.SLACK_OWNER_USER_REVURA_ID;
const OWNER_USER_RADCHENKO_ID = process.env.SLACK_OWNER_USER_RADCHENKO_ID;
const MANAGER_ALERT_CHANNEL_ID = process.env.SLACK_MANAGER_ALERT_CHANNEL_ID;
const BOT_ID = process.env.SLACK_BOT_ID;

// --- Стан ---
let dailyReportReceived = false;
let processedMessages = new Set(); // щоб уникати дублювань

// --- Допоміжні функції ---
function extractNegativeDeviations(text, threshold) {
  const lines = text.split('\n');
  const deviations = [];

  for (const line of lines) {
    // шукаємо формат "дата, Маркет, -99.7%"
    const match = line.match(/,\s*([^,]+),\s*(-?\d+(\.\d+)?)%/);
    if (match) {
      const market = match[1].trim();
      const value = parseFloat(match[2]);
      if (value <= threshold) {
        deviations.push(`${market}, ${value.toFixed(1)}%`);
      }
    }
  }
  return deviations;
}

function isActToDayBfrReport(eventOrText) {
  const text = eventOrText.text ?? eventOrText;
  if (!text) return false;
  return text.trim().toLowerCase().startsWith(ACT_TO_DAY_BFR_REPORT_NAME.toLowerCase());
}

async function addReaction(channel, ts, reaction) {
  try {
    await slackClient.reactions.add({ channel, timestamp: ts, name: reaction });
    console.log(`Reacted with ${reaction}`);
  } catch (err) {
    if (err.data?.error !== 'already_reacted') {
      console.error('Error adding reaction:', err.message);
    }
  }
}

async function addCommentToThread(channel, ts, text) {
  try {
    await slackClient.chat.postMessage({
      channel,
      thread_ts: ts,
      text,
      unfurl_links: false
    });
    console.log('Added comment to thread.');
  } catch (err) {
    console.error('Error posting to thread:', err.message);
  }
}

// --- Основна логіка ---
async function checkManagerAlert(event) {
  const { text, channel, ts, bot_id } = event;

  // 1. Ігноруємо чужі канали
  if (channel !== MANAGER_ALERT_CHANNEL_ID) return;

  // 2. Ігноруємо власного бота
  if (bot_id && bot_id === BOT_ID) return;

  // 2b. Ігноруємо повідомлення, які бот вже відправив через thread_ts
  if (text && text.includes('<@' + BOT_ID + '>')) return;

  // 3. Уникаємо повторної обробки
  if (processedMessages.has(ts)) return;
  processedMessages.add(ts);

  // 4. Логіка обробки звіту
  if (isActToDayBfrReport(event)) {
    dailyReportReceived = true;
    const normalizedText = text.trim();

    // Варіант 1: no changes
    if (normalizedText.toLowerCase().includes('no changes')) {
      await addReaction(channel, ts, 'thumbsup');
      return;
    }

    // Варіант 3: пустий звіт
    if (normalizedText.toLowerCase() === ACT_TO_DAY_BFR_REPORT_NAME.toLowerCase()) {
      const msg = `<@${OWNER_USER_REVURA_ID}> <@${OWNER_USER_RADCHENKO_ID}> Звіт прийшов пустий, перевірте, будь ласка, в чому причина.`;
      await addReaction(channel, ts, 'exclamation');
      await addCommentToThread(channel, ts, msg);
      return;
    }

    // --- Варіант 2: з відхиленнями
const deviations = extractNegativeDeviations(normalizedText, ALERT_THRESHOLD);

if (deviations.length > 0) {
  const msg = `<@${OWNER_USER_REVURA_ID}> <@${OWNER_USER_RADCHENKO_ID}> Знайдено відхилення:\n` +
            deviations.map(d => `• ${d}`).join('\n') +
            `\nПеревірте, будь ласка, в чому проблема.`;
  await addReaction(channel, ts, 'exclamation');
  await addCommentToThread(channel, ts, msg);
} else {
  await addReaction(channel, ts, 'thumbsup');
}
  }
}

// --- Перевірка в проміжку 13:25–13:35 ---
async function dailyCheckWindow() {
  dailyReportReceived = false;
  const start = new Date();
  start.setHours(CHECK_WINDOW_START.hour, CHECK_WINDOW_START.minute, 0, 0);
  const end = new Date();
  end.setHours(CHECK_WINDOW_END.hour, CHECK_WINDOW_END.minute, 0, 0);

  const intervalId = setInterval(async () => {
    const now = new Date();
    if (now > end || dailyReportReceived) {
      clearInterval(intervalId);

      if (!dailyReportReceived) {
        const msg = `<@${DEV_USER_BONDARENKO_ID}> Не прийшов звіт ActToDayBfr (13:30 ±5 хв), перевірте, будь ласка, причину. Для інформації: <@${OWNER_USER_REVURA_ID}> <@${OWNER_USER_RADCHENKO_ID}>`;
        await slackClient.chat.postMessage({ channel: MANAGER_ALERT_CHANNEL_ID, text: msg, unfurl_links: false });
        console.log('Daily check notification sent.');
      } else {
        console.log('Report received – щоденний алерт не потрібен.');
      }
      return;
    }

    try {
      const oldest = Math.floor(start.getTime() / 1000);
      const latest = Math.floor(now.getTime() / 1000);

      const result = await slackClient.conversations.history({
        channel: MANAGER_ALERT_CHANNEL_ID,
        oldest: oldest.toString(),
        latest: latest.toString(),
        inclusive: true,
        limit: 50
      });

      if (result.messages.some(msg => isActToDayBfrReport(msg.text))) {
        dailyReportReceived = true;
      }
    } catch (err) {
      console.error('Error checking report:', err.message);
    }
  }, CHECK_INTERVAL_MS);
}

// --- Автозапуск щодня ---
function scheduleNextDailyCheck() {
  const now = new Date();
  const nextCheck = new Date();
  nextCheck.setHours(CHECK_WINDOW_START.hour, CHECK_WINDOW_START.minute, 0, 0);
  if (now > nextCheck) nextCheck.setDate(nextCheck.getDate() + 1);

  const waitMs = nextCheck.getTime() - now.getTime();
  setTimeout(() => {
    dailyCheckWindow();
    scheduleNextDailyCheck(); // плануємо на наступний день
  }, waitMs);
}

function initDailyCheck() {
  console.log('Initializing daily manager alert check...');
  scheduleNextDailyCheck();
}

module.exports = {
  checkManagerAlert,
  initDailyCheck
};

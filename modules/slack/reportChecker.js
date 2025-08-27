// modules/slack/reportChecker.js

let todayChecked = false;
let lastCheckDate = null;
let slackClientInstance = null; // Збережений Slack WebClient

/**
 * Обробник для подій в каналі звітів.
 * Додає реакцію 'thumbsup' до повідомлення, що містить "Warehouse Statistics".
 * @param {Object} event - Об'єкт події з повідомленням
 */
async function handleWarehouseReport(event) {
  if (
    event.text &&
    event.text.toLowerCase().includes('warehouse statistics') &&
    !event.subtype
  ) {
    // ⬅️ Видалено фільтр !event.bot_id, щоб обробляти повідомлення від бота.
    console.log('Warehouse report detected, adding thumbsup...');
    try {
      await slackClientInstance.reactions.add({
        token: process.env.SLACK_BOT_TOKEN,
        channel: event.channel,
        timestamp: event.ts,
        name: 'thumbsup'
      });
      console.log('✅ Added thumbsup reaction to report message');

      // Позначаємо, що звіт вже є
      todayChecked = true;
      lastCheckDate = new Date().toDateString();
    } catch (error) {
      if (error.data && error.data.error === 'already_reacted') {
        console.log('ℹ️ Already reacted with thumbsup');
      } else {
        console.error('❌ Error adding reaction to report:', error.message);
      }
    }
  }
}

/**
 * Ініціалізує перевірку звітів про склад
 * @param {Object} slackClient - Інстанс Slack WebClient
 */
function initReportChecker(slackClient) {
  console.log('Initializing report checker...');
  slackClientInstance = slackClient;

  setInterval(() => {
    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const today = now.toDateString();

    // Перевірка рівно о 12:30
    if (currentTime === '12:30:00' && (!todayChecked || lastCheckDate !== today)) {
      console.log('⏰ 12:30 reached — checking if warehouse report arrived...');

      const today12PM = new Date(now);
      today12PM.setHours(12, 0, 0, 0);
      const oldestTimestamp = Math.floor(today12PM.getTime() / 1000);

      slackClient.conversations.history({
        channel: process.env.SLACK_WAREHOUSE_ALERT_CHANNEL_ID,
        oldest: oldestTimestamp,
        limit: 100
      }).then((result) => {
        if (result.ok && result.messages) {
          const hasWarehouseReport = result.messages.some(message => {
            return (
              message.text &&
              message.text.toLowerCase().includes('warehouse statistics') &&
              !message.subtype
              // ⬅️ Видалено фільтр !message.bot_id
            );
          });

          if (!hasWarehouseReport) {
            console.log('❌ No warehouse report found by 12:30, notifying owner...');
            return slackClient.chat.postMessage({
              channel: process.env.SLACK_WAREHOUSE_ALERT_CHANNEL_ID,
              text: `<@${process.env.SLACK_OWNER_USER_REVURA_ID}> Звіт Warehouse Statistics не прийшов до 12:30, перевірте, будь ласка, причину.`,
              unfurl_links: false
            });
          } else {
            console.log('✅ Warehouse report was found, no notification needed.');
          }
        }
      }).then(() => {
        todayChecked = true;
        lastCheckDate = today;
        console.log('📌 Report check completed for today');
      }).catch((error) => {
        console.error('❌ Error during report check:', error.message);
      });
    }
  }, 1000); // Перевіряємо щосекунди (щоб точно зловити "12:30:00")
}

module.exports = { initReportChecker, handleWarehouseReport };
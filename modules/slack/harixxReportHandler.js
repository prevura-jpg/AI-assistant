const slackClient = require('./slackClient');

// Константи для налаштувань
const SUMMARY_CHECK_TIME_HOUR = 10;
const SUMMARY_CHECK_TIME_MINUTE_END = 3;

// Час, коли має спрацювати перевірка на наявність звітів
const SHOP_BUSINESS_CHECK_TIME_HOUR = 10;
// Ми перевіряємо після 10:05, тому ставимо 10:06, щоб бути впевненими, що період минув
const SHOP_BUSINESS_CHECK_MINUTE = 6; 

const TROUBLE_PERCENTAGE_THRESHOLD = 7; // Поріг для TrPerc

// Змінні стану для відстеження щоденної перевірки
let summaryReportReceived = false;
let shopReportReceived = false;
let businessReportReceived = false;
let lastCheckDate = null;
let summaryCheckCompleted = false;
let shopBusinessCheckCompleted = false;

/**
 * Перевіряє чи містить повідомлення ключову фразу
 * @param {Object} event - об'єкт події Slack
 * @param {string} phrase - ключова фраза для пошуку
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
 * Знаходить значення TrPerc у тексті повідомлення
 * @param {string} text - текст повідомлення
 * @returns {number|null} - знайдене значення TrPerc або null
 */
function extractTrPercValue(text) {
  if (!text) return null;
  
  // Регулярний вираз для пошуку TrPerc у форматі таблиці
  const trPercRegex = /\|\s*([\d\.]+)\s*\|$/m;
  const matches = text.match(trPercRegex);

  if (matches && matches.length > 1) {
    return parseFloat(matches[1]);
  }
  
  return null;
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
    channel: channel,
    timestamp: timestamp,
    name: reactionName
  }).then(() => {
    console.log(`Added ${reactionName} reaction to message`);
  }).catch(error => {
    if (error.data && error.data.error === 'already_reacted') {
      console.log(`Already reacted with ${reactionName}`);
    } else {
      console.error(`Error adding ${reactionName} reaction:`, error.message);
    }
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
    channel: channel,
    text: comment,
    unfurl_links: false,
    thread_ts: threadTimestamp,
    reply_broadcast: false
  }).then(() => {
    console.log('Comment added to thread:', comment);
  }).catch(error => {
    console.error('Error adding comment to thread:', error.message);
  });
}

/**
 * Перевіряє та обробляє Harixx звіт
 * @param {Object} event - об'єкт події Slack (text, channel, ts)
 */
function checkHarixxReport(event) {
  const { text, channel, ts } = event;
  
  // Перевіряємо чи це правильний канал
  if (channel !== process.env.SLACK_HARIXX_REPORT_CHANNEL_ID) {
    console.log('Message not in Harixx report channel, ignoring');
    return;
  }
  
  console.log('Processing Harixx report:', { text: text?.substring(0, 100), channel, ts });
  
  // Перевіряємо тип звіту
  const isSummaryReport = doesMessageContainPhrase(event, 'Summary report');
  const isShopReport = doesMessageContainPhrase(event, 'Report by shop');
  // Оновлена перевірка для 'Report for business'
  const isBusinessReport = doesMessageContainPhrase(event, 'Business');
  
  if (isSummaryReport) {
    console.log('Summary Report detected');
    summaryReportReceived = true;
    
    // Перевіряємо TrPerc
    const trPercValue = extractTrPercValue(text);
    
    if (trPercValue !== null) {
      console.log('TrPerc value found:', trPercValue);
      
      if (trPercValue < TROUBLE_PERCENTAGE_THRESHOLD) {
        console.log('TrPerc is below threshold, adding thumbsup');
        addReaction(channel, ts, 'thumbsup');
      } else {
        console.log('TrPerc is above threshold, escalating alert');
        
        // Тегуємо користувачів у треді
        const alertMessage = `<@${process.env.SLACK_OWNER_USER_RADCHENKO_ID}> Візьміть, будь ласка, в роботу - прийшло відхилееня >7%. Для інформації: <@${process.env.SLACK_OWNER_USER_REVURA_ID}>`;
        
        addCommentToThread(channel, ts, alertMessage);
        addReaction(channel, ts, 'exclamation');
      }
    } else {
      console.log('TrPerc value not found, adding thumbsup');
      addReaction(channel, ts, 'thumbsup');
    }
  } else if (isShopReport) {
    console.log('Report by Shop detected');
    shopReportReceived = true;
    
  } else if (isBusinessReport) {
    console.log('Report by Business detected');
    businessReportReceived = true;
    
  } else {
    console.log('Message does not match any known report type, ignoring');
  }
}

/**
 * Відправляє повідомлення про відсутність звіту
 * @param {string} reportType - тип звіту
 * @param {string} channel - ID каналу
 */
function sendMissingReportNotification(reportType, channel) {
  let message = `<@${process.env.SLACK_DEV_USER_BONDARENKO_ID}> Не прийшов звіт ${reportType}, перевірте, будь ласка, в чому причина. Для інформації: <@${process.env.SLACK_OWNER_USER_REVURA_ID}> <@${process.env.SLACK_OWNER_USER_RADCHENKO_ID}>`;
  
  slackClient.chat.postMessage({
    channel: channel,
    text: message,
    unfurl_links: false
  }).then(() => {
    console.log(`Missing ${reportType} notification sent`);
  }).catch(error => {
    console.error(`Error sending missing ${reportType} notification:`, error.message);
  });
}

/**
 * Ініціалізує щоденну перевірку Harixx звітів
 */
function initDailyHarixxCheck() {
  console.log('Initializing daily Harixx report check...');
  
  // Запускаємо перевірку кожну хвилину
  setInterval(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const today = now.toDateString();
    
    // Перевіряємо, чи настав новий день. Якщо так, скидаємо всі прапорці.
    if (lastCheckDate !== today) {
      summaryReportReceived = false;
      shopReportReceived = false;
      businessReportReceived = false;
      summaryCheckCompleted = false;
      shopBusinessCheckCompleted = false;
      lastCheckDate = today;
      console.log(`New day started. Resetting all report flags for ${today}`);
    }
    
    // Перевірка на відсутність Summary Report.
    // Спрацює один раз, коли час стане 10:04, якщо звіт не було отримано.
    if (!summaryCheckCompleted && 
        currentHour === SUMMARY_CHECK_TIME_HOUR && 
        currentMinute === SUMMARY_CHECK_TIME_MINUTE_END + 1) {
      
      console.log('Summary Report check time (10:04) reached...');
      
      if (!summaryReportReceived) {
        console.log('Summary Report not received, sending notification');
        sendMissingReportNotification('Summary report', process.env.SLACK_HARIXX_REPORT_CHANNEL_ID);
      } else {
        console.log('Summary Report already received today');
      }
      
      summaryCheckCompleted = true;
    }
    
    // Перевірка на відсутність Shop та Business Report.
    // Спрацює один раз, коли час стане 10:06, якщо звіти не було отримано.
    if (!shopBusinessCheckCompleted && 
        currentHour === SHOP_BUSINESS_CHECK_TIME_HOUR && 
        currentMinute === SHOP_BUSINESS_CHECK_MINUTE) {
      
      console.log('Shop and Business Report check time (10:06) reached...');
      
      if (!shopReportReceived) {
        console.log('Report by Shop not received, sending notification');
        sendMissingReportNotification('Report by shop', process.env.SLACK_HARIXX_REPORT_CHANNEL_ID);
      } else {
        console.log('Report by Shop already received today');
      }
      
      if (!businessReportReceived) {
        console.log('Report by Business not received, sending notification');
        sendMissingReportNotification('Report by Business', process.env.SLACK_HARIXX_REPORT_CHANNEL_ID);
      } else {
        console.log('Report by Business already received today');
      }
      
      shopBusinessCheckCompleted = true;
    }
  }, 60000); // Перевіряємо кожну хвилину
}

module.exports = { checkHarixxReport, initDailyHarixxCheck };




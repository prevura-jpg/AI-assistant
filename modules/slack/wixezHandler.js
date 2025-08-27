const slackClient = require('./slackClient');

/**
 * Перевіряє, чи містить повідомлення ключову фразу, шукаючи її як в полі text, так і в блоках
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
 * Обробляє алерт про видалення формули постачальника Wixez
 * @param {Object} event - об'єкт події Slack (повинен містити text, channel, ts)
 */
function handleWixezAlert(event) {
  const { text, channel, ts, blocks } = event;
  
  // Використовуємо функцію для надійної перевірки
  if (doesMessageContainPhrase(event, 'Supplier Formula Deleted')) {
    console.log('Wixez alert detected: Supplier Formula Deleted');
    
    // Додаємо реакцію exclamation до оригінального повідомлення
    slackClient.reactions.add({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channel,
      timestamp: ts,
      name: 'exclamation'
    }).then(() => {
      console.log('Added exclamation reaction to Wixez alert');
    }).catch(error => {
      if (error.data && error.data.error === 'already_reacted') {
        console.log('Already reacted with exclamation');
      } else {
        console.error('Error adding exclamation reaction:', error.message);
      }
    });
    
    // Надсилаємо повідомлення власнику як відповідь в тред (потік)
    slackClient.chat.postMessage({
      channel: channel,
      text: `<@${process.env.SLACK_OWNER_USER_REVURA_ID}> Видалена формула на Безкосі, перевірте, будь ласка, чи все коректно.`,
      unfurl_links: false,
      thread_ts: ts // Цей параметр відправляє повідомлення як відповідь на оригінал
    }).then(() => {
      console.log('Wixez alert notification sent to owner in a thread');
    }).catch(error => {
      console.error('Error sending Wixez alert notification:', error.message);
    });
  } else {
    console.log('Message does not contain "Supplier Formula Deleted", ignoring');
  }
}

module.exports = { handleWixezAlert };




